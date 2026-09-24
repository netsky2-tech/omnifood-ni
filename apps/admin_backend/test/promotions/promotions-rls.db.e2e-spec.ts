import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../src/core/database/tenant-transaction';
import { createMigrationBuiltSchemaFixture } from '../support/migration-built-schema.helper';

/**
 * Issue #512 T3 slice 6: tenant isolation for the `promotions` table.
 *
 * The schema is built by RUNNING THE FULL MIGRATION SET (via
 * test/support/migration-built-schema.helper.ts), so the RLS shape asserted
 * here is migration 1809300000000's own output — never a hand-written copy.
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
 * - `promotions.tenant_id` is `uuid NOT NULL` (rebound by 1809140000000,
 *   RebindCatalogLoyaltyLegacyTenantColumns:84) with NO tenant FK and no
 *   further tenant-scoped parent, so the policy is exercised directly.
 * - `promotions.name` is NOT NULL varchar with NO unique constraint — the
 *   entity only carries per-tenant indexes — which is exactly why the
 *   same-name cross-tenant case below is meaningful: without RLS an
 *   identical name makes both tenants' rows mutually readable and writable
 *   through a name lookup.
 * - `type` carries a database default, so the insert proofs need only
 *   (tenant_id, name); every insert proof below fails (or passes) on RLS
 *   alone, never on a missing NOT NULL value.
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
function returningRows(
  result: unknown,
): Array<{ id: string; tenant_id?: string }> {
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0] as Array<{ id: string }>;
  }
  return (Array.isArray(result) ? result : []) as Array<{ id: string }>;
}

describe('promotions tenant RLS (Real PostgreSQL DB, migration-built schema)', () => {
  jest.setTimeout(180000);

  let admin: DataSource;
  let runtime: DataSource;
  let schema: string;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;

  // A and B own the seeded probes; C and D are fresh synthetic tenant
  // contexts for the INSERT proofs (an own-tenant INSERT bound to A or B
  // would sit next to seeded rows, and C/D keep the WITH CHECK proofs free
  // of interference). Tenants exist as real rows even though promotions
  // carries no tenant FK — they are the values the policy compares against.
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const tenantCId = randomUUID();
  const tenantDId = randomUUID();

  // Two tenants holding a promotion with an IDENTICAL name.
  const SHARED_PROMOTION_NAME = 'Shared 2x1 Promotion';

  // Seeded probe rows, one per tenant (A and B).
  const promotionAId = randomUUID();
  const promotionBId = randomUUID();

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

    // Real tenant rows first: they are the policy comparison values.
    await admin.query(
      `INSERT INTO tenants (id, name) VALUES ($1, $2), ($3, $4), ($5, $6), ($7, $8)`,
      [
        tenantAId,
        'promotions-rls-tenant-a',
        tenantBId,
        'promotions-rls-tenant-b',
        tenantCId,
        'promotions-rls-tenant-c',
        tenantDId,
        'promotions-rls-tenant-d',
      ],
    );

    // Seeded probes, one same-named row per tenant A and B. `name` is NOT
    // NULL and there is NO unique constraint on it, so identical names
    // across tenants are ordinary production data.
    await admin.query(
      `INSERT INTO promotions (id, tenant_id, name)
       VALUES ($1, $2, $3), ($4, $5, $3)`,
      [promotionAId, tenantAId, SHARED_PROMOTION_NAME, promotionBId, tenantBId],
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
      `SELECT count(*)::int AS count FROM promotions`,
    );
    expect(seeded[0]).toEqual({ count: 2 });

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
          AND tablename IN ('promotions')
          AND tableowner = $2`,
      [schema, fixture.runtimeRoleName],
    );
    expect(ownership[0].count).toBe(0);
  });

  it('enables AND forces row level security on the promotions table with exactly one command-specific policy per command', async () => {
    const facts = await admin.query(
      `SELECT c.relname, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1
          AND c.relname IN ('promotions')
        ORDER BY c.relname`,
      [schema],
    );

    expect(facts).toEqual([
      { relname: 'promotions', rls_enabled: true, rls_forced: true },
    ]);

    const policies = await admin.query(
      `SELECT policyname, cmd FROM pg_policies WHERE schemaname = $1 AND tablename = $2 ORDER BY policyname`,
      [schema, 'promotions'],
    );
    // EXACTLY the four command policies: an extra policy would widen
    // access beyond the tenant contract, a missing one narrows it.
    expect(policies).toEqual([
      { policyname: 'promotions_tenant_delete', cmd: 'DELETE' },
      { policyname: 'promotions_tenant_insert', cmd: 'INSERT' },
      { policyname: 'promotions_tenant_select', cmd: 'SELECT' },
      { policyname: 'promotions_tenant_update', cmd: 'UPDATE' },
    ]);
  });

  it('denies an unbound runtime role every row of the promotions table', async () => {
    await asRuntimeRole(runtime, null, async (runner) => {
      const rows = (await runner.query(
        `SELECT count(*)::int AS count FROM promotions`,
      )) as Array<{ count: number }>;
      expect(rows[0].count).toBe(0);
    });
  });

  it('shows tenant A only its own rows, never tenant B’s', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const rows = (await runner.query(
        `SELECT id FROM promotions`,
      )) as Array<{ id: string }>;
      expect(rows.map((r) => r.id)).toEqual([promotionAId]);
    });
  });

  it('shows tenant B only its own rows (triangulation)', async () => {
    await asRuntimeRole(runtime, tenantBId, async (runner) => {
      const rows = (await runner.query(
        `SELECT id FROM promotions`,
      )) as Array<{ id: string }>;
      expect(rows.map((r) => r.id)).toEqual([promotionBId]);
    });
  });

  it('accepts a tenant-bound runtime role inserting its own rows into the promotions table', async () => {
    // Bound to tenant C: the own-tenant INSERT is the WITH CHECK half
    // passing. Proven inside the rolled-back transaction — the statement
    // returning its row IS the success.
    await asRuntimeRole(runtime, tenantCId, async (runner) => {
      const inserted = returningRows(
        await runner.query(
          `INSERT INTO promotions (tenant_id, name) VALUES ($1, 'insert-proof-promotion') RETURNING id, tenant_id`,
          [tenantCId],
        ),
      );
      expect(inserted).toHaveLength(1);
      expect(inserted[0].tenant_id).toBe(tenantCId);
    });
  });

  it('rejects a tenant-bound runtime role inserting a foreign-tenant row into the promotions table', async () => {
    // Bound to tenant C, inserting tenant D: a fresh synthetic foreign
    // value, so pre-policy the write itself goes through and post-policy
    // the WITH CHECK clause rejects it.
    await asRuntimeRole(runtime, tenantCId, async (runner) => {
      await expect(
        runner.query(
          `INSERT INTO promotions (tenant_id, name) VALUES ($1, 'foreign-proof-promotion') RETURNING id`,
          [tenantDId],
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it('lets tenant A update and delete its own rows', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const updated = returningRows(
        await runner.query(
          `UPDATE promotions SET priority = 42 WHERE id = $1 RETURNING id`,
          [promotionAId],
        ),
      );
      expect(updated.map((r) => r.id)).toEqual([promotionAId]);

      // Delete of throwaway own rows: insert then delete inside the same
      // transaction, proving DELETE's USING clause admits tenant A's rows.
      const throwaway = returningRows(
        await runner.query(
          `INSERT INTO promotions (tenant_id, name) VALUES ($1, 'delete-proof-promotion') RETURNING id`,
          [tenantAId],
        ),
      );
      const deleted = returningRows(
        await runner.query(`DELETE FROM promotions WHERE id = $1 RETURNING id`, [
          throwaway[0].id,
        ]),
      );
      expect(deleted.map((r) => r.id)).toEqual([throwaway[0].id]);
    });
  });

  it('stops tenant A’s UPDATE and DELETE from touching tenant B’s rows', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const updated = returningRows(
        await runner.query(
          `UPDATE promotions SET priority = 999 WHERE id = $1 RETURNING id`,
          [promotionBId],
        ),
      );
      expect(updated).toEqual([]);

      const deleted = returningRows(
        await runner.query(`DELETE FROM promotions WHERE id = $1 RETURNING id`, [
          promotionBId,
        ]),
      );
      expect(deleted).toEqual([]);
    });
  });

  describe('same-name cross-tenant promotion isolation (issue #512 T3 slice 6)', () => {
    // VACUITY GUARD — what each assertion below would look like if row level
    // security were ABSENT on promotions (or bypassed by the role):
    //
    //   SELECT id FROM promotions WHERE name = 'Shared 2x1 Promotion'
    //     -> TWO rows — both tenants' same-named promotions.
    //   UPDATE promotions SET ... WHERE name = 'Shared 2x1 Promotion' RETURNING id
    //     -> TWO rows — tenant A would mutate tenant B's row through the name.
    //   INSERT with tenant_id = tenantAId while bound to tenant C
    //     -> ACCEPTED — a row lands in tenant A's promotions without binding.
    //
    // Every `toEqual` below pins EXACTLY ONE id (or zero rows), so a missing
    // or bypassed policy makes these tests fail on the extra foreign row —
    // they cannot pass vacuously.
    it('returns each tenant exactly its own row on a name lookup, never the other tenant’s identical name', async () => {
      await asRuntimeRole(runtime, tenantAId, async (runner) => {
        const rows = (await runner.query(
          `SELECT id FROM promotions WHERE name = $1`,
          [SHARED_PROMOTION_NAME],
        )) as Array<{ id: string }>;
        expect(rows.map((r) => r.id)).toEqual([promotionAId]);
      });

      await asRuntimeRole(runtime, tenantBId, async (runner) => {
        const rows = (await runner.query(
          `SELECT id FROM promotions WHERE name = $1`,
          [SHARED_PROMOTION_NAME],
        )) as Array<{ id: string }>;
        expect(rows.map((r) => r.id)).toEqual([promotionBId]);
      });
    });

    it('scopes a name-based UPDATE to the bound tenant’s own row only', async () => {
      // A name-keyed write mirrors the service's name-driven admin flows;
      // under an absent policy it would RETURN both tenants' ids and
      // overwrite B's row.
      await asRuntimeRole(runtime, tenantAId, async (runner) => {
        const updated = returningRows(
          await runner.query(
            `UPDATE promotions SET priority = 55 WHERE name = $1 RETURNING id`,
            [SHARED_PROMOTION_NAME],
          ),
        );
        expect(updated.map((r) => r.id)).toEqual([promotionAId]);
      });
    });

    it('rejects a foreign-tenant INSERT carrying the identical name', async () => {
      // Bound to C, writing tenant A's tenant_id with the shared name: the
      // name matches A's promotion textually, and only the WITH CHECK half
      // stands between this statement and A's promotions.
      await asRuntimeRole(runtime, tenantCId, async (runner) => {
        await expect(
          runner.query(
            `INSERT INTO promotions (tenant_id, name) VALUES ($1, $2) RETURNING id`,
            [tenantAId, SHARED_PROMOTION_NAME],
          ),
        ).rejects.toThrow(/row-level security/i);
      });
    });
  });
});
