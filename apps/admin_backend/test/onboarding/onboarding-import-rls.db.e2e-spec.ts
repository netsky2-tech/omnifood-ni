import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../src/core/database/tenant-transaction';
import { createMigrationBuiltSchemaFixture } from '../support/migration-built-schema.helper';

/**
 * Issue #493 T2.S3b: tenant isolation for the import/integrity tables
 * `legacy_import_integrity_reports`, `product_import_sessions` and
 * `staging_importacion_productos`.
 *
 * The schema is built by RUNNING THE FULL MIGRATION SET (via
 * test/support/migration-built-schema.helper.ts), so the RLS shape asserted
 * here is migration 1809240000000's own output — never a hand-written copy.
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
 *
 * Synthetic tenant UUIDs only: none of the three tables carries a foreign
 * key to `tenants`, so no tenant rows are needed. Per-table constraint
 * differences are handled explicitly so a constraint conflict never masks
 * the RLS verdict:
 *
 * - `legacy_import_integrity_reports`: no unique constraint; every NOT NULL
 *   jsonb/boolean/status column carries a migration default, so a minimal
 *   (tenant_id) row is valid. `id` has a `gen_random_uuid()` DB default.
 * - `product_import_sessions`: no unique constraint (only non-unique
 *   indexes); `source_hash` is the only NOT NULL column without a default,
 *   so each valid row carries a hash. `id` has a `gen_random_uuid()` DB
 *   default.
 * - `staging_importacion_productos`: uq_staging_importacion_tenant_token_
 *   ordinal is (tenant_id, token_sesion_importacion, row_ordinal), and `id`
 *   (uuid PK) has NO database default (TypeORM generates it client-side),
 *   so every raw INSERT supplies `id` explicitly and every (tenant, token)
 *   pair uses its own row_ordinal 1 — the fresh-tenant C / fresh-tenant D
 *   split keeps the insert proofs constraint-clean. `estado_fila` carries a
 *   default; `token_sesion_importacion` is NOT NULL uuid, so each proof
 *   row mints a fresh synthetic token.
 */

const TABLES = [
  'legacy_import_integrity_reports',
  'product_import_sessions',
  'staging_importacion_productos',
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

describe('onboarding import/integrity tenant RLS (Real PostgreSQL DB, migration-built schema)', () => {
  jest.setTimeout(180000);

  let admin: DataSource;
  let runtime: DataSource;
  let schema: string;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;

  // Synthetic tenants only (no FK to tenants on any of the three tables).
  // A and B own the seeded visibility/update/delete probes; C and D are
  // fresh synthetic tenant contexts for the INSERT proofs, so no unique
  // constraint can fire before the RLS WITH CHECK evaluates.
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const tenantCId = randomUUID();
  const tenantDId = randomUUID();

  const reportAId = randomUUID();
  const reportBId = randomUUID();
  const sessionAId = randomUUID();
  const sessionBId = randomUUID();
  const stagingAId = randomUUID();
  const stagingBId = randomUUID();
  // One synthetic import session token per seeded staging row: the unique
  // constraint is scoped by (tenant, token, ordinal).
  const tokenA = randomUUID();
  const tokenB = randomUUID();

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

    // One valid row per tenant per table, using only the NOT NULL columns
    // the creating migrations (1788000000000 + 1798000000000) declare.
    await admin.query(
      `INSERT INTO legacy_import_integrity_reports (id, tenant_id)
       VALUES ($1, $2), ($3, $4)`,
      [reportAId, tenantAId, reportBId, tenantBId],
    );
    await admin.query(
      `INSERT INTO product_import_sessions (id, tenant_id, source_hash)
       VALUES ($1, $2, 'rls-proof-hash-a'), ($3, $4, 'rls-proof-hash-b')`,
      [sessionAId, tenantAId, sessionBId, tenantBId],
    );
    await admin.query(
      `INSERT INTO staging_importacion_productos
         (id, tenant_id, token_sesion_importacion, raw_nombre, row_ordinal)
       VALUES
         ($1, $2, $3, 'rls-proof-product-a', 1),
         ($4, $5, $6, 'rls-proof-product-b', 1)`,
      [stagingAId, tenantAId, tokenA, stagingBId, tenantBId, tokenB],
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
      `SELECT
         (SELECT count(*)::int FROM legacy_import_integrity_reports) AS reports,
         (SELECT count(*)::int FROM product_import_sessions) AS sessions,
         (SELECT count(*)::int FROM staging_importacion_productos) AS staging`,
    );
    expect(seeded[0]).toEqual({ reports: 2, sessions: 2, staging: 2 });

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
          AND tablename IN ('legacy_import_integrity_reports', 'product_import_sessions', 'staging_importacion_productos')
          AND tableowner = $2`,
      [schema, fixture.runtimeRoleName],
    )) as Array<{ count: number }>;
    expect(ownership[0].count).toBe(0);
  });

  it('enables AND forces row level security on all three tables with one command-specific policy per command', async () => {
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
          AND c.relname IN ('legacy_import_integrity_reports', 'product_import_sessions', 'staging_importacion_productos')
        ORDER BY c.relname`,
      [schema],
    )) as Array<{ relname: string; rls_enabled: boolean; rls_forced: boolean }>;

    expect(facts).toEqual([
      {
        relname: 'legacy_import_integrity_reports',
        rls_enabled: true,
        rls_forced: true,
      },
      {
        relname: 'product_import_sessions',
        rls_enabled: true,
        rls_forced: true,
      },
      {
        relname: 'staging_importacion_productos',
        rls_enabled: true,
        rls_forced: true,
      },
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

  it('denies an unbound runtime role every row of all three tables', async () => {
    await asRuntimeRole(runtime, null, async (runner) => {
      for (const table of TABLES) {
        const rows = (await runner.query(
          `SELECT count(*)::int AS count FROM ${table}`,
        )) as Array<{ count: number }>;
        expect(rows[0].count).toBe(0);
      }
    });
  });

  it('shows tenant A only its own rows in all three tables, never tenant B’s', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const reports = (await runner.query(
        `SELECT id FROM legacy_import_integrity_reports`,
      )) as Array<{ id: string }>;
      expect(reports.map((r) => r.id)).toEqual([reportAId]);

      const sessions = (await runner.query(
        `SELECT id FROM product_import_sessions`,
      )) as Array<{ id: string }>;
      expect(sessions.map((r) => r.id)).toEqual([sessionAId]);

      const staging = (await runner.query(
        `SELECT id FROM staging_importacion_productos`,
      )) as Array<{ id: string }>;
      expect(staging.map((r) => r.id)).toEqual([stagingAId]);
    });
  });

  it('shows tenant B only its own rows (triangulation)', async () => {
    await asRuntimeRole(runtime, tenantBId, async (runner) => {
      const reports = (await runner.query(
        `SELECT id FROM legacy_import_integrity_reports`,
      )) as Array<{ id: string }>;
      expect(reports.map((r) => r.id)).toEqual([reportBId]);

      const sessions = (await runner.query(
        `SELECT id FROM product_import_sessions`,
      )) as Array<{ id: string }>;
      expect(sessions.map((r) => r.id)).toEqual([sessionBId]);

      const staging = (await runner.query(
        `SELECT id FROM staging_importacion_productos`,
      )) as Array<{ id: string }>;
      expect(staging.map((r) => r.id)).toEqual([stagingBId]);
    });
  });

  it('accepts a tenant-bound runtime role inserting its own rows into all three tables', async () => {
    // Bound to tenant C (a real synthetic tenant context with no seeded
    // rows, see the constraint note above): the own-tenant INSERT is the
    // WITH CHECK half passing. Proven inside the rolled-back transaction —
    // the statement returning its row IS the success.
    await asRuntimeRole(runtime, tenantCId, async (runner) => {
      const insertedReport = returningRows(
        await runner.query(
          `INSERT INTO legacy_import_integrity_reports (tenant_id)
           VALUES ($1) RETURNING id, tenant_id`,
          [tenantCId],
        ),
      );
      expect(insertedReport).toHaveLength(1);
      expect(insertedReport[0].tenant_id).toBe(tenantCId);

      const insertedSession = returningRows(
        await runner.query(
          `INSERT INTO product_import_sessions (tenant_id, source_hash)
           VALUES ($1, 'rls-proof-hash-c') RETURNING id, tenant_id`,
          [tenantCId],
        ),
      );
      expect(insertedSession).toHaveLength(1);
      expect(insertedSession[0].tenant_id).toBe(tenantCId);

      const insertedStaging = returningRows(
        await runner.query(
          `INSERT INTO staging_importacion_productos
             (id, tenant_id, token_sesion_importacion, raw_nombre, row_ordinal)
           VALUES ($1, $2, $3, 'rls-proof-product-c', 1) RETURNING id, tenant_id`,
          [randomUUID(), tenantCId, randomUUID()],
        ),
      );
      expect(insertedStaging).toHaveLength(1);
      expect(insertedStaging[0].tenant_id).toBe(tenantCId);
    });
  });

  it('rejects a tenant-bound runtime role inserting a foreign-tenant row into any of the three tables', async () => {
    // Bound to tenant C, inserting tenant D: a fresh synthetic foreign
    // value, so pre-policy the write itself goes through (no unique
    // conflict to mask the behavioral failure) and post-policy the WITH
    // CHECK clause rejects it. One transaction per rejection: the first
    // WITH CHECK failure aborts its transaction, which would otherwise
    // poison the second statement with "current transaction is aborted".
    for (const [table, insertSql] of [
      [
        'legacy_import_integrity_reports',
        `INSERT INTO legacy_import_integrity_reports (tenant_id)
         VALUES ($1) RETURNING id`,
      ],
      [
        'product_import_sessions',
        `INSERT INTO product_import_sessions (tenant_id, source_hash)
         VALUES ($1, 'rls-proof-hash-d') RETURNING id`,
      ],
      [
        'staging_importacion_productos',
        `INSERT INTO staging_importacion_productos
           (id, tenant_id, token_sesion_importacion, raw_nombre, row_ordinal)
         VALUES ($2, $1, $3, 'rls-proof-product-d', 1) RETURNING id`,
      ],
    ] as const) {
      await asRuntimeRole(runtime, tenantCId, async (runner) => {
        const foreignValue =
          table === 'staging_importacion_productos'
            ? [tenantDId, randomUUID(), randomUUID()]
            : [tenantDId];
        await expect(runner.query(insertSql, foreignValue)).rejects.toThrow(
          /row-level security/i,
        );
        void table;
      });
    }
  });

  it('lets tenant A update and delete its own rows in every table', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const updatedReport = returningRows(
        await runner.query(
          `UPDATE legacy_import_integrity_reports SET reviewed_by = 'rls-proof'
            WHERE id = $1 RETURNING id`,
          [reportAId],
        ),
      );
      expect(updatedReport.map((r) => r.id)).toEqual([reportAId]);

      const updatedSession = returningRows(
        await runner.query(
          `UPDATE product_import_sessions SET status = 'UPLOADED'
            WHERE id = $1 RETURNING id`,
          [sessionAId],
        ),
      );
      expect(updatedSession.map((r) => r.id)).toEqual([sessionAId]);

      const updatedStaging = returningRows(
        await runner.query(
          `UPDATE staging_importacion_productos SET raw_nombre = 'rls-proof-updated'
            WHERE id = $1 RETURNING id`,
          [stagingAId],
        ),
      );
      expect(updatedStaging.map((r) => r.id)).toEqual([stagingAId]);

      // Delete of a throwaway own row per table: insert then delete inside
      // the same transaction, proving DELETE's USING clause admits tenant
      // A's rows through each table's own policy. The staging throwaway
      // carries its own fresh token so the (tenant, token, ordinal) unique
      // constraint cannot fire before the RLS verdict.
      const throwawayReport = returningRows(
        await runner.query(
          `INSERT INTO legacy_import_integrity_reports (tenant_id)
           VALUES ($1) RETURNING id`,
          [tenantAId],
        ),
      );
      const deletedReport = returningRows(
        await runner.query(
          `DELETE FROM legacy_import_integrity_reports WHERE id = $1 RETURNING id`,
          [throwawayReport[0].id],
        ),
      );
      expect(deletedReport.map((r) => r.id)).toEqual([throwawayReport[0].id]);

      const throwawaySession = returningRows(
        await runner.query(
          `INSERT INTO product_import_sessions (tenant_id, source_hash)
           VALUES ($1, 'rls-proof-hash-del-a') RETURNING id`,
          [tenantAId],
        ),
      );
      const deletedSession = returningRows(
        await runner.query(
          `DELETE FROM product_import_sessions WHERE id = $1 RETURNING id`,
          [throwawaySession[0].id],
        ),
      );
      expect(deletedSession.map((r) => r.id)).toEqual([throwawaySession[0].id]);

      const throwawayStaging = returningRows(
        await runner.query(
          `INSERT INTO staging_importacion_productos
             (id, tenant_id, token_sesion_importacion, raw_nombre, row_ordinal)
           VALUES ($1, $2, $3, 'rls-proof-product-del-a', 1) RETURNING id`,
          [randomUUID(), tenantAId, randomUUID()],
        ),
      );
      const deletedStaging = returningRows(
        await runner.query(
          `DELETE FROM staging_importacion_productos WHERE id = $1 RETURNING id`,
          [throwawayStaging[0].id],
        ),
      );
      expect(deletedStaging.map((r) => r.id)).toEqual([throwawayStaging[0].id]);
    });
  });

  it('stops tenant A’s UPDATE and DELETE from touching tenant B’s rows in any of the three tables', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const updatedReport = returningRows(
        await runner.query(
          `UPDATE legacy_import_integrity_reports SET reviewed_by = 'rls-proof'
            WHERE id = $1 RETURNING id`,
          [reportBId],
        ),
      );
      expect(updatedReport).toEqual([]);

      const updatedSession = returningRows(
        await runner.query(
          `UPDATE product_import_sessions SET status = 'UPLOADED'
            WHERE id = $1 RETURNING id`,
          [sessionBId],
        ),
      );
      expect(updatedSession).toEqual([]);

      const updatedStaging = returningRows(
        await runner.query(
          `UPDATE staging_importacion_productos SET raw_nombre = 'rls-proof-updated'
            WHERE id = $1 RETURNING id`,
          [stagingBId],
        ),
      );
      expect(updatedStaging).toEqual([]);

      const deletedReport = returningRows(
        await runner.query(
          `DELETE FROM legacy_import_integrity_reports WHERE id = $1 RETURNING id`,
          [reportBId],
        ),
      );
      expect(deletedReport).toEqual([]);

      const deletedSession = returningRows(
        await runner.query(
          `DELETE FROM product_import_sessions WHERE id = $1 RETURNING id`,
          [sessionBId],
        ),
      );
      expect(deletedSession).toEqual([]);

      const deletedStaging = returningRows(
        await runner.query(
          `DELETE FROM staging_importacion_productos WHERE id = $1 RETURNING id`,
          [stagingBId],
        ),
      );
      expect(deletedStaging).toEqual([]);
    });
  });
});
