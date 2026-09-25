import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../src/core/database/tenant-transaction';
import { createMigrationBuiltSchemaFixture } from '../support/migration-built-schema.helper';
import { normalizeTenantSlug } from '../../src/modules/tenant/tenant-slug';

/**
 * Issue #512 T3.S1 part B: tenant isolation for the catalog tables
 * `products` and `insumos`.
 *
 * The schema is built by RUNNING THE FULL MIGRATION SET (via
 * test/support/migration-built-schema.helper.ts), so the RLS shape asserted
 * here is migration 1809250000000's own output — never a hand-written copy.
 * The application-shaped connection is the fixture's runtime role:
 * `NOSUPERUSER NOBYPASSRLS`, owner of nothing, holding exactly ordinary
 * SELECT/INSERT/UPDATE/DELETE on the scratch schema's tables. Under FORCEd
 * row-level security every query it makes is subject to the migrated
 * policies; the superuser connection exists only to seed tenants and two
 * tenants' catalog rows.
 *
 * Every runtime-role observation runs inside a transaction that binds the
 * tenant context with the production SQL (TENANT_CONTEXT_SET_CONFIG_SQL,
 * transaction-local) and is then ROLLED BACK: the GUC is discarded with the
 * transaction, so the pool is never left with a defined-and-empty
 * `app.tenant_id` (the issue #358 poisoning), and the runtime role never
 * mutates the fixtures. An insert "success" is proven inside its own
 * transaction — the statement returning a row IS the WITH CHECK passing.
 *
 * Both tables carry a foreign key `tenant_id -> tenants(id)`, so real tenant
 * rows are seeded for every synthetic tenant context used below (A, B own the
 * seeded visibility/update/delete probes; C and D are fresh contexts for the
 * INSERT proofs). Neither table has a unique constraint on `name` — the only
 * catalog uniqueness is `(tenant_id, id)` — which is exactly why the
 * same-name cross-tenant case below is meaningful: without RLS an identical
 * `name` makes both tenants' rows mutually readable and writable through a
 * name lookup.
 */

const TABLES = ['products', 'insumos'] as const;

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? 5432),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

const poolCleanupExtra = { extra: { allowExitOnIdle: true } };

/**
 * Runs `assertion` on the runtime role inside a rolled-back transaction,
 * bound to `tenantId` through the production set_config binding (or
 * genuinely unbound when `tenantId` is null).
 */
async function asRuntimeRole<T>(
  runtime: DataSource,
  tenantId: string | null,
  assertion: (
    runner: ReturnType<DataSource['createQueryRunner']>,
  ) => Promise<T>,
): Promise<T> {
  const runner = runtime.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    if (tenantId !== null) {
      await runner.query(TENANT_CONTEXT_SET_CONFIG_SQL, [tenantId]);
    }
    return await assertion(runner);
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
  }
}

/**
 * TypeORM's postgres query runner hands DML-with-RETURNING results back as
 * `[rows, affectedRowCount]` while SELECTs arrive as a plain rows array.
 * Normalizes both shapes to the rows array so assertions read on `id`.
 */
function returningRows(
  result: unknown,
): Array<{ id: string; tenant_id?: string }> {
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0] as Array<{ id: string }>;
  }
  return (Array.isArray(result) ? result : []) as Array<{ id: string }>;
}

describe('catalog products/insumos tenant RLS (Real PostgreSQL DB, migration-built schema)', () => {
  jest.setTimeout(180000);

  let admin: DataSource;
  let runtime: DataSource;
  let schema: string;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;

  // A and B own the seeded probes; C and D are fresh synthetic tenant
  // contexts for the INSERT proofs (an own-tenant INSERT bound to A or B
  // would sit next to seeded rows, and C/D keep the WITH CHECK proofs free
  // of any unique-constraint interference). All four exist as real tenant
  // rows because both catalog tables FK to tenants(id).
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const tenantCId = randomUUID();
  const tenantDId = randomUUID();

  // Founder decision (issue #512, founder decision 3): two tenants holding a
  // product and an insumo with an IDENTICAL name.
  const SHARED_PRODUCT_NAME = 'Shared Catalog Item';
  const SHARED_INSUMO_NAME = 'Shared Insumo Item';

  const productAId = randomUUID();
  const productBId = randomUUID();
  const insumoAId = randomUUID();
  const insumoBId = randomUUID();

  beforeAll(async () => {
    fixture = await createMigrationBuiltSchemaFixture();
    schema = fixture.schema;
    process.stdout.write(
      `[timing] migration-built setup = ${fixture.setupDurationMs} ms (migrations alone: ${fixture.migrationDurationMs} ms)\n`,
    );

    // Superuser connection: seeding and catalog facts only. It bypasses the
    // FORCED row-level security, which is what makes cross-tenant seeding
    // possible. search_path is pinned so unqualified SQL lands in the
    // scratch schema.
    admin = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema,
      ...poolCleanupExtra,
      extra: {
        ...poolCleanupExtra.extra,
        options: `-c search_path=${schema},public`,
      },
    });
    await admin.initialize();

    // Real tenant rows first: both catalog tables FK to tenants(id).
    await admin.query(
      `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $9), ($3, $4, $10), ($5, $6, $11), ($7, $8, $12)`,
      [
        tenantAId,
        'catalog-rls-tenant-a',
        tenantBId,
        'catalog-rls-tenant-b',
        tenantCId,
        'catalog-rls-tenant-c',
        tenantDId,
        'catalog-rls-tenant-d',
                normalizeTenantSlug('catalog-rls-tenant-a'),
        normalizeTenantSlug('catalog-rls-tenant-b'),
        normalizeTenantSlug('catalog-rls-tenant-c'),
        normalizeTenantSlug('catalog-rls-tenant-d'),
      ],
    );

    // Seed one same-named row per tenant per table. `name` is NOT NULL on
    // both tables and there is NO unique constraint on it, so identical
    // names across tenants are ordinary production data.
    await admin.query(
      `INSERT INTO products (id, tenant_id, name, uom)
       VALUES ($1, $2, $3, 'unidad'), ($4, $5, $3, 'unidad')`,
      [productAId, tenantAId, SHARED_PRODUCT_NAME, productBId, tenantBId],
    );
    await admin.query(
      `INSERT INTO insumos (id, tenant_id, name, "purchaseUom", "consumptionUom")
       VALUES ($1, $2, $3, 'kg', 'kg'), ($4, $5, $3, 'kg', 'kg')`,
      [insumoAId, tenantAId, SHARED_INSUMO_NAME, insumoBId, tenantBId],
    );

    // The fixture's runtime role: NOSUPERUSER NOBYPASSRLS, non-owner, exact
    // ordinary DML grants. Production-shaped for RLS evaluation.
    runtime = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      username: fixture.runtimeRoleName,
      password: fixture.runtimeRolePassword,
      ...poolCleanupExtra,
    });
    await runtime.initialize();
  });

  afterAll(async () => {
    if (runtime?.isInitialized) await runtime.destroy();
    if (admin?.isInitialized) await admin.destroy();
    if (fixture) await fixture.close();
  });

  it('seeds both tenants through the superuser and proves the runtime role is a table non-owner that cannot bypass RLS', async () => {
    const seeded = await admin.query(
      `SELECT (SELECT count(*)::int FROM products) AS products,
              (SELECT count(*)::int FROM insumos) AS insumos`,
    );
    expect(seeded[0]).toEqual({ products: 2, insumos: 2 });

    const role = (
      await admin.query(
        `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1`,
        [fixture.runtimeRoleName],
      )
    )[0];
    expect(role).toBeDefined();
    expect(role.rolsuper).toBe(false);
    expect(role.rolbypassrls).toBe(false);

    const ownership = await admin.query(
      `SELECT count(*)::int AS count
         FROM pg_tables
        WHERE schemaname = $1
          AND tablename IN ('products', 'insumos')
          AND tableowner = $2`,
      [schema, fixture.runtimeRoleName],
    );
    expect(ownership[0].count).toBe(0);
  });

  it('enables AND forces row level security on both catalog tables with exactly one command-specific policy per command', async () => {
    const facts = await admin.query(
      `SELECT c.relname, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1
          AND c.relname IN ('products', 'insumos')
        ORDER BY c.relname`,
      [schema],
    );

    expect(facts).toEqual([
      { relname: 'insumos', rls_enabled: true, rls_forced: true },
      { relname: 'products', rls_enabled: true, rls_forced: true },
    ]);

    for (const table of TABLES) {
      const policies = await admin.query(
        `SELECT policyname, cmd FROM pg_policies WHERE schemaname = $1 AND tablename = $2 ORDER BY policyname`,
        [schema, table],
      );
      // EXACTLY the four command policies: an extra policy would widen
      // access beyond the tenant contract, a missing one narrows it.
      expect(policies).toEqual([
        { policyname: `${table}_tenant_delete`, cmd: 'DELETE' },
        { policyname: `${table}_tenant_insert`, cmd: 'INSERT' },
        { policyname: `${table}_tenant_select`, cmd: 'SELECT' },
        { policyname: `${table}_tenant_update`, cmd: 'UPDATE' },
      ]);
    }
  });

  it('denies an unbound runtime role every row of both catalog tables', async () => {
    await asRuntimeRole(runtime, null, async (runner) => {
      for (const table of TABLES) {
        const rows = (await runner.query(
          `SELECT count(*)::int AS count FROM ${table}`,
        )) as Array<{ count: number }>;
        expect(rows[0].count).toBe(0);
      }
    });
  });

  it('shows tenant A only its own rows in both tables, never tenant B’s', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const products = (await runner.query(
        `SELECT id FROM products`,
      )) as Array<{ id: string }>;
      expect(products.map((r) => r.id)).toEqual([productAId]);

      const insumos = (await runner.query(`SELECT id FROM insumos`)) as Array<{
        id: string;
      }>;
      expect(insumos.map((r) => r.id)).toEqual([insumoAId]);
    });
  });

  it('shows tenant B only its own rows (triangulation)', async () => {
    await asRuntimeRole(runtime, tenantBId, async (runner) => {
      const products = (await runner.query(
        `SELECT id FROM products`,
      )) as Array<{ id: string }>;
      expect(products.map((r) => r.id)).toEqual([productBId]);

      const insumos = (await runner.query(`SELECT id FROM insumos`)) as Array<{
        id: string;
      }>;
      expect(insumos.map((r) => r.id)).toEqual([insumoBId]);
    });
  });

  it('accepts a tenant-bound runtime role inserting its own rows into both catalog tables', async () => {
    // Bound to tenant C: the own-tenant INSERT is the WITH CHECK half
    // passing. Proven inside the rolled-back transaction — the statement
    // returning its row IS the success. Column lists respect each table's
    // NOT NULL shape (products.uom, insumos purchase/consumption UoM).
    await asRuntimeRole(runtime, tenantCId, async (runner) => {
      const insertedProduct = returningRows(
        await runner.query(
          `INSERT INTO products (tenant_id, name, uom) VALUES ($1, 'insert-proof-product', 'unidad') RETURNING id, tenant_id`,
          [tenantCId],
        ),
      );
      expect(insertedProduct).toHaveLength(1);
      expect(insertedProduct[0].tenant_id).toBe(tenantCId);

      const insertedInsumo = returningRows(
        await runner.query(
          `INSERT INTO insumos (tenant_id, name, "purchaseUom", "consumptionUom")
           VALUES ($1, 'insert-proof-insumo', 'kg', 'kg') RETURNING id, tenant_id`,
          [tenantCId],
        ),
      );
      expect(insertedInsumo).toHaveLength(1);
      expect(insertedInsumo[0].tenant_id).toBe(tenantCId);
    });
  });

  it('rejects a tenant-bound runtime role inserting a foreign-tenant row into either catalog table', async () => {
    // Bound to tenant C, inserting tenant D: a fresh synthetic foreign
    // value, so pre-policy the write itself goes through (no unique or FK
    // conflict masks the behavioral failure) and post-policy the WITH CHECK
    // clause rejects it. One transaction per rejection: the first WITH CHECK
    // failure aborts its transaction, which would otherwise poison the
    // second statement with "current transaction is aborted".
    await asRuntimeRole(runtime, tenantCId, async (runner) => {
      await expect(
        runner.query(
          `INSERT INTO products (tenant_id, name, uom) VALUES ($1, 'foreign-proof-product', 'unidad') RETURNING id`,
          [tenantDId],
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    await asRuntimeRole(runtime, tenantCId, async (runner) => {
      await expect(
        runner.query(
          `INSERT INTO insumos (tenant_id, name, "purchaseUom", "consumptionUom")
           VALUES ($1, 'foreign-proof-insumo', 'kg', 'kg') RETURNING id`,
          [tenantDId],
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it('lets tenant A update and delete its own rows in both catalog tables', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const updatedProduct = returningRows(
        await runner.query(
          `UPDATE products SET "sellPrice" = 123.45 WHERE id = $1 RETURNING id`,
          [productAId],
        ),
      );
      expect(updatedProduct.map((r) => r.id)).toEqual([productAId]);

      const updatedInsumo = returningRows(
        await runner.query(
          `UPDATE insumos SET stock = stock + 1 WHERE id = $1 RETURNING id`,
          [insumoAId],
        ),
      );
      expect(updatedInsumo.map((r) => r.id)).toEqual([insumoAId]);

      // Delete of throwaway own rows: insert then delete inside the same
      // transaction, proving DELETE's USING clause admits tenant A's rows.
      const throwawayProduct = returningRows(
        await runner.query(
          `INSERT INTO products (tenant_id, name, uom) VALUES ($1, 'delete-proof-product', 'unidad') RETURNING id`,
          [tenantAId],
        ),
      );
      const deletedProduct = returningRows(
        await runner.query(`DELETE FROM products WHERE id = $1 RETURNING id`, [
          throwawayProduct[0].id,
        ]),
      );
      expect(deletedProduct.map((r) => r.id)).toEqual([throwawayProduct[0].id]);

      const throwawayInsumo = returningRows(
        await runner.query(
          `INSERT INTO insumos (tenant_id, name, "purchaseUom", "consumptionUom")
           VALUES ($1, 'delete-proof-insumo', 'kg', 'kg') RETURNING id`,
          [tenantAId],
        ),
      );
      const deletedInsumo = returningRows(
        await runner.query(`DELETE FROM insumos WHERE id = $1 RETURNING id`, [
          throwawayInsumo[0].id,
        ]),
      );
      expect(deletedInsumo.map((r) => r.id)).toEqual([throwawayInsumo[0].id]);
    });
  });

  it('stops tenant A’s UPDATE and DELETE from touching tenant B’s rows in either catalog table', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const updatedProduct = returningRows(
        await runner.query(
          `UPDATE products SET "sellPrice" = 999.99 WHERE id = $1 RETURNING id`,
          [productBId],
        ),
      );
      expect(updatedProduct).toEqual([]);

      const updatedInsumo = returningRows(
        await runner.query(
          `UPDATE insumos SET stock = stock + 1 WHERE id = $1 RETURNING id`,
          [insumoBId],
        ),
      );
      expect(updatedInsumo).toEqual([]);

      const deletedProduct = returningRows(
        await runner.query(`DELETE FROM products WHERE id = $1 RETURNING id`, [
          productBId,
        ]),
      );
      expect(deletedProduct).toEqual([]);

      const deletedInsumo = returningRows(
        await runner.query(`DELETE FROM insumos WHERE id = $1 RETURNING id`, [
          insumoBId,
        ]),
      );
      expect(deletedInsumo).toEqual([]);
    });
  });

  describe('same-name cross-tenant catalog isolation (founder decision, issue #512 T3.S1)', () => {
    // VACUITY GUARD — what each assertion below would look like if row level
    // security were ABSENT on products/insumos (or bypassed by the role):
    //
    //   SELECT id FROM products WHERE name = 'Shared Catalog Item'
    //     -> TWO rows, sorted [productAId, productBId] — both tenants' rows.
    //   UPDATE products SET ... WHERE name = 'Shared Catalog Item' RETURNING id
    //     -> TWO rows — tenant A would mutate tenant B's row through the name.
    //   INSERT with tenant_id = tenantAId while bound to tenant C
    //     -> ACCEPTED — a row lands in tenant A's catalog without binding.
    //
    // Every `toEqual` below pins EXACTLY ONE id (or zero rows), so a missing
    // or bypassed policy makes these tests fail on the extra foreign row —
    // they cannot pass vacuously.
    it('returns each tenant exactly its own row on a name lookup, never the other tenant’s identical name', async () => {
      await asRuntimeRole(runtime, tenantAId, async (runner) => {
        const products = (await runner.query(
          `SELECT id FROM products WHERE name = $1`,
          [SHARED_PRODUCT_NAME],
        )) as Array<{ id: string }>;
        expect(products.map((r) => r.id)).toEqual([productAId]);

        const insumos = (await runner.query(
          `SELECT id FROM insumos WHERE name = $1`,
          [SHARED_INSUMO_NAME],
        )) as Array<{ id: string }>;
        expect(insumos.map((r) => r.id)).toEqual([insumoAId]);
      });

      await asRuntimeRole(runtime, tenantBId, async (runner) => {
        const products = (await runner.query(
          `SELECT id FROM products WHERE name = $1`,
          [SHARED_PRODUCT_NAME],
        )) as Array<{ id: string }>;
        expect(products.map((r) => r.id)).toEqual([productBId]);

        const insumos = (await runner.query(
          `SELECT id FROM insumos WHERE name = $1`,
          [SHARED_INSUMO_NAME],
        )) as Array<{ id: string }>;
        expect(insumos.map((r) => r.id)).toEqual([insumoBId]);
      });
    });

    it('scopes a name-based UPDATE to the bound tenant’s own row only', async () => {
      // A name-keyed write is the realistic catalog mutation shape; under an
      // absent policy it would RETURN both tenants' ids and overwrite B's row.
      await asRuntimeRole(runtime, tenantAId, async (runner) => {
        const updatedProducts = returningRows(
          await runner.query(
            `UPDATE products SET "sellPrice" = 55.50 WHERE name = $1 RETURNING id`,
            [SHARED_PRODUCT_NAME],
          ),
        );
        expect(updatedProducts.map((r) => r.id)).toEqual([productAId]);

        const updatedInsumos = returningRows(
          await runner.query(
            `UPDATE insumos SET stock = stock + 1 WHERE name = $1 RETURNING id`,
            [SHARED_INSUMO_NAME],
          ),
        );
        expect(updatedInsumos.map((r) => r.id)).toEqual([insumoAId]);
      });
    });

    it('rejects a foreign-tenant INSERT carrying the identical name', async () => {
      // Bound to C, writing tenant A's tenant_id with the shared name: the
      // name matches A's catalog row textually, and only the WITH CHECK
      // half stands between this statement and A's catalog.
      await asRuntimeRole(runtime, tenantCId, async (runner) => {
        await expect(
          runner.query(
            `INSERT INTO products (tenant_id, name, uom) VALUES ($1, $2, 'unidad') RETURNING id`,
            [tenantAId, SHARED_PRODUCT_NAME],
          ),
        ).rejects.toThrow(/row-level security/i);
      });

      await asRuntimeRole(runtime, tenantCId, async (runner) => {
        await expect(
          runner.query(
            `INSERT INTO insumos (tenant_id, name, "purchaseUom", "consumptionUom")
             VALUES ($1, $2, 'kg', 'kg') RETURNING id`,
            [tenantAId, SHARED_INSUMO_NAME],
          ),
        ).rejects.toThrow(/row-level security/i);
      });
    });
  });
});
