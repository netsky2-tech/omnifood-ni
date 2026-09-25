import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../src/core/database/tenant-transaction';
import { createMigrationBuiltSchemaFixture } from '../support/migration-built-schema.helper';
import { normalizeTenantSlug } from '../../src/modules/tenant/tenant-slug';

/**
 * Issue #512 T3 slice 9: tenant isolation for the `parent-owned` inventory
 * children — `production_order_lines` (one-hop: child -> production_orders)
 * and `shrinkage_details` (one-hop: child -> shrinkages).
 *
 * The schema is built by RUNNING THE FULL MIGRATION SET (via
 * test/support/migration-built-schema.helper.ts), so the RLS shape asserted
 * here is migration 1809330000000's own output — never a hand-written copy.
 * The application-shaped connection is the fixture's runtime role:
 * `NOSUPERUSER NOBYPASSRLS`, owner of nothing, holding exactly ordinary
 * SELECT/INSERT/UPDATE/DELETE on the scratch schema's tables. Under FORCEd
 * row-level security every query it makes is subject to the migrated
 * policies; the superuser connection exists only to seed tenants and the
 * fixture rows.
 *
 * These tables have NO tenant_id column: isolation flows through the
 * parent-walking EXISTS policies. Every runtime-role observation runs inside
 * a transaction that binds the tenant context with the production SQL
 * (TENANT_CONTEXT_SET_CONFIG_SQL, transaction-local) and is then ROLLED
 * BACK: the GUC is discarded with the transaction, so the pool is never left
 * with a defined-and-empty `app.tenant_id` (the issue #358 poisoning), and
 * the runtime role never mutates the fixtures. An insert "success" is proven
 * inside its own transaction — the statement returning a row IS the WITH
 * CHECK passing.
 *
 * Real-schema constraint hygiene (nothing may mask the RLS verdict):
 * - `production_orders.tenant_id` and `shrinkages.tenant_id` are
 *   `uuid NOT NULL` with real FKs to tenants(id) — tenant rows are seeded
 *   first and the FK is exercised, never faked.
 * - Neither child table carries any unique constraint, so a cross-tenant
 *   INSERT below is rejected by the WITH CHECK half alone, never by a
 *   constraint; the child FKs (which ignore RLS) resolve against the foreign
 *   parent, which is exactly the pre-policy state being guarded.
 * - `insumo_id` is uuid NOT NULL with NO FK constraint on either child, so a
 *   synthetic uuid is ordinary data — the RLS verdict never depends on an
 *   insumo row.
 * - Every NOT NULL column is supplied by the insert proofs, so each proof
 *   fails (or passes) on RLS alone, never on a missing NOT NULL value.
 */

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
function returningRows(result: unknown): Array<{ id: string }> {
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0] as Array<{ id: string }>;
  }
  return (Array.isArray(result) ? result : []) as Array<{ id: string }>;
}

describe('parent-owned inventory children tenant RLS (Real PostgreSQL DB, migration-built schema)', () => {
  jest.setTimeout(180000);

  let admin: DataSource;
  let runtime: DataSource;
  let schema: string;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;

  // A and B own the seeded parent rows; C and D are fresh synthetic tenant
  // contexts for the INSERT proofs. Tenants exist as real rows — the parent
  // tables carry real FKs to tenants(id).
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const tenantCId = randomUUID();
  const tenantDId = randomUUID();

  // Seeded probe rows, one per tenant (A and B).
  const orderAId = randomUUID();
  const orderBId = randomUUID();
  const lineAId = randomUUID();
  const lineBId = randomUUID();
  const shrinkageAId = randomUUID();
  const shrinkageBId = randomUUID();
  const detailAId = randomUUID();
  const detailBId = randomUUID();

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

    // Real tenant rows first: the parent tables carry real FKs to tenants(id).
    await admin.query(
      `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $9), ($3, $4, $10), ($5, $6, $11), ($7, $8, $12)`,
      [
        tenantAId,
        'inventory-children-rls-tenant-a',
        tenantBId,
        'inventory-children-rls-tenant-b',
        tenantCId,
        'inventory-children-rls-tenant-c',
        tenantDId,
        'inventory-children-rls-tenant-d',
        normalizeTenantSlug('inventory-children-rls-tenant-a'),
        normalizeTenantSlug('inventory-children-rls-tenant-b'),
        normalizeTenantSlug('inventory-children-rls-tenant-c'),
        normalizeTenantSlug('inventory-children-rls-tenant-d'),
      ],
    );

    // Production orders: recipe_version_id and planned_quantity are NOT NULL.
    await admin.query(
      `INSERT INTO production_orders (id, tenant_id, recipe_version_id, planned_quantity)
       VALUES ($1, $2, 'rv-shared-0001', 10.0000),
              ($3, $4, 'rv-shared-0001', 10.0000)`,
      [orderAId, tenantAId, orderBId, tenantBId],
    );

    // Shrinkages: shrinkage_type is NOT NULL.
    await admin.query(
      `INSERT INTO shrinkages (id, tenant_id, shrinkage_type)
       VALUES ($1, $2, 'SPILLAGE'), ($3, $4, 'SPILLAGE')`,
      [shrinkageAId, tenantAId, shrinkageBId, tenantBId],
    );

    await admin.query(
      `INSERT INTO production_order_lines (id, production_order_id, insumo_id, quantity, unit_cost_nio)
       VALUES ($1, $3, $5, 2.0000, 50.0000),
              ($2, $4, $5, 2.0000, 50.0000)`,
      [lineAId, lineBId, orderAId, orderBId, randomUUID()],
    );

    await admin.query(
      `INSERT INTO shrinkage_details (id, shrinkage_id, insumo_id, quantity, unit_cost_nio)
       VALUES ($1, $3, $5, 0.5000, 50.0000),
              ($2, $4, $5, 0.5000, 50.0000)`,
      [detailAId, detailBId, shrinkageAId, shrinkageBId, randomUUID()],
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
      `SELECT (SELECT count(*)::int FROM production_order_lines) AS lines,
              (SELECT count(*)::int FROM shrinkage_details) AS details`,
    );
    expect(seeded[0]).toEqual({ lines: 2, details: 2 });

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
          AND tablename IN ('production_order_lines', 'shrinkage_details')
          AND tableowner = $2`,
      [schema, fixture.runtimeRoleName],
    );
    expect(ownership[0].count).toBe(0);
  });

  it('enables AND forces row level security on both tables with exactly one command-specific policy per command', async () => {
    const facts = await admin.query(
      `SELECT c.relname, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1
          AND c.relname IN ('production_order_lines', 'shrinkage_details')
        ORDER BY c.relname`,
      [schema],
    );

    expect(facts).toEqual([
      {
        relname: 'production_order_lines',
        rls_enabled: true,
        rls_forced: true,
      },
      { relname: 'shrinkage_details', rls_enabled: true, rls_forced: true },
    ]);

    const policies = await admin.query(
      `SELECT tablename, policyname, cmd FROM pg_policies
        WHERE schemaname = $1 AND tablename IN ('production_order_lines', 'shrinkage_details')
        ORDER BY tablename, policyname`,
      [schema],
    );
    // EXACTLY the four command policies per table: an extra policy would
    // widen access beyond the tenant contract, a missing one narrows it.
    expect(policies).toEqual([
      {
        tablename: 'production_order_lines',
        policyname: 'production_order_lines_tenant_delete',
        cmd: 'DELETE',
      },
      {
        tablename: 'production_order_lines',
        policyname: 'production_order_lines_tenant_insert',
        cmd: 'INSERT',
      },
      {
        tablename: 'production_order_lines',
        policyname: 'production_order_lines_tenant_select',
        cmd: 'SELECT',
      },
      {
        tablename: 'production_order_lines',
        policyname: 'production_order_lines_tenant_update',
        cmd: 'UPDATE',
      },
      {
        tablename: 'shrinkage_details',
        policyname: 'shrinkage_details_tenant_delete',
        cmd: 'DELETE',
      },
      {
        tablename: 'shrinkage_details',
        policyname: 'shrinkage_details_tenant_insert',
        cmd: 'INSERT',
      },
      {
        tablename: 'shrinkage_details',
        policyname: 'shrinkage_details_tenant_select',
        cmd: 'SELECT',
      },
      {
        tablename: 'shrinkage_details',
        policyname: 'shrinkage_details_tenant_update',
        cmd: 'UPDATE',
      },
    ]);

    // Every defined expression is the ONE-HOP parent walk with the uuid-cast
    // setting form; no grandparent join may appear on these tables.
    const exprs = await admin.query(
      `SELECT tablename, policyname, qual, with_check FROM pg_policies
        WHERE schemaname = $1
          AND tablename IN ('production_order_lines', 'shrinkage_details')
        ORDER BY tablename, policyname`,
      [schema],
    );
    for (const expr of exprs) {
      for (const half of [expr.qual, expr.with_check]) {
        if (half === null) continue;
        expect(half).toContain('EXISTS');
        // PostgreSQL deparses the setting with an implicit ::text cast on
        // the literal; assert on the stable prefix, never on the exact
        // written spelling.
        expect(half).toContain("current_setting('app.tenant_id'");
        expect(half).toContain('::uuid');
        expect(half).not.toContain('JOIN');
      }
    }
  });

  it('denies an unbound runtime role every row of both tables', async () => {
    await asRuntimeRole(runtime, null, async (runner) => {
      const lines = (await runner.query(
        `SELECT count(*)::int AS count FROM production_order_lines`,
      )) as Array<{ count: number }>;
      expect(lines[0].count).toBe(0);

      const details = (await runner.query(
        `SELECT count(*)::int AS count FROM shrinkage_details`,
      )) as Array<{ count: number }>;
      expect(details[0].count).toBe(0);
    });
  });

  it('shows tenant A only its own line and detail rows, never tenant B’s', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const lines = (await runner.query(
        `SELECT id FROM production_order_lines`,
      )) as Array<{ id: string }>;
      expect(lines.map((r) => r.id)).toEqual([lineAId]);

      const details = (await runner.query(
        `SELECT id FROM shrinkage_details`,
      )) as Array<{ id: string }>;
      expect(details.map((r) => r.id)).toEqual([detailAId]);
    });
  });

  it('shows tenant B only its own rows (triangulation)', async () => {
    await asRuntimeRole(runtime, tenantBId, async (runner) => {
      const lines = (await runner.query(
        `SELECT id FROM production_order_lines`,
      )) as Array<{ id: string }>;
      expect(lines.map((r) => r.id)).toEqual([lineBId]);

      const details = (await runner.query(
        `SELECT id FROM shrinkage_details`,
      )) as Array<{ id: string }>;
      expect(details.map((r) => r.id)).toEqual([detailBId]);
    });
  });

  it('blocks a tenant-bound id-keyed SELECT of the other tenant’s rows in both tables', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const foreignLine = (await runner.query(
        `SELECT id FROM production_order_lines WHERE id = $1`,
        [lineBId],
      )) as Array<{ id: string }>;
      expect(foreignLine).toEqual([]);

      const foreignDetail = (await runner.query(
        `SELECT id FROM shrinkage_details WHERE id = $1`,
        [detailBId],
      )) as Array<{ id: string }>;
      expect(foreignDetail).toEqual([]);
    });
  });

  it('accepts a tenant-bound runtime role inserting its own rows into both tables', async () => {
    // Bound to tenant A, writing children of A's OWN parents: the statement
    // returning its row IS the WITH CHECK half passing. Proven inside the
    // rolled-back transaction.
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const insertedLine = returningRows(
        await runner.query(
          `INSERT INTO production_order_lines (production_order_id, insumo_id, quantity, unit_cost_nio)
           VALUES ($1, $2, 1.0000, 45.0000) RETURNING id`,
          [orderAId, randomUUID()],
        ),
      );
      expect(insertedLine).toHaveLength(1);

      const insertedDetail = returningRows(
        await runner.query(
          `INSERT INTO shrinkage_details (shrinkage_id, insumo_id, quantity, unit_cost_nio)
           VALUES ($1, $2, 0.2500, 45.0000) RETURNING id`,
          [shrinkageAId, randomUUID()],
        ),
      );
      expect(insertedDetail).toHaveLength(1);
    });
  });

  it('rejects a tenant-bound runtime role inserting a line whose parent order belongs to another tenant', async () => {
    // Bound to A, parented on B's order: the FK would accept it (FK checks
    // ignore RLS), so ONLY the WITH CHECK's parent walk stands between this
    // statement and B's production order. One statement per transaction.
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      await expect(
        runner.query(
          `INSERT INTO production_order_lines (production_order_id, insumo_id, quantity, unit_cost_nio)
           VALUES ($1, $2, 1.0000, 45.0000) RETURNING id`,
          [orderBId, randomUUID()],
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it('rejects a tenant-bound runtime role inserting a detail whose parent shrinkage belongs to another tenant', async () => {
    // Direct INSERT with a foreign parent id must be rejected by
    // /row-level security/, never silently accepted because the FK resolves.
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      await expect(
        runner.query(
          `INSERT INTO shrinkage_details (shrinkage_id, insumo_id, quantity, unit_cost_nio)
           VALUES ($1, $2, 0.2500, 45.0000) RETURNING id`,
          [shrinkageBId, randomUUID()],
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it('lets tenant A update and delete its own rows in both tables', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const updatedLine = returningRows(
        await runner.query(
          `UPDATE production_order_lines SET quantity = 3.0000 WHERE id = $1 RETURNING id`,
          [lineAId],
        ),
      );
      expect(updatedLine.map((r) => r.id)).toEqual([lineAId]);

      const updatedDetail = returningRows(
        await runner.query(
          `UPDATE shrinkage_details SET quantity = 0.7500 WHERE id = $1 RETURNING id`,
          [detailAId],
        ),
      );
      expect(updatedDetail.map((r) => r.id)).toEqual([detailAId]);

      // Delete of throwaway own rows: insert then delete inside the same
      // transaction, proving DELETE's USING clause admits tenant A's rows.
      const throwawayLine = returningRows(
        await runner.query(
          `INSERT INTO production_order_lines (production_order_id, insumo_id, quantity, unit_cost_nio)
           VALUES ($1, $2, 1.0000, 10.0000) RETURNING id`,
          [orderAId, randomUUID()],
        ),
      );
      const deletedLine = returningRows(
        await runner.query(
          `DELETE FROM production_order_lines WHERE id = $1 RETURNING id`,
          [throwawayLine[0].id],
        ),
      );
      expect(deletedLine.map((r) => r.id)).toEqual([throwawayLine[0].id]);

      const throwawayDetail = returningRows(
        await runner.query(
          `INSERT INTO shrinkage_details (shrinkage_id, insumo_id, quantity, unit_cost_nio)
           VALUES ($1, $2, 1.0000, 10.0000) RETURNING id`,
          [shrinkageAId, randomUUID()],
        ),
      );
      const deletedDetail = returningRows(
        await runner.query(
          `DELETE FROM shrinkage_details WHERE id = $1 RETURNING id`,
          [throwawayDetail[0].id],
        ),
      );
      expect(deletedDetail.map((r) => r.id)).toEqual([throwawayDetail[0].id]);
    });
  });

  it('stops tenant A’s UPDATE and DELETE from touching tenant B’s rows in either table', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const updatedLine = returningRows(
        await runner.query(
          `UPDATE production_order_lines SET quantity = 0.0001 WHERE id = $1 RETURNING id`,
          [lineBId],
        ),
      );
      expect(updatedLine).toEqual([]);

      const updatedDetail = returningRows(
        await runner.query(
          `UPDATE shrinkage_details SET quantity = 0.0001 WHERE id = $1 RETURNING id`,
          [detailBId],
        ),
      );
      expect(updatedDetail).toEqual([]);

      const deletedLine = returningRows(
        await runner.query(
          `DELETE FROM production_order_lines WHERE id = $1 RETURNING id`,
          [lineBId],
        ),
      );
      expect(deletedLine).toEqual([]);

      const deletedDetail = returningRows(
        await runner.query(
          `DELETE FROM shrinkage_details WHERE id = $1 RETURNING id`,
          [detailBId],
        ),
      );
      expect(deletedDetail).toEqual([]);
    });
  });

  describe('cross-tenant isolation through the parent id (issue #512 T3 slice 9)', () => {
    // VACUITY GUARD — what each assertion below would look like if row level
    // security were ABSENT on the child tables (or bypassed by the role).
    // The guard is what keeps this suite from passing vacuously: a
    // tenant-less invariant (e.g. asserting only "the query returns a row")
    // would hold with or without policies.
    //
    //   SELECT id FROM production_order_lines WHERE production_order_id = <B's order>
    //     -> ONE row — B's line, readable by tenant A through the parent id.
    //   SELECT id FROM shrinkage_details WHERE shrinkage_id = <B's shrinkage>
    //     -> ONE row — B's detail, readable through the parent id.
    //   UPDATE ... WHERE <parent id> RETURNING id
    //     -> ONE row — tenant A would mutate B's child row through the
    //        parent id.
    //   INSERT with a foreign parent id
    //     -> ACCEPTED — a child row lands under another tenant's parent
    //        because the FK (which ignores RLS) resolves.
    //
    // Every `toEqual([])` below pins ZERO foreign rows, so a missing or
    // bypassed policy makes these tests fail on the extra foreign row —
    // they cannot pass vacuously.
    it('returns no foreign line through the parent order id lookup', async () => {
      await asRuntimeRole(runtime, tenantAId, async (runner) => {
        const rows = (await runner.query(
          `SELECT id FROM production_order_lines WHERE production_order_id = $1`,
          [orderBId],
        )) as Array<{ id: string }>;
        expect(rows).toEqual([]);
      });
    });

    it('returns no foreign detail through the parent shrinkage id lookup', async () => {
      await asRuntimeRole(runtime, tenantAId, async (runner) => {
        const rows = (await runner.query(
          `SELECT id FROM shrinkage_details WHERE shrinkage_id = $1`,
          [shrinkageBId],
        )) as Array<{ id: string }>;
        expect(rows).toEqual([]);
      });
    });

    it('scopes a parent-keyed UPDATE to the bound tenant’s own rows only', async () => {
      await asRuntimeRole(runtime, tenantAId, async (runner) => {
        const updatedLine = returningRows(
          await runner.query(
            `UPDATE production_order_lines SET quantity = 9.0000
              WHERE production_order_id = $1 RETURNING id`,
            [orderBId],
          ),
        );
        expect(updatedLine).toEqual([]);

        const updatedDetail = returningRows(
          await runner.query(
            `UPDATE shrinkage_details SET quantity = 9.0000
              WHERE shrinkage_id = $1 RETURNING id`,
            [shrinkageBId],
          ),
        );
        expect(updatedDetail).toEqual([]);
      });
    });

    it('rejects foreign-tenant INSERTs carrying a foreign parent id under the fresh synthetic tenant C', async () => {
      // One statement per transaction: the RLS rejection aborts the
      // transaction it happens in.
      await asRuntimeRole(runtime, tenantCId, async (runner) => {
        await expect(
          runner.query(
            `INSERT INTO production_order_lines (production_order_id, insumo_id, quantity, unit_cost_nio)
             VALUES ($1, $2, 1.0000, 1.0000) RETURNING id`,
            [orderAId, randomUUID()],
          ),
        ).rejects.toThrow(/row-level security/i);
      });

      await asRuntimeRole(runtime, tenantCId, async (runner) => {
        await expect(
          runner.query(
            `INSERT INTO shrinkage_details (shrinkage_id, insumo_id, quantity, unit_cost_nio)
             VALUES ($1, $2, 1.0000, 1.0000) RETURNING id`,
            [shrinkageAId, randomUUID()],
          ),
        ).rejects.toThrow(/row-level security/i);
      });
    });
  });
});
