import { randomUUID } from 'crypto';
import { readdirSync } from 'fs';
import { resolve } from 'path';
import { DataSource, type QueryRunner } from 'typeorm';
import { BackfillProductCategoryCodes1809560000000 } from './1809560000000-BackfillProductCategoryCodes';

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required for DB-backed migration tests`);
  }

  return value;
}

function readPostgresPort(): number {
  const value = process.env.DB_PORT?.trim() ?? '5432';
  const port = Number(value);

  if (!Number.isInteger(port)) {
    throw new Error(
      'DB_PORT must be a valid integer for DB-backed migration tests',
    );
  }

  return port;
}

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: readPostgresPort(),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: getRequiredEnv('DB_PASSWORD'),
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

/** Collects the migration files TypeORM would register through the data-source glob. */
function collectMigrationPaths(): string[] {
  const migrationsDir = resolve(__dirname);

  return readdirSync(migrationsDir)
    .filter(
      (file) =>
        /^\d{13}-[A-Za-z0-9]+\.ts$/.test(file) && !file.includes('.spec.'),
    )
    .sort()
    .map((file) => resolve(migrationsDir, file));
}

const TENANT_SOHO = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';

interface ScratchHarness {
  /** Superuser query runner connected to the scratch database. */
  runner: QueryRunner;
  /**
   * Runs the assertion body connected as the production-shaped migration
   * role: non-superuser table owner of products and catalog_values with
   * NOBYPASSRLS. The connection is opened and torn down per call.
   */
  asMigrationRole: (
    body: (runner: QueryRunner) => Promise<void>,
  ) => Promise<void>;
}

/**
 * Builds a fresh scratch database (name ends in `_scratch`, never the dev
 * `omnifood` database), runs the REAL migration set inside it as a
 * superuser, transfers ownership of the two RLS-affected tables to a
 * non-superuser NOBYPASSRLS role, and hands both connections to the
 * assertion. The role mirrors the production migration role per the
 * precedent in 1809180000000-ReconcileEnumColumns.db.spec.ts and the trap
 * documented in 1809510000000-BackfillTemplateProductTypes.ts.
 *
 * Cleanup is best-effort in a finally: the probe connection is destroyed,
 * the scratch database dropped WITH (FORCE) — which terminates surviving
 * probe connections — and the probe role dropped last (it owns objects only
 * in the dropped database). If any cleanup step fails the leftover name is
 * printed, never silently ignored.
 */
async function withMigrationBuiltScratchDatabase(
  assertion: (harness: ScratchHarness) => Promise<void>,
): Promise<void> {
  // Guard-suffixed names only: `_scratch` per the scratch-name contract.
  const database = `backfill_cat_codes_${randomUUID().replace(/-/g, '')}_scratch`;
  const role = `backfill_cat_codes_role_${randomUUID().replace(/-/g, '')}`;
  const admin = new DataSource({ type: 'postgres', ...postgresConnection });
  let adminInitialized = false;
  let scratch: DataSource | undefined;

  try {
    await admin.initialize();
    adminInitialized = true;
    const adminRunner = admin.createQueryRunner();
    await adminRunner.connect();
    await adminRunner.query(`CREATE DATABASE "${database}"`);

    // Build the schema exclusively with the real migration set, exactly
    // like a migrated environment (AddReportIndexes.db.spec.ts harness).
    scratch = new DataSource({
      type: 'postgres',
      host: postgresConnection.host,
      port: postgresConnection.port,
      username: postgresConnection.username,
      password: postgresConnection.password,
      database,
      migrations: collectMigrationPaths(),
    });
    await scratch.initialize();
    await scratch.runMigrations();
    const scratchRunner = scratch.createQueryRunner();
    await scratchRunner.connect();

    // The superuser runner handed to the assertion is connected to the
    // scratch database — NEVER to the admin connection's database (the dev
    // `omnifood`), which is used only to create/drop the scratch database
    // and the probe role.

    // Production position: the migration role is a non-superuser table
    // owner with NOBYPASSRLS, so FORCE ROW LEVEL SECURITY applies to it.
    await scratchRunner.query(
      `CREATE ROLE "${role}" LOGIN PASSWORD 'backfill-probe-only' ` +
        `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`,
    );
    await scratchRunner.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
    await scratchRunner.query(`ALTER TABLE products OWNER TO "${role}"`);
    await scratchRunner.query(`ALTER TABLE catalog_values OWNER TO "${role}"`);

    const asMigrationRole = async (
      body: (runner: QueryRunner) => Promise<void>,
    ): Promise<void> => {
      const probe = new DataSource({
        type: 'postgres',
        host: postgresConnection.host,
        port: postgresConnection.port,
        username: role,
        password: 'backfill-probe-only',
        database,
      });
      try {
        await probe.initialize();
        const probeRunner = probe.createQueryRunner();
        await probeRunner.connect();
        try {
          await body(probeRunner);
        } finally {
          if (probeRunner.isReleased === false) {
            await probeRunner.release();
          }
        }
      } finally {
        await probe.destroy();
      }
    };

    try {
      await assertion({ runner: scratchRunner, asMigrationRole });
    } finally {
      if (scratchRunner.isReleased === false) {
        await scratchRunner.release();
      }
      await scratch.destroy();
      scratch = undefined;
    }
  } finally {
    try {
      if (adminInitialized) {
        const cleanup = new DataSource({
          type: 'postgres',
          ...postgresConnection,
        });
        try {
          await cleanup.initialize();
          await cleanup.query(
            `DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`,
          );
          await cleanup.query(`DROP ROLE IF EXISTS "${role}"`);
        } catch (cleanupError) {
          console.error(
            `LEFTOVER SCRATCH NAMES from ${database}: ` +
              `${cleanupError instanceof Error ? cleanupError.message : cleanupError}`,
          );
        } finally {
          await cleanup.destroy();
        }
      }
    } finally {
      if (adminInitialized) {
        await admin.destroy();
      }
    }
  }
}

async function insertTenant(
  runner: QueryRunner,
  tenantId: string,
): Promise<void> {
  // Schema-aware: probe, then insert the slug only when the column exists
  // (mirrors the established DB spec pattern for frozen legacy schemas).
  const slugColumn = await runner.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_name = 'tenants' AND column_name = 'slug'`,
  );
  const withSlug = Array.isArray(slugColumn) && slugColumn.length > 0;
  await runner.query(
    withSlug
      ? `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)`
      : `INSERT INTO tenants (id, name) VALUES ($1, $2)`,
    withSlug
      ? [tenantId, `tenant-${tenantId}`, `tenant-${tenantId}`]
      : [tenantId, `tenant-${tenantId}`],
  );
}

async function insertProduct(
  runner: QueryRunner,
  tenantId: string,
  name: string,
  categoryCode: string | null,
): Promise<void> {
  // Superuser seeding bypasses RLS; bind the tenant anyway so every seeded
  // row would also pass its own policy.
  await runner.query(`SELECT set_config('app.tenant_id', $1, 't')`, [tenantId]);
  await runner.query(
    `INSERT INTO products (tenant_id, name, uom, category_code)
     VALUES ($1, $2, 'unit', $3)`,
    [tenantId, name, categoryCode],
  );
}

async function insertCatalogRow(
  runner: QueryRunner,
  tenantId: string,
  code: string,
  label: string,
  sortOrder: number,
): Promise<void> {
  await runner.query(`SELECT set_config('app.tenant_id', $1, 't')`, [tenantId]);
  await runner.query(
    `INSERT INTO catalog_values (tenant_id, catalog_type, code, label, is_active, sort_order)
     VALUES ($1, 'SALES_PRODUCT_CATEGORY', $2, $3, true, $4)`,
    [tenantId, code, label, sortOrder],
  );
}

async function isForceRowLevelSecurity(
  runner: QueryRunner,
  table: string,
): Promise<boolean> {
  const rows = (await runner.query(
    `SELECT c.relforcerowsecurity AS forced
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = current_schema()
        AND c.relname = $1`,
    [table],
  )) as Array<{ forced: boolean }>;

  expect(rows).toHaveLength(1);

  return rows[0].forced === true;
}

interface CatalogRowShape {
  code: string;
  label: string;
  sort_order: number;
}

async function catalogRowsAs(
  runner: QueryRunner,
  tenantId: string,
): Promise<CatalogRowShape[]> {
  // Session-scoped bind, re-set before every read (never RESET: after a
  // RESET ALL, current_setting('app.tenant_id', true) returns '' and the
  // policy's ::uuid cast throws instead of yielding NULL).
  await runner.query(`SELECT set_config('app.tenant_id', $1, 'f')`, [tenantId]);
  const rows = (await runner.query(
    `SELECT code, label, sort_order
       FROM catalog_values
      WHERE catalog_type = 'SALES_PRODUCT_CATEGORY'
      ORDER BY sort_order, code`,
  )) as CatalogRowShape[];

  return rows;
}

async function productCategoryCodesAs(
  runner: QueryRunner,
  tenantId: string,
): Promise<Array<string | null>> {
  await runner.query(`SELECT set_config('app.tenant_id', $1, 'f')`, [tenantId]);
  const rows = (await runner.query(
    `SELECT category_code FROM products ORDER BY name`,
  )) as Array<{ category_code: string | null }>;

  return rows.map((r) => r.category_code);
}

describe('BackfillProductCategoryCodes1809560000000 (db)', () => {
  const TEST_TIMEOUT_MS = 240000;
  const isDbTest = Boolean(process.env.DB_PASSWORD);
  const itDb = isDbTest ? it : it.skip;
  const migration = new BackfillProductCategoryCodes1809560000000();

  itDb(
    'repairs a SOHO-shaped tenant through the production NOBYPASSRLS owner position, and the bracket is what makes it work',
    async () => {
      await withMigrationBuiltScratchDatabase(
        async ({ runner, asMigrationRole }) => {
          // -- Seed --------------------------------------------------------
          // Tenant A: shaped like the measured SOHO tenant — free-text
          // category_code values, ZERO SALES_PRODUCT_CATEGORY rows.
          await insertTenant(runner, TENANT_SOHO);
          await insertProduct(runner, TENANT_SOHO, 'Espresso', 'CAFÉ CALIENTE');
          await insertProduct(
            runner,
            TENANT_SOHO,
            'Capuccino',
            'CAFÉ CALIENTE',
          );
          await insertProduct(
            runner,
            TENANT_SOHO,
            'Iced coffee',
            'CAFÉ HELADO',
          );
          await insertProduct(runner, TENANT_SOHO, 'Water', 'BEBIDAS');
          await insertProduct(runner, TENANT_SOHO, 'Nacatamal', 'COMIDA');

          // Tenant B: a pre-existing category row (whose label must never
          // change), a NULL and an empty-category product, a colliding pair
          // normalizing to one code, and one already-canonical product.
          await insertTenant(runner, TENANT_B);
          await insertCatalogRow(
            runner,
            TENANT_B,
            'BEBIDAS',
            'Bebidas del menú original',
            7,
          );
          await insertProduct(runner, TENANT_B, 'Mystery', null);
          await insertProduct(runner, TENANT_B, 'Blank', '');
          await insertProduct(runner, TENANT_B, 'Hot tea', 'CAFÉ CALIENTE');
          await insertProduct(runner, TENANT_B, 'Hot coffee', 'CAFE CALIENTE');
          await insertProduct(runner, TENANT_B, 'Soda', 'BEBIDAS');

          // -- The trap, demonstrated on the real database ----------------
          // Connected as the non-superuser table owner (NOBYPASSRLS) with
          // FORCE RLS in effect and no app.tenant_id bound, the owner sees
          // ZERO rows: without the migration's NO FORCE bracket, up() would
          // read an empty tenant list and log a clean no-op on exactly the
          // database it exists to repair.
          await asMigrationRole(async (probeRunner) => {
            const hidden = (await probeRunner.query(
              'SELECT count(*)::int AS n FROM products',
            )) as Array<{ n: number }>;
            expect(hidden[0].n).toBe(0);

            const tenantProbe = (await probeRunner.query(
              `SELECT DISTINCT tenant_id
                 FROM products
                WHERE category_code IS NOT NULL
                  AND btrim(category_code) <> ''
                ORDER BY tenant_id`,
            )) as Array<{ tenant_id: string }>;
            expect(tenantProbe).toHaveLength(0);
          });

          // FORCE is on before the run and the migration role really is the owner.
          expect(await isForceRowLevelSecurity(runner, 'products')).toBe(true);
          expect(await isForceRowLevelSecurity(runner, 'catalog_values')).toBe(
            true,
          );

          // -- Run the migration AS the production-shaped role -------------
          const logSpy = jest
            .spyOn(console, 'log')
            .mockImplementation(() => undefined);
          const logs: string[] = [];
          logSpy.mockImplementation((message: string) => {
            logs.push(message);
          });

          try {
            await asMigrationRole(async (probeRunner) => {
              await migration.up(probeRunner);
            });
          } finally {
            logSpy.mockRestore();
          }

          // The repair actually happened: the bracket lifted FORCE for the
          // owner, so the tenant probe above the migration runs saw rows and
          // the backfill executed for real (not the silent no-op the trap
          // would have produced — proven by the created rows below).
          expect(
            logs.some((l) =>
              l.includes(
                "created SALES_PRODUCT_CATEGORY 'CAFE_CALIENTE' label='CAFÉ CALIENTE'",
              ),
            ),
          ).toBe(true);

          // FORCE is restored on both tables after the run.
          expect(await isForceRowLevelSecurity(runner, 'products')).toBe(true);
          expect(await isForceRowLevelSecurity(runner, 'catalog_values')).toBe(
            true,
          );

          // -- Resulting rows, per tenant, seen through RLS-bound reads ----
          await asMigrationRole(async (probeRunner) => {
            const soho = await catalogRowsAs(probeRunner, TENANT_SOHO);
            expect(soho.map((r) => r.code)).toEqual([
              'BEBIDAS',
              'CAFE_CALIENTE',
              'CAFE_HELADO',
              'COMIDA',
            ]);
            // Deterministic sort_order: an empty catalog starts at 1.
            expect(soho.map((r) => r.sort_order)).toEqual([1, 2, 3, 4]);
            const caliente = soho.find((r) => r.code === 'CAFE_CALIENTE');
            expect(caliente?.label).toBe('CAFÉ CALIENTE');

            expect(
              await productCategoryCodesAs(probeRunner, TENANT_SOHO),
            ).toEqual([
              // ORDER BY name: Capuccino, Espresso, Iced coffee, Nacatamal, Water.
              'CAFE_CALIENTE',
              'CAFE_CALIENTE',
              'CAFE_HELADO',
              'COMIDA',
              'BEBIDAS',
            ]);

            // Tenant B: the pre-existing row was REUSED, label and
            // sort_order untouched; the collision folded onto one row with
            // the code-unit-first original as its label; sort_order
            // continues after the tenant's maximum (7 -> 8).
            const b = await catalogRowsAs(probeRunner, TENANT_B);
            expect(b.map((r) => r.code)).toEqual(['BEBIDAS', 'CAFE_CALIENTE']);
            expect(b[0].label).toBe('Bebidas del menú original');
            expect(b[0].sort_order).toBe(7);
            expect(b[1].label).toBe('CAFE CALIENTE');
            expect(b[1].sort_order).toBe(8);

            // NULL/empty category codes were not invented.
            expect(await productCategoryCodesAs(probeRunner, TENANT_B)).toEqual(
              [
                // ORDER BY name: Blank, Hot coffee, Hot tea, Mystery, Soda.
                '',
                'CAFE_CALIENTE',
                'CAFE_CALIENTE',
                null,
                'BEBIDAS',
              ],
            );

            // -- Tenant isolation -----------------------------------------
            // Bound to SOHO, the owner sees only SOHO's rows in both tables;
            // tenant B's catalog row is invisible, and vice versa.
            const sohoCatalog = await catalogRowsAs(probeRunner, TENANT_SOHO);
            expect(new Set(sohoCatalog.map((r) => r.code))).toEqual(
              new Set(['BEBIDAS', 'CAFE_CALIENTE', 'CAFE_HELADO', 'COMIDA']),
            );
            const bCatalog = await catalogRowsAs(probeRunner, TENANT_B);
            expect(bCatalog.map((r) => r.label)).not.toContain('CAFÉ CALIENTE');
          });

          // -- Idempotency: a second up() is a real no-op ------------------
          const logSpy2 = jest
            .spyOn(console, 'log')
            .mockImplementation(() => undefined);
          const logs2: string[] = [];
          logSpy2.mockImplementation((message: string) => {
            logs2.push(message);
          });
          try {
            await asMigrationRole(async (probeRunner) => {
              await migration.up(probeRunner);
            });
          } finally {
            logSpy2.mockRestore();
          }
          expect(
            logs2.some((l) =>
              l.includes(
                'no-op: nothing to create or update (database already converged)',
              ),
            ),
          ).toBe(true);

          await asMigrationRole(async (probeRunner) => {
            const soho = await catalogRowsAs(probeRunner, TENANT_SOHO);
            expect(soho).toHaveLength(4);
            const b = await catalogRowsAs(probeRunner, TENANT_B);
            expect(b).toHaveLength(2);
            expect(
              await productCategoryCodesAs(probeRunner, TENANT_SOHO),
            ).toEqual([
              'CAFE_CALIENTE',
              'CAFE_CALIENTE',
              'CAFE_HELADO',
              'COMIDA',
              'BEBIDAS',
            ]);
          });
        },
      );
    },
    TEST_TIMEOUT_MS,
  );
});
