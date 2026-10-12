import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../src/core/database/tenant-transaction';
import { createMigrationBuiltSchemaFixture } from '../support/migration-built-schema.helper';
import { normalizeTenantSlug } from '../../src/modules/tenant/tenant-slug';

/**
 * Issue #512 T3 slice 7: tenant isolation for the `change_log` and
 * `forensic_alerts` tables.
 *
 * The schema is built by RUNNING THE FULL MIGRATION SET (via
 * test/support/migration-built-schema.helper.ts), so the RLS shape asserted
 * here is migration 1809310000000's own output — never a hand-written copy.
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
 * - `change_log.tenant_id` is `uuid NOT NULL` with a real FK to tenants(id)
 *   (born uuid in 1794000000000-CreateChangeLogTable), so tenant rows are
 *   seeded first and the FK is exercised, never faked.
 * - `change_log` has NO unique constraint on (target_type, target_id) — the
 *   entity only carries per-tenant indexes — which is why the same-target
 *   cross-tenant case below is meaningful: without RLS an identical target
 *   makes both tenants' audit trails mutually readable through a target
 *   lookup.
 * - `change_log_actor_exactly_one` (1809170000000) requires exactly one of
 *   user_id / actor_ref; the seeded probes carry actor_ref only.
 * - `forensic_alerts.tenant_id` is `uuid NOT NULL` with NO tenant FK
 *   (rebound by 1809130000000, RebindDeviceAndAlertTenantColumns:92), and
 *   alert_type/message are NOT NULL with no unique constraint — the identical
 *   alert case below is therefore ordinary production data.
 * - Every table's NOT NULL columns are supplied by the insert proofs, so each
 *   proof fails (or passes) on RLS alone, never on a missing NOT NULL value.
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

describe('change_log and forensic_alerts tenant RLS (Real PostgreSQL DB, migration-built schema)', () => {
  jest.setTimeout(180000);

  let admin: DataSource;
  let runtime: DataSource;
  let schema: string;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;

  // A and B own the seeded probes; C and D are fresh synthetic tenant
  // contexts for the INSERT proofs (an own-tenant INSERT bound to A or B
  // would sit next to seeded rows, and C/D keep the WITH CHECK proofs free
  // of interference). Tenants exist as real rows — change_log even carries a
  // real FK to tenants(id), and the FK plus the policy compare against them.
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const tenantCId = randomUUID();
  const tenantDId = randomUUID();

  // Two tenants holding audit entries for an IDENTICAL target (the
  // change_log analog of a same-name collision: no unique constraint exists
  // on (target_type, target_id)).
  const SHARED_TARGET_ID = randomUUID();
  const SHARED_TARGET_TYPE = 'ActivationAttempt';

  // Two tenants holding an IDENTICAL forensic alert (alert_type + message).
  const SHARED_ALERT_TYPE = 'HIGH_VALUE_COUNT_ADJUSTMENT';
  const SHARED_ALERT_MESSAGE = 'High-value adjustment awaiting review';

  // Seeded probe rows, one per tenant (A and B).
  const changeLogAId = randomUUID();
  const changeLogBId = randomUUID();
  const alertAId = randomUUID();
  const alertBId = randomUUID();

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

    // Real tenant rows first: the change_log FK and both policies compare
    // against them.
    await admin.query(
      `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $9), ($3, $4, $10), ($5, $6, $11), ($7, $8, $12)`,
      [
        tenantAId,
        'audit-rls-tenant-a',
        tenantBId,
        'audit-rls-tenant-b',
        tenantCId,
        'audit-rls-tenant-c',
        tenantDId,
        'audit-rls-tenant-d',
        normalizeTenantSlug('audit-rls-tenant-a'),
        normalizeTenantSlug('audit-rls-tenant-b'),
        normalizeTenantSlug('audit-rls-tenant-c'),
        normalizeTenantSlug('audit-rls-tenant-d'),
      ],
    );

    // Seeded probes, one identical-target audit entry per tenant A and B.
    await admin.query(
      `INSERT INTO change_log (id, tenant_id, actor_ref, action, target_type, target_id)
       VALUES ($1, $2, 'SYSTEM', 'ONBOARDING_ACTIVATION_ATTEMPT_STARTED', $4, $5),
              ($3, $6, 'SYSTEM', 'ONBOARDING_ACTIVATION_ATTEMPT_STARTED', $4, $5)`,
      [changeLogAId, tenantAId, changeLogBId, SHARED_TARGET_TYPE, SHARED_TARGET_ID, tenantBId],
    );

    // Seeded probes, one identical alert per tenant A and B.
    await admin.query(
      `INSERT INTO forensic_alerts (id, tenant_id, alert_type, severity, message)
       VALUES ($1, $2, $4, 'HIGH', $5), ($3, $6, $4, 'HIGH', $5)`,
      [alertAId, tenantAId, alertBId, SHARED_ALERT_TYPE, SHARED_ALERT_MESSAGE, tenantBId],
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
      `SELECT (SELECT count(*)::int FROM change_log) AS change_log_count,
              (SELECT count(*)::int FROM forensic_alerts) AS alert_count`,
    );
    expect(seeded[0]).toEqual({ change_log_count: 2, alert_count: 2 });

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
          AND tablename IN ('change_log', 'forensic_alerts')
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
          AND c.relname IN ('change_log', 'forensic_alerts')
        ORDER BY c.relname`,
      [schema],
    );

    expect(facts).toEqual([
      { relname: 'change_log', rls_enabled: true, rls_forced: true },
      { relname: 'forensic_alerts', rls_enabled: true, rls_forced: true },
    ]);

    const policies = await admin.query(
      `SELECT tablename, policyname, cmd FROM pg_policies
        WHERE schemaname = $1 AND tablename IN ('change_log', 'forensic_alerts')
        ORDER BY tablename, policyname`,
      [schema],
    );
    // EXACTLY the four command policies per table: an extra policy would
    // widen access beyond the tenant contract, a missing one narrows it.
    expect(policies).toEqual([
      { tablename: 'change_log', policyname: 'change_log_tenant_delete', cmd: 'DELETE' },
      { tablename: 'change_log', policyname: 'change_log_tenant_insert', cmd: 'INSERT' },
      { tablename: 'change_log', policyname: 'change_log_tenant_select', cmd: 'SELECT' },
      { tablename: 'change_log', policyname: 'change_log_tenant_update', cmd: 'UPDATE' },
      {
        tablename: 'forensic_alerts',
        policyname: 'forensic_alerts_tenant_delete',
        cmd: 'DELETE',
      },
      {
        tablename: 'forensic_alerts',
        policyname: 'forensic_alerts_tenant_insert',
        cmd: 'INSERT',
      },
      {
        tablename: 'forensic_alerts',
        policyname: 'forensic_alerts_tenant_select',
        cmd: 'SELECT',
      },
      {
        tablename: 'forensic_alerts',
        policyname: 'forensic_alerts_tenant_update',
        cmd: 'UPDATE',
      },
    ]);
  });

  it('denies an unbound runtime role every row of both tables', async () => {
    await asRuntimeRole(runtime, null, async (runner) => {
      const changeLog = (await runner.query(
        `SELECT count(*)::int AS count FROM change_log`,
      )) as Array<{ count: number }>;
      expect(changeLog[0].count).toBe(0);

      const alerts = (await runner.query(
        `SELECT count(*)::int AS count FROM forensic_alerts`,
      )) as Array<{ count: number }>;
      expect(alerts[0].count).toBe(0);
    });
  });

  it('shows tenant A only its own change_log and forensic_alert rows, never tenant B’s', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const changeLog = (await runner.query(
        `SELECT id FROM change_log`,
      )) as Array<{ id: string }>;
      expect(changeLog.map((r) => r.id)).toEqual([changeLogAId]);

      const alerts = (await runner.query(
        `SELECT id FROM forensic_alerts`,
      )) as Array<{ id: string }>;
      expect(alerts.map((r) => r.id)).toEqual([alertAId]);
    });
  });

  it('shows tenant B only its own rows (triangulation)', async () => {
    await asRuntimeRole(runtime, tenantBId, async (runner) => {
      const changeLog = (await runner.query(
        `SELECT id FROM change_log`,
      )) as Array<{ id: string }>;
      expect(changeLog.map((r) => r.id)).toEqual([changeLogBId]);

      const alerts = (await runner.query(
        `SELECT id FROM forensic_alerts`,
      )) as Array<{ id: string }>;
      expect(alerts.map((r) => r.id)).toEqual([alertBId]);
    });
  });

  it('accepts a tenant-bound runtime role inserting its own rows into both tables', async () => {
    // Bound to tenant C: the own-tenant INSERT is the WITH CHECK half
    // passing. Proven inside the rolled-back transaction — the statement
    // returning its row IS the success.
    await asRuntimeRole(runtime, tenantCId, async (runner) => {
      const insertedLog = returningRows(
        await runner.query(
          `INSERT INTO change_log (tenant_id, actor_ref, action, target_type, target_id)
           VALUES ($1, 'SYSTEM', 'CREATE', 'product', $2) RETURNING id, tenant_id`,
          [tenantCId, randomUUID()],
        ),
      );
      expect(insertedLog).toHaveLength(1);
      expect(insertedLog[0].tenant_id).toBe(tenantCId);

      const insertedAlert = returningRows(
        await runner.query(
          `INSERT INTO forensic_alerts (tenant_id, alert_type, severity, message)
           VALUES ($1, 'SHRINKAGE_HIGH_VALUE', 'HIGH', 'insert-proof-alert') RETURNING id, tenant_id`,
          [tenantCId],
        ),
      );
      expect(insertedAlert).toHaveLength(1);
      expect(insertedAlert[0].tenant_id).toBe(tenantCId);
    });
  });

  it('rejects a tenant-bound runtime role inserting a foreign-tenant row into change_log', async () => {
    // Bound to tenant C, inserting tenant D: a fresh synthetic foreign
    // value, so pre-policy the write itself goes through and post-policy
    // the WITH CHECK clause rejects it. One statement per transaction: the
    // RLS rejection aborts the transaction it happens in.
    await asRuntimeRole(runtime, tenantCId, async (runner) => {
      await expect(
        runner.query(
          `INSERT INTO change_log (tenant_id, actor_ref, action, target_type, target_id)
           VALUES ($1, 'SYSTEM', 'CREATE', 'product', $2) RETURNING id`,
          [tenantDId, randomUUID()],
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it('rejects a tenant-bound runtime role inserting a foreign-tenant row into forensic_alerts', async () => {
    await asRuntimeRole(runtime, tenantCId, async (runner) => {
      await expect(
        runner.query(
          `INSERT INTO forensic_alerts (tenant_id, alert_type, severity, message)
           VALUES ($1, 'SHRINKAGE_HIGH_VALUE', 'HIGH', 'foreign-proof-alert') RETURNING id`,
          [tenantDId],
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it('lets tenant A update and delete its own rows in both tables', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const updatedLog = returningRows(
        await runner.query(
          `UPDATE change_log SET user_email = 'reviewer@example.test' WHERE id = $1 RETURNING id`,
          [changeLogAId],
        ),
      );
      expect(updatedLog.map((r) => r.id)).toEqual([changeLogAId]);

      const updatedAlert = returningRows(
        await runner.query(
          `UPDATE forensic_alerts SET severity = 'CRITICAL' WHERE id = $1 RETURNING id`,
          [alertAId],
        ),
      );
      expect(updatedAlert.map((r) => r.id)).toEqual([alertAId]);

      // Delete of throwaway own rows: insert then delete inside the same
      // transaction, proving DELETE's USING clause admits tenant A's rows.
      const throwawayLog = returningRows(
        await runner.query(
          `INSERT INTO change_log (tenant_id, actor_ref, action, target_type, target_id)
           VALUES ($1, 'SYSTEM', 'CREATE', 'product', $2) RETURNING id`,
          [tenantAId, randomUUID()],
        ),
      );
      const deletedLog = returningRows(
        await runner.query(
          `DELETE FROM change_log WHERE id = $1 RETURNING id`,
          [throwawayLog[0].id],
        ),
      );
      expect(deletedLog.map((r) => r.id)).toEqual([throwawayLog[0].id]);

      const throwawayAlert = returningRows(
        await runner.query(
          `INSERT INTO forensic_alerts (tenant_id, alert_type, severity, message)
           VALUES ($1, 'SHRINKAGE_HIGH_VALUE', 'HIGH', 'delete-proof-alert') RETURNING id`,
          [tenantAId],
        ),
      );
      const deletedAlert = returningRows(
        await runner.query(
          `DELETE FROM forensic_alerts WHERE id = $1 RETURNING id`,
          [throwawayAlert[0].id],
        ),
      );
      expect(deletedAlert.map((r) => r.id)).toEqual([throwawayAlert[0].id]);
    });
  });

  it('stops tenant A’s UPDATE and DELETE from touching tenant B’s rows in either table', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const updatedLog = returningRows(
        await runner.query(
          `UPDATE change_log SET user_email = 'hijack@example.test' WHERE id = $1 RETURNING id`,
          [changeLogBId],
        ),
      );
      expect(updatedLog).toEqual([]);

      const updatedAlert = returningRows(
        await runner.query(
          `UPDATE forensic_alerts SET severity = 'LOW' WHERE id = $1 RETURNING id`,
          [alertBId],
        ),
      );
      expect(updatedAlert).toEqual([]);

      const deletedLog = returningRows(
        await runner.query(`DELETE FROM change_log WHERE id = $1 RETURNING id`, [
          changeLogBId,
        ]),
      );
      expect(deletedLog).toEqual([]);

      const deletedAlert = returningRows(
        await runner.query(
          `DELETE FROM forensic_alerts WHERE id = $1 RETURNING id`,
          [alertBId],
        ),
      );
      expect(deletedAlert).toEqual([]);
    });
  });

  describe('same-target / same-alert cross-tenant isolation (issue #512 T3 slice 7)', () => {
    // VACUITY GUARD — what each assertion below would look like if row level
    // security were ABSENT on these tables (or bypassed by the role):
    //
    //   SELECT id FROM change_log WHERE target_type = ... AND target_id = <shared>
    //     -> TWO rows — both tenants' audit entries for the identical target.
    //   UPDATE change_log SET ... WHERE target_id = <shared> RETURNING id
    //     -> TWO rows — tenant A would mutate tenant B's audit entry through
    //        the target.
    //   SELECT id FROM forensic_alerts WHERE alert_type = ... AND message = <shared>
    //     -> TWO rows — both tenants' identical alerts.
    //   INSERT with tenant_id = tenantAId while bound to tenant C
    //     -> ACCEPTED — a row lands in tenant A's tables without binding.
    //
    // Every `toEqual` below pins EXACTLY ONE id (or zero rows), so a missing
    // or bypassed policy makes these tests fail on the extra foreign row —
    // they cannot pass vacuously.
    it('returns each tenant exactly its own audit entry on a target lookup, never the other tenant’s identical target', async () => {
      await asRuntimeRole(runtime, tenantAId, async (runner) => {
        const rows = (await runner.query(
          `SELECT id FROM change_log WHERE target_type = $1 AND target_id = $2`,
          [SHARED_TARGET_TYPE, SHARED_TARGET_ID],
        )) as Array<{ id: string }>;
        expect(rows.map((r) => r.id)).toEqual([changeLogAId]);
      });

      await asRuntimeRole(runtime, tenantBId, async (runner) => {
        const rows = (await runner.query(
          `SELECT id FROM change_log WHERE target_type = $1 AND target_id = $2`,
          [SHARED_TARGET_TYPE, SHARED_TARGET_ID],
        )) as Array<{ id: string }>;
        expect(rows.map((r) => r.id)).toEqual([changeLogBId]);
      });
    });

    it('returns each tenant exactly its own alert on an identical-alert lookup', async () => {
      await asRuntimeRole(runtime, tenantAId, async (runner) => {
        const rows = (await runner.query(
          `SELECT id FROM forensic_alerts WHERE alert_type = $1 AND message = $2`,
          [SHARED_ALERT_TYPE, SHARED_ALERT_MESSAGE],
        )) as Array<{ id: string }>;
        expect(rows.map((r) => r.id)).toEqual([alertAId]);
      });

      await asRuntimeRole(runtime, tenantBId, async (runner) => {
        const rows = (await runner.query(
          `SELECT id FROM forensic_alerts WHERE alert_type = $1 AND message = $2`,
          [SHARED_ALERT_TYPE, SHARED_ALERT_MESSAGE],
        )) as Array<{ id: string }>;
        expect(rows.map((r) => r.id)).toEqual([alertBId]);
      });
    });

    it('scopes a target-keyed UPDATE to the bound tenant’s own audit entry only', async () => {
      // A target-keyed write mirrors the service's target-driven audit
      // trail; under an absent policy it would RETURN both tenants' ids and
      // overwrite B's entry.
      await asRuntimeRole(runtime, tenantAId, async (runner) => {
        const updated = returningRows(
          await runner.query(
            `UPDATE change_log SET user_email = 'a-only@example.test'
              WHERE target_type = $1 AND target_id = $2 RETURNING id`,
            [SHARED_TARGET_TYPE, SHARED_TARGET_ID],
          ),
        );
        expect(updated.map((r) => r.id)).toEqual([changeLogAId]);
      });
    });

    it('rejects a foreign-tenant INSERT carrying the identical target', async () => {
      // Bound to C, writing tenant A's tenant_id with the shared target:
      // the values match A's row textually, and only the WITH CHECK half
      // stands between this statement and A's audit trail. One statement
      // per transaction: the RLS rejection aborts the transaction it
      // happens in.
      await asRuntimeRole(runtime, tenantCId, async (runner) => {
        await expect(
          runner.query(
            `INSERT INTO change_log (tenant_id, actor_ref, action, target_type, target_id)
             VALUES ($1, 'SYSTEM', 'CREATE', $2, $3) RETURNING id`,
            [tenantAId, SHARED_TARGET_TYPE, SHARED_TARGET_ID],
          ),
        ).rejects.toThrow(/row-level security/i);
      });
    });

    it('rejects a foreign-tenant INSERT carrying the identical alert', async () => {
      await asRuntimeRole(runtime, tenantCId, async (runner) => {
        await expect(
          runner.query(
            `INSERT INTO forensic_alerts (tenant_id, alert_type, severity, message)
             VALUES ($1, $2, 'HIGH', $3) RETURNING id`,
            [tenantAId, SHARED_ALERT_TYPE, SHARED_ALERT_MESSAGE],
          ),
        ).rejects.toThrow(/row-level security/i);
      });
    });
  });
});
