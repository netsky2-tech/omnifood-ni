import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../src/core/database/tenant-transaction';
import { createMigrationBuiltSchemaFixture } from '../support/migration-built-schema.helper';

/**
 * Issue #493 T2.S1: tenant isolation for `onboarding_sessions` and
 * `onboarding_idempotency_records`.
 *
 * The schema is built by RUNNING THE FULL MIGRATION SET (via
 * test/support/migration-built-schema.helper.ts), so the RLS shape asserted
 * here is migration 1809220000000's own output — never a hand-written copy.
 * The application-shaped connection is the fixture's runtime role:
 * `NOSUPERUSER NOBYPASSRLS`, owner of nothing, holding exactly ordinary
 * SELECT/INSERT/UPDATE/DELETE on the scratch schema's tables. Under FORCEd
 * row-level security every query it makes is subject to the migrated
 * policies; the superuser connection exists only to seed two tenants' rows.
 *
 * Every runtime-role observation runs inside a transaction that binds the
 * tenant context with the production SQL (TENANT_CONTEXT_SET_CONFIG_SQL,
 * transaction-local) and is then ROLLED BACK: the GUC is discarded with the
 * transaction, so the pool is never left with a defined-and-empty
 * `app.tenant_id` (the issue #358 poisoning), and the runtime role never
 * mutates the fixtures. An insert "success" is proven inside its own
 * transaction — the statement returning a row IS the WITH CHECK passing.
 */

const TABLES = [
  'onboarding_sessions',
  'onboarding_idempotency_records',
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

describe('onboarding session/idempotency tenant RLS (Real PostgreSQL DB, migration-built schema)', () => {
  jest.setTimeout(180000);

  let admin: DataSource;
  let runtime: DataSource;
  let schema: string;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;

  // Synthetic tenants only: onboarding_sessions carries no FK to tenants, so
  // no tenant rows are needed — just synthetic UUIDs, seeded as superuser.
  // A and B own the seeded visibility/update/delete probes; C and D are
  // fresh synthetic tenant contexts for the INSERT proofs, because
  // uq_onboarding_sessions_tenant_id admits exactly ONE session row per
  // tenant — an own-tenant INSERT bound to A or B would hit that unique
  // constraint before any RLS evaluation and make the proof meaningless.
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const tenantCId = randomUUID();
  const tenantDId = randomUUID();

  const sessionAId = randomUUID();
  const sessionBId = randomUUID();
  const idempotencyAId = randomUUID();
  const idempotencyBId = randomUUID();

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

    // Seed one row per tenant per table. Synthetic UUIDs only; no FK to
    // tenants exists on either table.
    await admin.query(
      `INSERT INTO onboarding_sessions (id, tenant_id)
       VALUES ($1, $2), ($3, $4)`,
      [sessionAId, tenantAId, sessionBId, tenantBId],
    );
    await admin.query(
      `INSERT INTO onboarding_idempotency_records
         (id, tenant_id, idempotency_key, command_type, payload_hash)
       VALUES
         ($1, $2, 'activation-attempt', 'ACTIVATION', 'hash-a'),
         ($3, $4, 'activation-attempt', 'ACTIVATION', 'hash-b')`,
      [idempotencyAId, tenantAId, idempotencyBId, tenantBId],
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
      `SELECT (SELECT count(*)::int FROM onboarding_sessions) AS sessions,
              (SELECT count(*)::int FROM onboarding_idempotency_records) AS idempotency`,
    );
    expect(seeded[0]).toEqual({ sessions: 2, idempotency: 2 });

    const role = (
      await admin.query(
        `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1`,
        [fixture.runtimeRoleName],
      )
    )[0];
    expect(role).toBeDefined();
    expect(role.rolsuper).toBe(false);
    expect(role.rolbypassrls).toBe(false);

    const ownership = (await admin.query<{ count: number }[]>(
      `SELECT count(*)::int AS count
         FROM pg_tables
        WHERE schemaname = $1
          AND tablename IN ('onboarding_sessions', 'onboarding_idempotency_records')
          AND tableowner = $2`,
      [schema, fixture.runtimeRoleName],
    )) as Array<{ count: number }>;
    expect(ownership[0].count).toBe(0);
  });

  it('enables AND forces row level security on both tables with one command-specific policy per command', async () => {
    const facts = (await admin.query<
      Array<{
        relname: string;
        rls_enabled: boolean;
        rls_forced: boolean;
      }>
    >(
      `SELECT c.relname, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1
          AND c.relname IN ('onboarding_sessions', 'onboarding_idempotency_records')
        ORDER BY c.relname`,
      [schema],
    )) as Array<{ relname: string; rls_enabled: boolean; rls_forced: boolean }>;

    expect(facts).toEqual([
      {
        relname: 'onboarding_idempotency_records',
        rls_enabled: true,
        rls_forced: true,
      },
      { relname: 'onboarding_sessions', rls_enabled: true, rls_forced: true },
    ]);

    for (const table of TABLES) {
      const policies = await admin.query<{ policyname: string; cmd: string }[]>(
        `SELECT policyname, cmd FROM pg_policies WHERE schemaname = $1 AND tablename = $2 ORDER BY policyname`,
        [schema, table],
      );
      expect(policies).toEqual([
        { policyname: `${table}_tenant_delete`, cmd: 'DELETE' },
        { policyname: `${table}_tenant_insert`, cmd: 'INSERT' },
        { policyname: `${table}_tenant_select`, cmd: 'SELECT' },
        { policyname: `${table}_tenant_update`, cmd: 'UPDATE' },
      ]);
    }
  });

  it('denies an unbound runtime role every row of both tables', async () => {
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
      const sessions = (await runner.query(
        `SELECT id FROM onboarding_sessions`,
      )) as Array<{ id: string }>;
      expect(sessions.map((r) => r.id)).toEqual([sessionAId]);

      const idempotency = (await runner.query(
        `SELECT id FROM onboarding_idempotency_records`,
      )) as Array<{ id: string }>;
      expect(idempotency.map((r) => r.id)).toEqual([idempotencyAId]);
    });
  });

  it('shows tenant B only its own rows (triangulation)', async () => {
    await asRuntimeRole(runtime, tenantBId, async (runner) => {
      const sessions = (await runner.query(
        `SELECT id FROM onboarding_sessions`,
      )) as Array<{ id: string }>;
      expect(sessions.map((r) => r.id)).toEqual([sessionBId]);

      const idempotency = (await runner.query(
        `SELECT id FROM onboarding_idempotency_records`,
      )) as Array<{ id: string }>;
      expect(idempotency.map((r) => r.id)).toEqual([idempotencyBId]);
    });
  });

  it('accepts a tenant-bound runtime role inserting its own rows into both tables', async () => {
    // Bound to tenant C (a real synthetic tenant context with no seeded
    // rows, see the unique-constraint note above): the own-tenant INSERT is
    // the WITH CHECK half passing. Proven inside the rolled-back
    // transaction — the statement returning its row IS the success.
    await asRuntimeRole(runtime, tenantCId, async (runner) => {
      const inserted = returningRows(
        await runner.query(
          `INSERT INTO onboarding_sessions (tenant_id) VALUES ($1) RETURNING id, tenant_id`,
          [tenantCId],
        ),
      );
      expect(inserted).toHaveLength(1);
      expect(inserted[0].tenant_id).toBe(tenantCId);

      const insertedIdempotency = returningRows(
        await runner.query(
          `INSERT INTO onboarding_idempotency_records
             (tenant_id, idempotency_key, command_type, payload_hash)
           VALUES ($1, 'insert-proof', 'ACTIVATION', 'hash-proof') RETURNING id, tenant_id`,
          [tenantCId],
        ),
      );
      expect(insertedIdempotency).toHaveLength(1);
      expect(insertedIdempotency[0].tenant_id).toBe(tenantCId);
    });
  });

  it('rejects a tenant-bound runtime role inserting a foreign-tenant row into either table', async () => {
    // Bound to tenant C, inserting tenant D: a fresh synthetic foreign
    // value, so pre-policy the write itself goes through (no unique
    // conflict to mask the behavioral failure) and post-policy the WITH
    // CHECK clause rejects it. One transaction per rejection: the first
    // WITH CHECK failure aborts its transaction, which would otherwise
    // poison the second statement with "current transaction is aborted".
    await asRuntimeRole(runtime, tenantCId, async (runner) => {
      await expect(
        runner.query(
          `INSERT INTO onboarding_sessions (tenant_id) VALUES ($1) RETURNING id`,
          [tenantDId],
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    await asRuntimeRole(runtime, tenantCId, async (runner) => {
      await expect(
        runner.query(
          `INSERT INTO onboarding_idempotency_records
             (tenant_id, idempotency_key, command_type, payload_hash)
           VALUES ($1, 'foreign-proof', 'ACTIVATION', 'hash-foreign') RETURNING id`,
          [tenantDId],
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it('lets tenant A update and delete its own rows', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const updated = returningRows(
        await runner.query(
          `UPDATE onboarding_sessions SET lifecycle_state = 'ACTIVATED'
            WHERE id = $1 RETURNING id`,
          [sessionAId],
        ),
      );
      expect(updated.map((r) => r.id)).toEqual([sessionAId]);

      const updatedIdempotency = returningRows(
        await runner.query(
          `UPDATE onboarding_idempotency_records SET attempt_count = attempt_count + 1
            WHERE id = $1 RETURNING id`,
          [idempotencyAId],
        ),
      );
      expect(updatedIdempotency.map((r) => r.id)).toEqual([idempotencyAId]);

      // Delete of a throwaway own row: insert then delete inside the same
      // transaction, proving DELETE's USING clause admits tenant A's rows.
      const throwaway = returningRows(
        await runner.query(
          `INSERT INTO onboarding_idempotency_records
             (tenant_id, idempotency_key, command_type, payload_hash)
           VALUES ($1, 'delete-proof', 'ACTIVATION', 'hash-delete') RETURNING id`,
          [tenantAId],
        ),
      );
      const deleted = returningRows(
        await runner.query(
          `DELETE FROM onboarding_idempotency_records WHERE id = $1 RETURNING id`,
          [throwaway[0].id],
        ),
      );
      expect(deleted.map((r) => r.id)).toEqual([throwaway[0].id]);
    });
  });

  it('stops tenant A’s UPDATE and DELETE from touching tenant B’s rows in either table', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const updated = returningRows(
        await runner.query(
          `UPDATE onboarding_sessions SET lifecycle_state = 'ACTIVATED'
            WHERE id = $1 RETURNING id`,
          [sessionBId],
        ),
      );
      expect(updated).toEqual([]);

      const updatedIdempotency = returningRows(
        await runner.query(
          `UPDATE onboarding_idempotency_records SET attempt_count = attempt_count + 1
            WHERE id = $1 RETURNING id`,
          [idempotencyBId],
        ),
      );
      expect(updatedIdempotency).toEqual([]);

      const deleted = returningRows(
        await runner.query(
          `DELETE FROM onboarding_sessions WHERE id = $1 RETURNING id`,
          [sessionBId],
        ),
      );
      expect(deleted).toEqual([]);

      const deletedIdempotency = returningRows(
        await runner.query(
          `DELETE FROM onboarding_idempotency_records WHERE id = $1 RETURNING id`,
          [idempotencyBId],
        ),
      );
      expect(deletedIdempotency).toEqual([]);
    });
  });
});
