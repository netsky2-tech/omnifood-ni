import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../src/core/database/tenant-transaction';
import { createMigrationBuiltSchemaFixture } from '../support/migration-built-schema.helper';

/**
 * Issue #512 T3 slice 3: tenant isolation for the inventory tables
 * `warehouses`, `suppliers`, `shrinkages` and `production_orders`.
 *
 * The schema is built by RUNNING THE FULL MIGRATION SET (via
 * test/support/migration-built-schema.helper.ts), so the RLS shape asserted
 * here is migration 1809270000000's own output — never a hand-written copy.
 * The application-shaped connection is the fixture's runtime role:
 * `NOSUPERUSER NOBYPASSRLS`, owner of nothing, holding exactly ordinary
 * SELECT/INSERT/UPDATE/DELETE on the scratch schema's tables. Under FORCEd
 * row-level security every query it makes is subject to the migrated
 * policies; the superuser connection exists only to seed tenants and the
 * fixture rows.
 *
 * Every runtime-role observation runs inside a transaction that binds the
 * tenant context with the production SQL (TENANT_CONTEXT_SET_CONFIG_SQL,
 * transaction-local) and is then ROLLED BACK: the GUC is discarded with the
 * transaction, so the pool is never left with a defined-and-empty
 * `app.tenant_id` (the issue #358 poisoning), and the runtime role never
 * mutates the fixtures. An insert "success" is proven inside its own
 * transaction — the statement returning a row IS the WITH CHECK passing.
 *
 * Real-schema constraint hygiene (nothing may mask the RLS verdict):
 * - All four tables FK `tenant_id -> tenants(id)`, so real tenant rows are
 *   seeded for every synthetic tenant context used below.
 * - None of the four tables carries a further tenant-scoped FK parent:
 *   `production_orders.recipe_version_id` is a plain varchar in the
 *   bootstrap migration (1759000000002) with no FK constraint, and
 *   `shrinkage_details` / `production_order_lines` hang OFF these tables
 *   (parent-owned, out of scope for this slice), so seeding needs only the
 *   tenant rows. Every insert proof below therefore fails (or passes) on
 *   RLS alone, never on a missing FK parent.
 * - `shrinkages` and `production_orders` have no production repository
 *   write path today (ShrinkageService records SHRINKAGE inventory
 *   movements; production.service.ts writes `production_batch_history`),
 *   so their probe rows are seeded through the superuser connection inside
 *   this fixture and the policies are exercised directly here — the
 *   inert-but-declared contract is still proven against the real engine.
 */

const TABLES = [
  'warehouses',
  'suppliers',
  'shrinkages',
  'production_orders',
] as const;

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

describe('inventory tenant RLS (Real PostgreSQL DB, migration-built schema)', () => {
  jest.setTimeout(180000);

  let admin: DataSource;
  let runtime: DataSource;
  let schema: string;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;

  // A and B own the seeded probes; C and D are fresh synthetic tenant
  // contexts for the INSERT proofs (an own-tenant INSERT bound to A or B
  // would sit next to seeded rows, and C/D keep the WITH CHECK proofs free
  // of interference). All four exist as real tenant rows because all four
  // tables FK to tenants(id).
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const tenantCId = randomUUID();
  const tenantDId = randomUUID();

  // Seeded probe rows, one per tenant per table (A and B).
  const warehouseAId = randomUUID();
  const warehouseBId = randomUUID();
  const supplierAId = randomUUID();
  const supplierBId = randomUUID();
  const shrinkageAId = randomUUID();
  const shrinkageBId = randomUUID();
  const productionOrderAId = randomUUID();
  const productionOrderBId = randomUUID();

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

    // Real tenant rows first: all four tables FK to tenants(id).
    await admin.query(
      `INSERT INTO tenants (id, name) VALUES ($1, $2), ($3, $4), ($5, $6), ($7, $8)`,
      [
        tenantAId,
        'inventory-rls-tenant-a',
        tenantBId,
        'inventory-rls-tenant-b',
        tenantCId,
        'inventory-rls-tenant-c',
        tenantDId,
        'inventory-rls-tenant-d',
      ],
    );

    // Seeded probes, one row per table per tenant A and B.
    await admin.query(
      `INSERT INTO warehouses (id, tenant_id, name) VALUES ($1, $2, 'rls-warehouse-a'), ($3, $4, 'rls-warehouse-b')`,
      [warehouseAId, tenantAId, warehouseBId, tenantBId],
    );
    await admin.query(
      `INSERT INTO suppliers (id, tenant_id, name) VALUES ($1, $2, 'rls-supplier-a'), ($3, $4, 'rls-supplier-b')`,
      [supplierAId, tenantAId, supplierBId, tenantBId],
    );
    await admin.query(
      `INSERT INTO shrinkages (id, tenant_id, shrinkage_type) VALUES ($1, $2, 'SPOILAGE'), ($3, $4, 'SPOILAGE')`,
      [shrinkageAId, tenantAId, shrinkageBId, tenantBId],
    );
    await admin.query(
      `INSERT INTO production_orders (id, tenant_id, recipe_version_id, planned_quantity)
       VALUES ($1, $2, 'seed-version-a', 10), ($3, $4, 'seed-version-b', 10)`,
      [productionOrderAId, tenantAId, productionOrderBId, tenantBId],
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
      `SELECT (SELECT count(*)::int FROM warehouses) AS warehouses,
              (SELECT count(*)::int FROM suppliers) AS suppliers,
              (SELECT count(*)::int FROM shrinkages) AS shrinkages,
              (SELECT count(*)::int FROM production_orders) AS production_orders`,
    );
    expect(seeded[0]).toEqual({
      warehouses: 2,
      suppliers: 2,
      shrinkages: 2,
      production_orders: 2,
    });

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
          AND tablename IN ('warehouses', 'suppliers', 'shrinkages', 'production_orders')
          AND tableowner = $2`,
      [schema, fixture.runtimeRoleName],
    );
    expect(ownership[0].count).toBe(0);
  });

  it('enables AND forces row level security on all four inventory tables with exactly one command-specific policy per command', async () => {
    const facts = await admin.query(
      `SELECT c.relname, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1
          AND c.relname IN ('warehouses', 'suppliers', 'shrinkages', 'production_orders')
        ORDER BY c.relname`,
      [schema],
    );

    expect(facts).toEqual([
      { relname: 'production_orders', rls_enabled: true, rls_forced: true },
      { relname: 'shrinkages', rls_enabled: true, rls_forced: true },
      { relname: 'suppliers', rls_enabled: true, rls_forced: true },
      { relname: 'warehouses', rls_enabled: true, rls_forced: true },
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

  it('denies an unbound runtime role every row of all four tables', async () => {
    await asRuntimeRole(runtime, null, async (runner) => {
      for (const table of TABLES) {
        const rows = (await runner.query(
          `SELECT count(*)::int AS count FROM ${table}`,
        )) as Array<{ count: number }>;
        expect(rows[0].count).toBe(0);
      }
    });
  });

  it('shows tenant A only its own rows in all four tables, never tenant B’s', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const own = {
        warehouses: warehouseAId,
        suppliers: supplierAId,
        shrinkages: shrinkageAId,
        production_orders: productionOrderAId,
      } as const;
      for (const [table, id] of Object.entries(own)) {
        const rows = (await runner.query(`SELECT id FROM ${table}`)) as Array<{
          id: string;
        }>;
        expect(rows.map((r) => r.id)).toEqual([id]);
      }
    });
  });

  it('shows tenant B only its own rows in all four tables (triangulation)', async () => {
    await asRuntimeRole(runtime, tenantBId, async (runner) => {
      const own = {
        warehouses: warehouseBId,
        suppliers: supplierBId,
        shrinkages: shrinkageBId,
        production_orders: productionOrderBId,
      } as const;
      for (const [table, id] of Object.entries(own)) {
        const rows = (await runner.query(`SELECT id FROM ${table}`)) as Array<{
          id: string;
        }>;
        expect(rows.map((r) => r.id)).toEqual([id]);
      }
    });
  });

  it('accepts a tenant-bound runtime role inserting its own rows into all four tables', async () => {
    // Bound to tenant C: the own-tenant INSERT is the WITH CHECK half
    // passing. Proven inside the rolled-back transaction — the statement
    // returning its row IS the success.
    await asRuntimeRole(runtime, tenantCId, async (runner) => {
      const insertedWarehouse = returningRows(
        await runner.query(
          `INSERT INTO warehouses (tenant_id, name)
           VALUES ($1, 'rls-warehouse-c') RETURNING id, tenant_id`,
          [tenantCId],
        ),
      );
      expect(insertedWarehouse).toHaveLength(1);
      expect(insertedWarehouse[0].tenant_id).toBe(tenantCId);

      const insertedSupplier = returningRows(
        await runner.query(
          `INSERT INTO suppliers (tenant_id, name)
           VALUES ($1, 'rls-supplier-c') RETURNING id, tenant_id`,
          [tenantCId],
        ),
      );
      expect(insertedSupplier).toHaveLength(1);
      expect(insertedSupplier[0].tenant_id).toBe(tenantCId);

      const insertedShrinkage = returningRows(
        await runner.query(
          `INSERT INTO shrinkages (tenant_id, shrinkage_type)
           VALUES ($1, 'DAMAGE') RETURNING id, tenant_id`,
          [tenantCId],
        ),
      );
      expect(insertedShrinkage).toHaveLength(1);
      expect(insertedShrinkage[0].tenant_id).toBe(tenantCId);

      const insertedProductionOrder = returningRows(
        await runner.query(
          `INSERT INTO production_orders (tenant_id, recipe_version_id, planned_quantity)
           VALUES ($1, 'c-version-1', 3.5) RETURNING id, tenant_id`,
          [tenantCId],
        ),
      );
      expect(insertedProductionOrder).toHaveLength(1);
      expect(insertedProductionOrder[0].tenant_id).toBe(tenantCId);
    });
  });

  it('rejects a tenant-bound runtime role inserting a foreign-tenant row into any of the four tables', async () => {
    // Bound to tenant C, inserting tenant D: a fresh synthetic foreign
    // value, so pre-policy the write itself goes through and post-policy
    // the WITH CHECK clause rejects it. One transaction per rejection: the
    // first WITH CHECK failure aborts its transaction, which would
    // otherwise poison the next statement with "current transaction is
    // aborted".
    await asRuntimeRole(runtime, tenantCId, async (runner) => {
      await expect(
        runner.query(
          `INSERT INTO warehouses (tenant_id, name)
           VALUES ($1, 'rls-warehouse-foreign') RETURNING id`,
          [tenantDId],
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    await asRuntimeRole(runtime, tenantCId, async (runner) => {
      await expect(
        runner.query(
          `INSERT INTO suppliers (tenant_id, name)
           VALUES ($1, 'rls-supplier-foreign') RETURNING id`,
          [tenantDId],
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    await asRuntimeRole(runtime, tenantCId, async (runner) => {
      await expect(
        runner.query(
          `INSERT INTO shrinkages (tenant_id, shrinkage_type)
           VALUES ($1, 'DAMAGE') RETURNING id`,
          [tenantDId],
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    await asRuntimeRole(runtime, tenantCId, async (runner) => {
      await expect(
        runner.query(
          `INSERT INTO production_orders (tenant_id, recipe_version_id, planned_quantity)
           VALUES ($1, 'd-version-1', 3.5) RETURNING id`,
          [tenantDId],
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it('lets tenant A update and delete its own rows in all four tables', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const updatedWarehouse = returningRows(
        await runner.query(
          `UPDATE warehouses SET name = 'rls-warehouse-a-renamed' WHERE id = $1 RETURNING id`,
          [warehouseAId],
        ),
      );
      expect(updatedWarehouse.map((r) => r.id)).toEqual([warehouseAId]);

      const updatedSupplier = returningRows(
        await runner.query(
          `UPDATE suppliers SET is_active = false WHERE id = $1 RETURNING id`,
          [supplierAId],
        ),
      );
      expect(updatedSupplier.map((r) => r.id)).toEqual([supplierAId]);

      const updatedShrinkage = returningRows(
        await runner.query(
          `UPDATE shrinkages SET reason = 'audited' WHERE id = $1 RETURNING id`,
          [shrinkageAId],
        ),
      );
      expect(updatedShrinkage.map((r) => r.id)).toEqual([shrinkageAId]);

      const updatedProductionOrder = returningRows(
        await runner.query(
          `UPDATE production_orders SET status = 'COMPLETED' WHERE id = $1 RETURNING id`,
          [productionOrderAId],
        ),
      );
      expect(updatedProductionOrder.map((r) => r.id)).toEqual([
        productionOrderAId,
      ]);

      // Delete of throwaway own rows: insert then delete inside the same
      // transaction, proving DELETE's USING clause admits tenant A's rows.
      const throwawayWarehouse = returningRows(
        await runner.query(
          `INSERT INTO warehouses (tenant_id, name)
           VALUES ($1, 'rls-warehouse-a-throwaway') RETURNING id`,
          [tenantAId],
        ),
      );
      const deletedWarehouse = returningRows(
        await runner.query(
          `DELETE FROM warehouses WHERE id = $1 RETURNING id`,
          [throwawayWarehouse[0].id],
        ),
      );
      expect(deletedWarehouse.map((r) => r.id)).toEqual([
        throwawayWarehouse[0].id,
      ]);

      const throwawaySupplier = returningRows(
        await runner.query(
          `INSERT INTO suppliers (tenant_id, name)
           VALUES ($1, 'rls-supplier-a-throwaway') RETURNING id`,
          [tenantAId],
        ),
      );
      const deletedSupplier = returningRows(
        await runner.query(`DELETE FROM suppliers WHERE id = $1 RETURNING id`, [
          throwawaySupplier[0].id,
        ]),
      );
      expect(deletedSupplier.map((r) => r.id)).toEqual([
        throwawaySupplier[0].id,
      ]);

      const throwawayShrinkage = returningRows(
        await runner.query(
          `INSERT INTO shrinkages (tenant_id, shrinkage_type)
           VALUES ($1, 'SPOILAGE') RETURNING id`,
          [tenantAId],
        ),
      );
      const deletedShrinkage = returningRows(
        await runner.query(
          `DELETE FROM shrinkages WHERE id = $1 RETURNING id`,
          [throwawayShrinkage[0].id],
        ),
      );
      expect(deletedShrinkage.map((r) => r.id)).toEqual([
        throwawayShrinkage[0].id,
      ]);

      const throwawayProductionOrder = returningRows(
        await runner.query(
          `INSERT INTO production_orders (tenant_id, recipe_version_id, planned_quantity)
           VALUES ($1, 'a-throwaway-version', 1) RETURNING id`,
          [tenantAId],
        ),
      );
      const deletedProductionOrder = returningRows(
        await runner.query(
          `DELETE FROM production_orders WHERE id = $1 RETURNING id`,
          [throwawayProductionOrder[0].id],
        ),
      );
      expect(deletedProductionOrder.map((r) => r.id)).toEqual([
        throwawayProductionOrder[0].id,
      ]);
    });
  });

  it('stops tenant A’s UPDATE and DELETE from touching tenant B’s rows in any of the four tables', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const updatedWarehouse = returningRows(
        await runner.query(
          `UPDATE warehouses SET name = 'hijacked' WHERE id = $1 RETURNING id`,
          [warehouseBId],
        ),
      );
      expect(updatedWarehouse).toEqual([]);

      const updatedSupplier = returningRows(
        await runner.query(
          `UPDATE suppliers SET is_active = false WHERE id = $1 RETURNING id`,
          [supplierBId],
        ),
      );
      expect(updatedSupplier).toEqual([]);

      const updatedShrinkage = returningRows(
        await runner.query(
          `UPDATE shrinkages SET reason = 'hijacked' WHERE id = $1 RETURNING id`,
          [shrinkageBId],
        ),
      );
      expect(updatedShrinkage).toEqual([]);

      const updatedProductionOrder = returningRows(
        await runner.query(
          `UPDATE production_orders SET status = 'HIJACKED' WHERE id = $1 RETURNING id`,
          [productionOrderBId],
        ),
      );
      expect(updatedProductionOrder).toEqual([]);

      const deletedWarehouse = returningRows(
        await runner.query(
          `DELETE FROM warehouses WHERE id = $1 RETURNING id`,
          [warehouseBId],
        ),
      );
      expect(deletedWarehouse).toEqual([]);

      const deletedSupplier = returningRows(
        await runner.query(`DELETE FROM suppliers WHERE id = $1 RETURNING id`, [
          supplierBId,
        ]),
      );
      expect(deletedSupplier).toEqual([]);

      const deletedShrinkage = returningRows(
        await runner.query(
          `DELETE FROM shrinkages WHERE id = $1 RETURNING id`,
          [shrinkageBId],
        ),
      );
      expect(deletedShrinkage).toEqual([]);

      const deletedProductionOrder = returningRows(
        await runner.query(
          `DELETE FROM production_orders WHERE id = $1 RETURNING id`,
          [productionOrderBId],
        ),
      );
      expect(deletedProductionOrder).toEqual([]);
    });
  });
});
