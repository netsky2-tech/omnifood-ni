import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../src/core/database/tenant-transaction';
import { createMigrationBuiltSchemaFixture } from '../support/migration-built-schema.helper';

/**
 * Issue #512 T3 slice 10: the command-policy ratchet for the three tables
 * whose FOR ALL tenant policies were split into per-command policies by
 * migration 1809340000000 (founder decision):
 *
 *   kardex_correction        -> SELECT + INSERT          (append-only ledger)
 *   sys_parametros_config    -> SELECT + INSERT          (append-only ledger)
 *   kardex_recalculate_queue -> SELECT + INSERT + UPDATE (worker queue)
 *
 * The schema is built by RUNNING THE FULL MIGRATION SET (via
 * test/support/migration-built-schema.helper.ts), so the RLS shape asserted
 * here is migration 1809340000000's own output — never a hand-written copy.
 * The application-shaped connection is the fixture's runtime role:
 * `NOSUPERUSER NOBYPASSRLS`, owner of nothing, holding exactly ordinary
 * SELECT/INSERT/UPDATE/DELETE on the scratch schema's tables. Under FORCEd
 * row-level security every query it makes is subject to the migrated
 * policies; the superuser connection exists only to seed tenants and the
 * fixture rows.
 *
 * What this spec proves BEYOND the unit spec:
 * - The catalog really carries the per-command policy sets after migration
 *   (and no `ALL` policy survives on any of the three tables) — the exact
 *   declared sets the coverage manifest now pins.
 * - kardex_correction / sys_parametros_config: INSERT works bound;
 *   UPDATE+DELETE are denied BY RLS, not only by the immutability trigger —
 *   a bound UPDATE/DELETE (foreign tenant AND owner alike, since the declared
 *   set direct:SI leaves those commands with no policy) resolves with ZERO
 *   affected rows and NO exception, while the same binding still sees the row
 *   through SELECT. If RLS were absent (or the FOR ALL policy still present),
 *   the immutability trigger would RAISE instead of resolving silently.
 * - kardex_recalculate_queue: UPDATE works bound.
 * - Role proof + vacuity guards per the established harness pattern: the
 *   runtime role is a non-owner that cannot bypass RLS, rows exist (seeded
 *   counts), and the same-bound-tenant control proves a row IS reachable —
 *   so every zero-row denial below is policy filtering, never an empty table.
 *
 * Every runtime-role observation runs inside a transaction that binds the
 * tenant context with the production SQL (TENANT_CONTEXT_SET_CONFIG_SQL,
 * transaction-local) and is then ROLLED BACK: the GUC is discarded with the
 * transaction, so the pool is never left with a defined-and-empty
 * `app.tenant_id` (the issue #358 poisoning), and the runtime role never
 * mutates the fixtures.
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
 * Every DML proof below uses RETURNING so the shape is stable; this helper
 * extracts the affected row count.
 */
function affectedRows(result: unknown): number {
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[1] as number;
  }
  return 0;
}

/** TypeORM's postgres query runner DML shape: the rows half of [rows, count]. */
function returningRows(result: unknown): Array<{ id: string }> {
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0] as Array<{ id: string }>;
  }
  return (Array.isArray(result) ? result : []) as Array<{ id: string }>;
}

describe('kardex/config command-policy ratchet (Real PostgreSQL DB, migration-built schema)', () => {
  jest.setTimeout(180000);

  let admin: DataSource;
  let runtime: DataSource;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;

  // A owns the seeded probe rows; B is a second tenant that must not reach
  // them; C is a fresh synthetic tenant for the INSERT proofs. Tenants exist
  // as real rows — tenant_id is uuid NOT NULL on all three tables.
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const tenantCId = randomUUID();

  // Seeded probe rows, all owned by tenant A. The parametro id is captured
  // after seeding (the table's primary key is a BIGSERIAL, not a uuid).
  const correctionAId = randomUUID();
  let parametroAId = '';
  const queueAId = randomUUID();

  beforeAll(async () => {
    fixture = await createMigrationBuiltSchemaFixture();
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
      schema: fixture.schema,
      ...poolCleanupExtra,
      extra: {
        ...poolCleanupExtra.extra,
        options: `-c search_path=${fixture.schema},public`,
      },
    });
    await admin.initialize();

    // Real tenant rows first: the tables carry tenant_id uuid NOT NULL.
    await admin.query(
      `INSERT INTO tenants (id, name) VALUES ($1, $2), ($3, $4), ($5, $6)`,
      [
        tenantAId,
        'kardex-ratchet-tenant-a',
        tenantBId,
        'kardex-ratchet-tenant-b',
        tenantCId,
        'kardex-ratchet-tenant-c',
      ],
    );

    await admin.query(
      `INSERT INTO kardex_correction
         (id, tenant_id, insumo_id, origin_movement_id, trigger_movement_id,
          previous_unit_cost_nio, recalculated_unit_cost_nio,
          delta_unit_cost_nio, total_delta_cost_nio, affected_quantity,
          lineage_hash)
       VALUES ($1, $2, $3, 101, 102, 100.0000, 110.0000, 10.0000, 10.0000, 1.0000, $4)`,
      [correctionAId, tenantAId, randomUUID(), 'ratchet-lineage-a'],
    );

    await admin.query(
      `INSERT INTO sys_parametros_config (id, tenant_id, param_key, param_value)
       VALUES (DEFAULT, $1, 'ratchet.probe.key', '{"probe": true}'::jsonb)`,
      [tenantAId],
    );
    const parametroRow = await admin.query(
      `SELECT id FROM sys_parametros_config WHERE tenant_id = $1`,
      [tenantAId],
    );
    parametroAId = parametroRow[0].id;

    await admin.query(
      `INSERT INTO kardex_recalculate_queue
         (id, tenant_id, insumo_id, origin_movement_id, trigger_movement_id)
       VALUES ($1, $2, $3, 201, 202)`,
      [queueAId, tenantAId, randomUUID()],
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

  it('seeds the probe rows through the superuser and proves the runtime role is a table non-owner that cannot bypass RLS', async () => {
    const seeded = await admin.query(
      `SELECT (SELECT count(*)::int FROM kardex_correction) AS corrections,
              (SELECT count(*)::int FROM sys_parametros_config) AS parametros,
              (SELECT count(*)::int FROM kardex_recalculate_queue) AS queue_rows`,
    );
    // VACUITY GUARD: every denial below would be meaningless without rows.
    expect(seeded[0]).toEqual({ corrections: 1, parametros: 1, queue_rows: 1 });

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
          AND tablename IN ('kardex_correction', 'sys_parametros_config', 'kardex_recalculate_queue')
          AND tableowner = $2`,
      [fixture.schema, fixture.runtimeRoleName],
    );
    expect(ownership[0].count).toBe(0);
  });

  it('carries exactly the declared per-command policy sets and no ALL policy after migration', async () => {
    const policies = await admin.query(
      `SELECT tablename, policyname, cmd FROM pg_policies
        WHERE schemaname = $1
          AND tablename IN ('kardex_correction', 'sys_parametros_config', 'kardex_recalculate_queue')
        ORDER BY tablename, policyname`,
      [fixture.schema],
    );

    expect(policies).toEqual([
      {
        tablename: 'kardex_correction',
        policyname: 'kardex_correction_tenant_insert',
        cmd: 'INSERT',
      },
      {
        tablename: 'kardex_correction',
        policyname: 'kardex_correction_tenant_select',
        cmd: 'SELECT',
      },
      {
        tablename: 'kardex_recalculate_queue',
        policyname: 'kardex_recalculate_queue_tenant_insert',
        cmd: 'INSERT',
      },
      {
        tablename: 'kardex_recalculate_queue',
        policyname: 'kardex_recalculate_queue_tenant_select',
        cmd: 'SELECT',
      },
      {
        tablename: 'kardex_recalculate_queue',
        policyname: 'kardex_recalculate_queue_tenant_update',
        cmd: 'UPDATE',
      },
      {
        tablename: 'sys_parametros_config',
        policyname: 'sys_parametros_config_tenant_insert',
        cmd: 'INSERT',
      },
      {
        tablename: 'sys_parametros_config',
        policyname: 'sys_parametros_config_tenant_select',
        cmd: 'SELECT',
      },
    ]);

    // Defensive: no FOR ALL policy survives the conversion on any of the
    // three tables (the toEqual above already pins the exact set; this is
    // the explicit statement of the founder decision).
    const allPolicies = await admin.query(
      `SELECT count(*)::int AS count FROM pg_policies
        WHERE schemaname = $1 AND cmd = 'ALL'
          AND tablename IN ('kardex_correction', 'sys_parametros_config', 'kardex_recalculate_queue')`,
      [fixture.schema],
    );
    expect(allPolicies[0].count).toBe(0);
  });

  describe('kardex_correction (declared direct:SI — append-only ledger)', () => {
    it('accepts a bound INSERT under the fresh synthetic tenant C', async () => {
      await asRuntimeRole(runtime, tenantCId, async (runner) => {
        const inserted = returningRows(
          await runner.query(
            `INSERT INTO kardex_correction
               (tenant_id, insumo_id, origin_movement_id, trigger_movement_id,
                previous_unit_cost_nio, recalculated_unit_cost_nio,
                delta_unit_cost_nio, total_delta_cost_nio, affected_quantity,
                lineage_hash)
             VALUES ($1, $2, 301, 302, 50.0000, 55.0000, 5.0000, 5.0000, 1.0000, $3)
             RETURNING id`,
            [tenantCId, randomUUID(), 'ratchet-lineage-c'],
          ),
        );
        expect(inserted).toHaveLength(1);
      });
    });

    it('denies a foreign-tenant UPDATE and DELETE BY RLS with zero affected rows and no exception', async () => {
      // NOT the immutability trigger: with tenant B bound, tenant A's row is
      // invisible to the UPDATE/DELETE, so the statement resolves silently
      // with zero affected rows. If RLS were absent (or the FOR ALL policy
      // still present), the immutability trigger would RAISE instead.
      await asRuntimeRole(runtime, tenantBId, async (runner) => {
        const updated = returningRows(
          await runner.query(
            `UPDATE kardex_correction SET recalculated_unit_cost_nio = 1.0000
              WHERE id = $1 RETURNING id`,
            [correctionAId],
          ),
        );
        expect(updated).toEqual([]);

        const deleted = returningRows(
          await runner.query(
            `DELETE FROM kardex_correction WHERE id = $1 RETURNING id`,
            [correctionAId],
          ),
        );
        expect(deleted).toEqual([]);
      });
    });

    it('keeps the seeded row visible to a bound SELECT (vacuity guard)', async () => {
      // Control for the zero-row denials below: with tenant A bound the row
      // IS reachable, so those results are policy filtering, never vacancy.
      await asRuntimeRole(runtime, tenantAId, async (runner) => {
        const rows = (await runner.query(
          `SELECT id FROM kardex_correction WHERE id = $1`,
          [correctionAId],
        )) as Array<{ id: string }>;
        expect(rows.map((row) => row.id)).toEqual([correctionAId]);
      });
    });

    it('denies even the bound owner tenant an UPDATE and a DELETE with zero affected rows and no exception', async () => {
      // The declared set direct:SI leaves UPDATE and DELETE with NO policy,
      // and RLS is deny-by-default per command: even the owner's bound
      // UPDATE/DELETE resolves with zero affected rows — the row is provably
      // visible to the same binding (SELECT control above), so this is the
      // MISSING UPDATE/DELETE policy denying, and the immutability trigger is
      // unreachable through RLS rather than the thing doing the denying.
      await asRuntimeRole(runtime, tenantAId, async (runner) => {
        const updated = returningRows(
          await runner.query(
            `UPDATE kardex_correction SET recalculated_unit_cost_nio = 1.0000
              WHERE id = $1 RETURNING id`,
            [correctionAId],
          ),
        );
        expect(updated).toEqual([]);

        const deleted = returningRows(
          await runner.query(
            `DELETE FROM kardex_correction WHERE id = $1 RETURNING id`,
            [correctionAId],
          ),
        );
        expect(deleted).toEqual([]);
      });
    });
  });

  describe('sys_parametros_config (declared direct:SI — append-only ledger)', () => {
    it('accepts a bound INSERT under the fresh synthetic tenant C', async () => {
      await asRuntimeRole(runtime, tenantCId, async (runner) => {
        const inserted = returningRows(
          await runner.query(
            `INSERT INTO sys_parametros_config (tenant_id, param_key, param_value)
             VALUES ($1, 'ratchet.c.key', '{"probe": 2}'::jsonb) RETURNING id`,
            [tenantCId],
          ),
        );
        expect(inserted).toHaveLength(1);
      });
    });

    it('denies a foreign-tenant UPDATE and DELETE BY RLS with zero affected rows and no exception', async () => {
      await asRuntimeRole(runtime, tenantBId, async (runner) => {
        const updated = returningRows(
          await runner.query(
            `UPDATE sys_parametros_config SET param_value = '{"probe": 9}'::jsonb
              WHERE id = $1 RETURNING id`,
            [parametroAId],
          ),
        );
        expect(updated).toEqual([]);

        const deleted = returningRows(
          await runner.query(
            `DELETE FROM sys_parametros_config WHERE id = $1 RETURNING id`,
            [parametroAId],
          ),
        );
        expect(deleted).toEqual([]);
      });
    });

    it('keeps the seeded row visible to a bound SELECT (vacuity guard)', async () => {
      await asRuntimeRole(runtime, tenantAId, async (runner) => {
        const rows = (await runner.query(
          `SELECT id FROM sys_parametros_config WHERE id = $1`,
          [parametroAId],
        )) as Array<{ id: string }>;
        expect(rows.map((row) => row.id)).toEqual([parametroAId]);
      });
    });

    it('denies even the bound owner tenant an UPDATE and a DELETE with zero affected rows and no exception', async () => {
      // Same shape as kardex_correction: direct:SI leaves UPDATE and DELETE
      // with no policy and deny-by-default applies to the owner too, so the
      // immutability trigger is unreachable through RLS.
      await asRuntimeRole(runtime, tenantAId, async (runner) => {
        const updated = returningRows(
          await runner.query(
            `UPDATE sys_parametros_config SET param_value = '{"probe": 9}'::jsonb
              WHERE id = $1 RETURNING id`,
            [parametroAId],
          ),
        );
        expect(updated).toEqual([]);

        const deleted = returningRows(
          await runner.query(
            `DELETE FROM sys_parametros_config WHERE id = $1 RETURNING id`,
            [parametroAId],
          ),
        );
        expect(deleted).toEqual([]);
      });
    });
  });

  describe('kardex_recalculate_queue (declared direct:SIU — worker queue)', () => {
    it('accepts a bound UPDATE of the queue row state under the owning tenant', async () => {
      await asRuntimeRole(runtime, tenantAId, async (runner) => {
        const result = await runner.query(
          `UPDATE kardex_recalculate_queue
             SET status = 'PROCESSING', attempts = attempts + 1, claimed_by = 'ratchet-spec'
            WHERE id = $1 RETURNING id`,
          [queueAId],
        );
        expect(affectedRows(result)).toBe(1);
        expect(returningRows(result).map((row) => row.id)).toEqual([queueAId]);
      });
    });

    it('denies a foreign-tenant UPDATE with zero affected rows', async () => {
      await asRuntimeRole(runtime, tenantBId, async (runner) => {
        const updated = returningRows(
          await runner.query(
            `UPDATE kardex_recalculate_queue SET status = 'FAILED'
              WHERE id = $1 RETURNING id`,
            [queueAId],
          ),
        );
        expect(updated).toEqual([]);
      });
    });

    it('denies even the owner tenant a DELETE: no DELETE policy exists (deny-by-default)', async () => {
      await asRuntimeRole(runtime, tenantAId, async (runner) => {
        const deleted = returningRows(
          await runner.query(
            `DELETE FROM kardex_recalculate_queue WHERE id = $1 RETURNING id`,
            [queueAId],
          ),
        );
        expect(deleted).toEqual([]);
      });
    });
  });
});
