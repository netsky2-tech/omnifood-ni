import { randomUUID } from 'crypto';
import { readdirSync } from 'fs';
import { resolve } from 'path';
import { DataSource, type QueryRunner } from 'typeorm';
import { PromotionTargetCategoryIdToUuid1809570000000 } from './1809570000000-PromotionTargetCategoryIdToUuid';

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

  return (
    readdirSync(migrationsDir)
      .filter(
        (file) =>
          /^\d{13}-[A-Za-z0-9]+\.ts$/.test(file) && !file.includes('.spec.'),
      )
      // The migration under test is NOT part of the build: the harness seeds
      // pre-migration free-text values into the varchar column, then executes
      // up() itself, connected as the migration role.
      .filter((file) => !file.startsWith('1809570000000-'))
      .sort()
      .map((file) => resolve(migrationsDir, file))
  );
}

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const TENANT_C = '33333333-3333-4333-8333-333333333333';

interface ScratchHarness {
  /** Superuser query runner connected to the scratch database. */
  runner: QueryRunner;
  /**
   * Runs the assertion body connected as the production-shaped migration
   * role: non-superuser table owner of promotions and catalog_values with
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
 * assertion. Same harness contract as
 * 1809560000000-BackfillProductCategoryCodes.db.spec.ts.
 *
 * Cleanup is best-effort in a finally: the scratch database is dropped WITH
 * (FORCE) and the probe role dropped last. If any cleanup step fails the
 * leftover name is printed, never silently ignored.
 */
async function withMigrationBuiltScratchDatabase(
  assertion: (harness: ScratchHarness) => Promise<void>,
): Promise<void> {
  // Guard-suffixed names only: `_scratch` per the scratch-name contract.
  const database = `promo_target_cat_${randomUUID().replace(/-/g, '')}_scratch`;
  const role = `promo_target_cat_role_${randomUUID().replace(/-/g, '')}`;
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

    // Production position: the migration role is a non-superuser table
    // owner with NOBYPASSRLS, so FORCE ROW LEVEL SECURITY applies to it.
    await scratchRunner.query(
      `CREATE ROLE "${role}" LOGIN PASSWORD 'promo-probe-only' ` +
        `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`,
    );
    await scratchRunner.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
    // Same grant the production migration role gets
    // (scripts/verify-schema-build.sh): CREATE on the schema, because this
    // migration's up() creates an index (CREATE INDEX requires schema
    // CREATE since PostgreSQL 15-era privilege checks).
    await scratchRunner.query(`GRANT CREATE ON SCHEMA public TO "${role}"`);
    await scratchRunner.query(`ALTER TABLE promotions OWNER TO "${role}"`);
    await scratchRunner.query(`ALTER TABLE catalog_values OWNER TO "${role}"`);

    const asMigrationRole = async (
      body: (runner: QueryRunner) => Promise<void>,
    ): Promise<void> => {
      const probe = new DataSource({
        type: 'postgres',
        host: postgresConnection.host,
        port: postgresConnection.port,
        username: role,
        password: 'promo-probe-only',
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

async function insertPromotion(
  runner: QueryRunner,
  tenantId: string,
  name: string,
  targetCategoryId: string | null,
  isActive = true,
): Promise<void> {
  // Superuser seeding bypasses RLS; bind the tenant anyway so every seeded
  // row would also pass its own policy.
  await runner.query(`SELECT set_config('app.tenant_id', $1, 't')`, [tenantId]);
  await runner.query(
    `INSERT INTO promotions (tenant_id, name, target_category_id, is_active)
     VALUES ($1, $2, $3, $4)`,
    [tenantId, name, targetCategoryId, isActive],
  );
}

async function insertCatalogRow(
  runner: QueryRunner,
  tenantId: string,
  catalogType: string,
  code: string,
  label: string,
  sortOrder: number,
): Promise<string> {
  await runner.query(`SELECT set_config('app.tenant_id', $1, 't')`, [tenantId]);
  const rows = (await runner.query(
    `INSERT INTO catalog_values (tenant_id, catalog_type, code, label, is_active, sort_order)
     VALUES ($1, $2, $3, $4, true, $5)
     RETURNING id`,
    [tenantId, catalogType, code, label, sortOrder],
  )) as Array<Array<{ id: string }>> | Array<{ id: string }>;
  const flat = Array.isArray(rows[0])
    ? (rows[0] as Array<{ id: string }>)
    : (rows as Array<{ id: string }>);
  return flat[0].id;
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

interface PromotionRowShape {
  id: string;
  name: string;
  target_category_id: string | null;
  is_active: boolean;
}

async function promotionsAs(
  runner: QueryRunner,
  tenantId: string,
): Promise<PromotionRowShape[]> {
  // Session-scoped bind, re-set before every read (never RESET: after a
  // RESET ALL, current_setting('app.tenant_id', true) returns '' and the
  // policy's ::uuid cast throws instead of yielding NULL).
  await runner.query(`SELECT set_config('app.tenant_id', $1, 'f')`, [tenantId]);
  const rows = (await runner.query(
    `SELECT id, name, target_category_id, is_active
       FROM promotions
      ORDER BY name`,
  )) as PromotionRowShape[];

  return rows;
}

async function columnDataType(runner: QueryRunner): Promise<string | null> {
  const rows = (await runner.query(
    `SELECT data_type
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'promotions'
        AND column_name = 'target_category_id'`,
  )) as Array<{ data_type: string }>;

  return rows.length > 0 ? rows[0].data_type : null;
}

describe('PromotionTargetCategoryIdToUuid1809570000000 (db)', () => {
  const TEST_TIMEOUT_MS = 240000;
  const isDbTest = Boolean(process.env.DB_PASSWORD);
  const itDb = isDbTest ? it : it.skip;
  const migration = new PromotionTargetCategoryIdToUuid1809570000000();

  let catalogAId: string;

  itDb(
    'attaches, deactivates and type-converts through the production NOBYPASSRLS owner position, and the bracket is what makes it work',
    async () => {
      await withMigrationBuiltScratchDatabase(
        async ({ runner, asMigrationRole }) => {
          // -- Seed --------------------------------------------------------
          await insertTenant(runner, TENANT_A);
          await insertTenant(runner, TENANT_B);
          await insertTenant(runner, TENANT_C);

          // Tenant A: a resolvable free-text value (the measured SOHO
          // shape) plus a global promotion that must stay untouched.
          catalogAId = await insertCatalogRow(
            runner,
            TENANT_A,
            'SALES_PRODUCT_CATEGORY',
            'CAFE_CALIENTE',
            'Café Caliente',
            1,
          );
          await insertPromotion(
            runner,
            TENANT_A,
            'Café del día',
            'CAFÉ CALIENTE',
          );
          await insertPromotion(runner, TENANT_A, 'Global A', null);

          // Tenant A: blank and whitespace-only ACTIVE targets — the cast
          // would turn exactly these into NULL while active (the global
          // trap through the second door). After the run they must be NULL
          // **and** is_active = false — never NULL and active.
          await insertPromotion(runner, TENANT_A, 'Blank target', '');
          await insertPromotion(runner, TENANT_A, 'Whitespace target', '   ');

          // Tenant B: an unresolvable ACTIVE promotion — the NULL trap.
          // After the run it must be NULL **and** is_active = false.
          await insertPromotion(
            runner,
            TENANT_B,
            'Promo huérfana',
            'CAFÉ CALIENTE',
          );

          // Tenant C: the text resolves only to a row of a DIFFERENT
          // catalog type — it must NOT attach.
          await insertCatalogRow(
            runner,
            TENANT_C,
            'UOM',
            'CAFE_CALIENTE',
            'Taza',
            1,
          );
          const uomCId = await insertCatalogRow(
            runner,
            TENANT_C,
            'SALES_PRODUCT_CATEGORY',
            'POSTRES',
            'Postres',
            2,
          );
          await insertPromotion(
            runner,
            TENANT_C,
            'Wrong type C',
            'CAFE_CALIENTE',
          );

          // -- The trap, demonstrated on the real database ----------------
          // Connected as the non-superuser table owner (NOBYPASSRLS) with
          // FORCE RLS in effect and no app.tenant_id bound, the owner sees
          // ZERO rows: without the migration's NO FORCE bracket, up() would
          // read an empty tenant list and log a clean no-op on exactly the
          // database it exists to repair.
          await asMigrationRole(async (probeRunner) => {
            const hidden = (await probeRunner.query(
              'SELECT count(*)::int AS n FROM promotions',
            )) as Array<{ n: number }>;
            expect(hidden[0].n).toBe(0);

            const tenantProbe = (await probeRunner.query(
              `SELECT DISTINCT tenant_id
                 FROM promotions
                WHERE target_category_id IS NOT NULL
                  AND btrim(target_category_id) <> ''
                ORDER BY tenant_id`,
            )) as Array<{ tenant_id: string }>;
            expect(tenantProbe).toHaveLength(0);
          });

          // FORCE is on before the run and the migration role really is the owner.
          expect(await isForceRowLevelSecurity(runner, 'promotions')).toBe(
            true,
          );
          expect(await isForceRowLevelSecurity(runner, 'catalog_values')).toBe(
            true,
          );
          expect(await columnDataType(runner)).toBe('character varying');

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

          // The migration actually ran: the column is uuid now, with the
          // composite tenant FK, and FORCE is restored on both tables.
          expect(await columnDataType(runner)).toBe('uuid');
          const fk = (await runner.query(
            `SELECT 1 FROM pg_constraint
              WHERE conname = 'fk_promotions_target_category_tenant'
                AND conrelid = 'promotions'::regclass`,
          )) as unknown[];
          expect(fk).toHaveLength(1);
          expect(await isForceRowLevelSecurity(runner, 'promotions')).toBe(
            true,
          );
          expect(await isForceRowLevelSecurity(runner, 'catalog_values')).toBe(
            true,
          );

          expect(
            logs.some((l) =>
              l.includes(
                `tenant ${TENANT_A}: attached 1 promotion(s) to SALES_PRODUCT_CATEGORY 'CAFE_CALIENTE'`,
              ),
            ),
          ).toBe(true);
          const deactivateLog = logs.find((l) =>
            l.includes(
              "deactivated (unresolvable target_category_id 'CAFÉ CALIENTE')",
            ),
          );
          expect(deactivateLog).toBeDefined();
          expect(deactivateLog).toContain(TENANT_B);
          expect(deactivateLog).toContain('Promo huérfana');
          const blankLog = logs.find((l) =>
            l.includes('blank target_category_id destined for NULL'),
          );
          expect(blankLog).toBeDefined();
          expect(blankLog).toContain('Blank target');

          // -- Resulting rows, per tenant, seen through RLS-bound reads ----
          await asMigrationRole(async (probeRunner) => {
            const a = await promotionsAs(probeRunner, TENANT_A);
            const cafe = a.find((p) => p.name === 'Café del día');
            expect(cafe?.target_category_id).toBe(catalogAId);
            expect(cafe?.is_active).toBe(true);

            const globalA = a.find((p) => p.name === 'Global A');
            expect(globalA?.target_category_id).toBeNull();
            expect(globalA?.is_active).toBe(true);

            // The blank-target trap, closed on the real database: NULL and
            // is_active = false, never NULL and active.
            const blankTarget = a.find((p) => p.name === 'Blank target');
            expect(blankTarget?.target_category_id).toBeNull();
            expect(blankTarget?.is_active).toBe(false);
            const whitespaceTarget = a.find(
              (p) => p.name === 'Whitespace target',
            );
            expect(whitespaceTarget?.target_category_id).toBeNull();
            expect(whitespaceTarget?.is_active).toBe(false);

            const b = await promotionsAs(probeRunner, TENANT_B);
            const orphan = b.find((p) => p.name === 'Promo huérfana');
            expect(orphan?.target_category_id).toBeNull();
            expect(orphan?.is_active).toBe(false);

            const c = await promotionsAs(probeRunner, TENANT_C);
            const wrongType = c.find((p) => p.name === 'Wrong type C');
            expect(wrongType?.target_category_id).toBeNull();
            expect(wrongType?.is_active).toBe(false);

            // -- The invariant, asserted on the real rows ----------------
            // No promotion that carried any non-null text target_category_id
            // before the run (resolvable, unresolvable or blank) may be NULL
            // and still active. The only NULL+active rows allowed in this
            // database are the ones seeded NULL (global by design).
            for (const row of [...a, ...b, ...c]) {
              if (row.name === 'Global A') {
                continue;
              }
              expect(
                row.target_category_id !== null || row.is_active === false,
              ).toBe(true);
            }
            // The FK really is enforced: attaching another TENANT's catalog
            // row id is rejected by the composite (tenant_id, id) FK — the
            // promotion is tenant A's, the target row is tenant C's.
            await probeRunner.query(
              `SELECT set_config('app.tenant_id', $1, 'f')`,
              [TENANT_A],
            );
            await expect(
              probeRunner.query(
                `UPDATE promotions SET target_category_id = $1 WHERE name = 'Global A'`,
                [uomCId],
              ),
            ).rejects.toThrow(/violates foreign key constraint/);
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
                'no-op: promotions.target_category_id is already uuid (database already converged)',
              ),
            ),
          ).toBe(true);

          await asMigrationRole(async (probeRunner) => {
            const b = await promotionsAs(probeRunner, TENANT_B);
            const orphan = b.find((p) => p.name === 'Promo huérfana');
            expect(orphan?.target_category_id).toBeNull();
            expect(orphan?.is_active).toBe(false);
          });
        },
      );
    },
    TEST_TIMEOUT_MS,
  );
});
