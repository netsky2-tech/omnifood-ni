import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../src/core/database/tenant-transaction';
import { createMigrationBuiltSchemaFixture } from '../support/migration-built-schema.helper';
import { normalizeTenantSlug } from '../../src/modules/tenant/tenant-slug';

/**
 * Issue #512 T3 slice 5: tenant isolation for the cash tables
 * `cash_movements` and `cash_shift_sessions`.
 *
 * The schema is built by RUNNING THE FULL MIGRATION SET (via
 * test/support/migration-built-schema.helper.ts), so the RLS shape asserted
 * here is migration 1809290000000's own output — never a hand-written copy.
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
 * - Both tables carry `tenant_id uuid NOT NULL` from birth
 *   (1759000000002:477 and :507) with no tenant FK and no further
 *   tenant-scoped parent, so the policies are exercised directly.
 * - `cash_movements.shift_id` is a plain uuid with NO FK constraint in the
 *   bootstrap migration, so seeding needs only the synthetic tenant rows
 *   used as policy values. Every insert proof below therefore fails (or
 *   passes) on RLS alone, never on a missing FK parent.
 * - `cashier_sessions` is deliberately out of scope for this slice: it has
 *   no TypeORM entity and stays classified as `debt` in the RLS coverage
 *   manifest (adding a `tenant_id uuid` column there would trip the
 *   schema-build gate's uuid-without-entity check). There is no POS work in
 *   this slice.
 */

const TABLES = ['cash_movements', 'cash_shift_sessions'] as const;

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

describe('cash shift tenant RLS (Real PostgreSQL DB, migration-built schema)', () => {
  jest.setTimeout(180000);

  let admin: DataSource;
  let runtime: DataSource;
  let schema: string;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;

  // A and B own the seeded probes; C and D are fresh synthetic tenant
  // contexts for the INSERT proofs (an own-tenant INSERT bound to A or B
  // would sit next to seeded rows, and C/D keep the WITH CHECK proofs free
  // of interference). Tenants exist as real rows even though the cash tables
  // carry no tenant FK — they are the values the policies compare against.
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const tenantCId = randomUUID();
  const tenantDId = randomUUID();

  // Seeded probe rows, one per tenant per table (A and B).
  const cashMovementAId = randomUUID();
  const cashMovementBId = randomUUID();
  const cashShiftAId = randomUUID();
  const cashShiftBId = randomUUID();

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
      `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $9), ($3, $4, $10), ($5, $6, $11), ($7, $8, $12)`,
      [
        tenantAId,
        'cash-shift-rls-tenant-a',
        tenantBId,
        'cash-shift-rls-tenant-b',
        tenantCId,
        'cash-shift-rls-tenant-c',
        tenantDId,
        'cash-shift-rls-tenant-d',
                normalizeTenantSlug('cash-shift-rls-tenant-a'),
        normalizeTenantSlug('cash-shift-rls-tenant-b'),
        normalizeTenantSlug('cash-shift-rls-tenant-c'),
        normalizeTenantSlug('cash-shift-rls-tenant-d'),
      ],
    );

    // Seeded probes, one row per table per tenant A and B.
    await admin.query(
      `INSERT INTO cash_shift_sessions (id, tenant_id, terminal_id, cashier_id, cashier_name)
       VALUES ($1, $2, 'POS-01', 'user-a', 'Cajero A'), ($3, $4, 'POS-01', 'user-b', 'Cajero B')`,
      [cashShiftAId, tenantAId, cashShiftBId, tenantBId],
    );
    await admin.query(
      `INSERT INTO cash_movements (id, tenant_id, shift_id, terminal_id, type, reason)
       VALUES ($1, $2, $3, 'POS-01', 'CASH_IN', 'apertura cambio menudo'),
              ($4, $5, $6, 'POS-01', 'CASH_IN', 'apertura cambio menudo')`,
      [
        cashMovementAId,
        tenantAId,
        cashShiftAId,
        cashMovementBId,
        tenantBId,
        cashShiftBId,
      ],
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
      `SELECT (SELECT count(*)::int FROM cash_movements) AS cash_movements,
              (SELECT count(*)::int FROM cash_shift_sessions) AS cash_shift_sessions`,
    );
    expect(seeded[0]).toEqual({
      cash_movements: 2,
      cash_shift_sessions: 2,
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
          AND tablename IN ('cash_movements', 'cash_shift_sessions')
          AND tableowner = $2`,
      [schema, fixture.runtimeRoleName],
    );
    expect(ownership[0].count).toBe(0);
  });

  it('enables AND forces row level security on both cash tables with exactly one command-specific policy per command', async () => {
    const facts = await admin.query(
      `SELECT c.relname, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1
          AND c.relname IN ('cash_movements', 'cash_shift_sessions')
        ORDER BY c.relname`,
      [schema],
    );

    expect(facts).toEqual([
      { relname: 'cash_movements', rls_enabled: true, rls_forced: true },
      { relname: 'cash_shift_sessions', rls_enabled: true, rls_forced: true },
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
      const own = {
        cash_movements: cashMovementAId,
        cash_shift_sessions: cashShiftAId,
      } as const;
      for (const [table, id] of Object.entries(own)) {
        const rows = (await runner.query(`SELECT id FROM ${table}`)) as Array<{
          id: string;
        }>;
        expect(rows.map((r) => r.id)).toEqual([id]);
      }
    });
  });

  it('shows tenant B only its own rows in both tables (triangulation)', async () => {
    await asRuntimeRole(runtime, tenantBId, async (runner) => {
      const own = {
        cash_movements: cashMovementBId,
        cash_shift_sessions: cashShiftBId,
      } as const;
      for (const [table, id] of Object.entries(own)) {
        const rows = (await runner.query(`SELECT id FROM ${table}`)) as Array<{
          id: string;
        }>;
        expect(rows.map((r) => r.id)).toEqual([id]);
      }
    });
  });

  it('accepts a tenant-bound runtime role inserting its own rows into both tables', async () => {
    // Bound to tenant C: the own-tenant INSERT is the WITH CHECK half
    // passing. Proven inside the rolled-back transaction — the statement
    // returning its row IS the success.
    await asRuntimeRole(runtime, tenantCId, async (runner) => {
      const insertedShift = returningRows(
        await runner.query(
          `INSERT INTO cash_shift_sessions (tenant_id, terminal_id, cashier_id, cashier_name)
           VALUES ($1, 'POS-01', 'user-c', 'Cajero C') RETURNING id, tenant_id`,
          [tenantCId],
        ),
      );
      expect(insertedShift).toHaveLength(1);
      expect(insertedShift[0].tenant_id).toBe(tenantCId);

      const insertedMovement = returningRows(
        await runner.query(
          `INSERT INTO cash_movements (tenant_id, shift_id, terminal_id, type, reason)
           VALUES ($1, $2, 'POS-01', 'CASH_OUT', 'retiro parcial') RETURNING id, tenant_id`,
          [tenantCId, insertedShift[0].id],
        ),
      );
      expect(insertedMovement).toHaveLength(1);
      expect(insertedMovement[0].tenant_id).toBe(tenantCId);
    });
  });

  it('rejects a tenant-bound runtime role inserting a foreign-tenant row into either of the two tables', async () => {
    // Bound to tenant C, inserting tenant D: a fresh synthetic foreign
    // value, so pre-policy the write itself goes through and post-policy
    // the WITH CHECK clause rejects it. One transaction per rejection: the
    // first WITH CHECK failure aborts its transaction, which would
    // otherwise poison the next statement with "current transaction is
    // aborted".
    await asRuntimeRole(runtime, tenantCId, async (runner) => {
      await expect(
        runner.query(
          `INSERT INTO cash_shift_sessions (tenant_id, terminal_id, cashier_id, cashier_name)
           VALUES ($1, 'POS-01', 'user-d', 'Cajero D') RETURNING id`,
          [tenantDId],
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    await asRuntimeRole(runtime, tenantCId, async (runner) => {
      await expect(
        runner.query(
          `INSERT INTO cash_movements (tenant_id, shift_id, terminal_id, type, reason)
           VALUES ($1, $2, 'POS-01', 'CASH_OUT', 'foreign') RETURNING id`,
          [tenantDId, cashShiftAId],
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it('lets tenant A update and delete its own rows in both tables', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const updatedMovement = returningRows(
        await runner.query(
          `UPDATE cash_movements SET reason = 'audited' WHERE id = $1 RETURNING id`,
          [cashMovementAId],
        ),
      );
      expect(updatedMovement.map((r) => r.id)).toEqual([cashMovementAId]);

      const updatedShift = returningRows(
        await runner.query(
          `UPDATE cash_shift_sessions SET notes = 'audited' WHERE id = $1 RETURNING id`,
          [cashShiftAId],
        ),
      );
      expect(updatedShift.map((r) => r.id)).toEqual([cashShiftAId]);

      // Delete of throwaway own rows: insert then delete inside the same
      // transaction, proving DELETE's USING clause admits tenant A's rows.
      const throwawayMovement = returningRows(
        await runner.query(
          `INSERT INTO cash_movements (tenant_id, shift_id, terminal_id, type, reason)
           VALUES ($1, $2, 'POS-01', 'CASH_IN', 'throwaway') RETURNING id`,
          [tenantAId, cashShiftAId],
        ),
      );
      const deletedMovement = returningRows(
        await runner.query(
          `DELETE FROM cash_movements WHERE id = $1 RETURNING id`,
          [throwawayMovement[0].id],
        ),
      );
      expect(deletedMovement.map((r) => r.id)).toEqual([
        throwawayMovement[0].id,
      ]);

      const throwawayShift = returningRows(
        await runner.query(
          `INSERT INTO cash_shift_sessions (tenant_id, terminal_id, cashier_id, cashier_name)
           VALUES ($1, 'POS-01', 'user-a', 'Cajero A throwaway') RETURNING id`,
          [tenantAId],
        ),
      );
      const deletedShift = returningRows(
        await runner.query(
          `DELETE FROM cash_shift_sessions WHERE id = $1 RETURNING id`,
          [throwawayShift[0].id],
        ),
      );
      expect(deletedShift.map((r) => r.id)).toEqual([throwawayShift[0].id]);
    });
  });

  it('stops tenant A’s UPDATE and DELETE from touching tenant B’s rows in either table', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const updatedMovement = returningRows(
        await runner.query(
          `UPDATE cash_movements SET reason = 'hijacked' WHERE id = $1 RETURNING id`,
          [cashMovementBId],
        ),
      );
      expect(updatedMovement).toEqual([]);

      const updatedShift = returningRows(
        await runner.query(
          `UPDATE cash_shift_sessions SET notes = 'hijacked' WHERE id = $1 RETURNING id`,
          [cashShiftBId],
        ),
      );
      expect(updatedShift).toEqual([]);

      const deletedMovement = returningRows(
        await runner.query(
          `DELETE FROM cash_movements WHERE id = $1 RETURNING id`,
          [cashMovementBId],
        ),
      );
      expect(deletedMovement).toEqual([]);

      const deletedShift = returningRows(
        await runner.query(
          `DELETE FROM cash_shift_sessions WHERE id = $1 RETURNING id`,
          [cashShiftBId],
        ),
      );
      expect(deletedShift).toEqual([]);
    });
  });
});
