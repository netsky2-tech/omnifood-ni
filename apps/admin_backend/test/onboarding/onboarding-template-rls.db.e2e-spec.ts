import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../src/core/database/tenant-transaction';
import { createMigrationBuiltSchemaFixture } from '../support/migration-built-schema.helper';

/**
 * Issue #493 T2.S3a: tenant isolation for the template/provenance tables
 * `onboarding_template_applications`, `onboarding_template_seed_links` and
 * `legacy_onboarding_migration_receipts`.
 *
 * The schema is built by RUNNING THE FULL MIGRATION SET (via
 * test/support/migration-built-schema.helper.ts), so the RLS shape asserted
 * here is migration 1809230000000's own output — never a hand-written copy.
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
 * key to `tenants` (verified against migration 1797000000000), so no tenant
 * rows are needed. Per-table uniqueness shapes are respected so a constraint
 * conflict never masks the RLS verdict:
 *
 * - `onboarding_template_applications`: uq_onboarding_template_applications_
 *   tenant_idemp is (tenant_id, idempotency_key) — own-tenant INSERT proofs
 *   run as tenant C with a fresh idempotency key; foreign proofs target
 *   tenant D, which owns no rows and therefore cannot collide.
 * - `onboarding_template_seed_links`: uq_template_seed_links_provenance is
 *   (tenant_id, template_code, source_item_id, target_entity_type) — the
 *   same fresh-tenant C / fresh-tenant D split keeps both insert proofs
 *   constraint-clean.
 * - `legacy_onboarding_migration_receipts` carries no unique constraint.
 */

const TABLES = [
  'onboarding_template_applications',
  'onboarding_template_seed_links',
  'legacy_onboarding_migration_receipts',
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
  assertion: (runner: ReturnType<DataSource['createQueryRunner']>) => Promise<T>,
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
function returningRows(result: unknown): Array<{ id: string; tenant_id?: string }> {
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0] as Array<{ id: string }>;
  }
  return (Array.isArray(result) ? result : []) as Array<{ id: string }>;
}

describe('onboarding template/provenance tenant RLS (Real PostgreSQL DB, migration-built schema)', () => {
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

  const applicationAId = randomUUID();
  const applicationBId = randomUUID();
  const seedLinkAId = randomUUID();
  const seedLinkBId = randomUUID();
  const receiptAId = randomUUID();
  const receiptBId = randomUUID();

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
    // the creating migration (1797000000000) declares.
    await admin.query(
      `INSERT INTO onboarding_template_applications
         (id, tenant_id, template_code, selection_hash, idempotency_key)
       VALUES
         ($1, $2, 'rls-proof-template', 'hash-a', 'proof-key-a'),
         ($3, $4, 'rls-proof-template', 'hash-b', 'proof-key-b')`,
      [applicationAId, tenantAId, applicationBId, tenantBId],
    );
    await admin.query(
      `INSERT INTO onboarding_template_seed_links
         (id, tenant_id, template_code, source_item_id, source_item_type,
          target_entity_type, target_entity_id, last_source_fingerprint)
       VALUES
         ($1, $2, 'rls-proof-template', 'src-a', 'PRODUCT', 'PRODUCT', 'tgt-a', 'fp-a'),
         ($3, $4, 'rls-proof-template', 'src-b', 'PRODUCT', 'PRODUCT', 'tgt-b', 'fp-b')`,
      [seedLinkAId, tenantAId, seedLinkBId, tenantBId],
    );
    await admin.query(
      `INSERT INTO legacy_onboarding_migration_receipts
         (id, tenant_id, target_entity_type, target_entity_id, decision, reason)
       VALUES
         ($1, $2, 'RECIPE_VERSION', 'legacy-a', 'KEEP_PUBLISHED', 'rls proof row a'),
         ($3, $4, 'RECIPE_VERSION', 'legacy-b', 'KEEP_PUBLISHED', 'rls proof row b')`,
      [receiptAId, tenantAId, receiptBId, tenantBId],
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
    const seeded = (await admin.query(
      `SELECT
         (SELECT count(*)::int FROM onboarding_template_applications) AS applications,
         (SELECT count(*)::int FROM onboarding_template_seed_links) AS seed_links,
         (SELECT count(*)::int FROM legacy_onboarding_migration_receipts) AS receipts`,
    )) as Array<{ applications: number; seed_links: number; receipts: number }>;
    expect(seeded[0]).toEqual({ applications: 2, seed_links: 2, receipts: 2 });

    const role = (await admin.query(
      `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1`, [
      fixture.runtimeRoleName,
    ]))[0];
    expect(role).toBeDefined();
    expect(role.rolsuper).toBe(false);
    expect(role.rolbypassrls).toBe(false);

    const ownership = (await admin.query<{ count: number }[]>(
      `SELECT count(*)::int AS count
         FROM pg_tables
        WHERE schemaname = $1
          AND tablename IN ('onboarding_template_applications', 'onboarding_template_seed_links', 'legacy_onboarding_migration_receipts')
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
          AND c.relname IN ('onboarding_template_applications', 'onboarding_template_seed_links', 'legacy_onboarding_migration_receipts')
        ORDER BY c.relname`,
      [schema],
    )) as Array<{ relname: string; rls_enabled: boolean; rls_forced: boolean }>;

    expect(facts).toEqual([
      { relname: 'legacy_onboarding_migration_receipts', rls_enabled: true, rls_forced: true },
      { relname: 'onboarding_template_applications', rls_enabled: true, rls_forced: true },
      { relname: 'onboarding_template_seed_links', rls_enabled: true, rls_forced: true },
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
      const applications = (await runner.query(
        `SELECT id FROM onboarding_template_applications`,
      )) as Array<{ id: string }>;
      expect(applications.map((r) => r.id)).toEqual([applicationAId]);

      const seedLinks = (await runner.query(
        `SELECT id FROM onboarding_template_seed_links`,
      )) as Array<{ id: string }>;
      expect(seedLinks.map((r) => r.id)).toEqual([seedLinkAId]);

      const receipts = (await runner.query(
        `SELECT id FROM legacy_onboarding_migration_receipts`,
      )) as Array<{ id: string }>;
      expect(receipts.map((r) => r.id)).toEqual([receiptAId]);
    });
  });

  it('shows tenant B only its own rows (triangulation)', async () => {
    await asRuntimeRole(runtime, tenantBId, async (runner) => {
      const applications = (await runner.query(
        `SELECT id FROM onboarding_template_applications`,
      )) as Array<{ id: string }>;
      expect(applications.map((r) => r.id)).toEqual([applicationBId]);

      const seedLinks = (await runner.query(
        `SELECT id FROM onboarding_template_seed_links`,
      )) as Array<{ id: string }>;
      expect(seedLinks.map((r) => r.id)).toEqual([seedLinkBId]);

      const receipts = (await runner.query(
        `SELECT id FROM legacy_onboarding_migration_receipts`,
      )) as Array<{ id: string }>;
      expect(receipts.map((r) => r.id)).toEqual([receiptBId]);
    });
  });

  it('accepts a tenant-bound runtime role inserting its own rows into all three tables', async () => {
    // Bound to tenant C (a real synthetic tenant context with no seeded
    // rows, see the uniqueness note above): the own-tenant INSERT is the
    // WITH CHECK half passing. Proven inside the rolled-back transaction —
    // the statement returning its row IS the success.
    await asRuntimeRole(runtime, tenantCId, async (runner) => {
      const insertedApplication = returningRows(
        await runner.query(
          `INSERT INTO onboarding_template_applications
             (tenant_id, template_code, selection_hash, idempotency_key)
           VALUES ($1, 'rls-proof-template', 'hash-c', 'proof-key-c')
           RETURNING id, tenant_id`,
          [tenantCId],
        ),
      );
      expect(insertedApplication).toHaveLength(1);
      expect(insertedApplication[0].tenant_id).toBe(tenantCId);

      const insertedSeedLink = returningRows(
        await runner.query(
          `INSERT INTO onboarding_template_seed_links
             (tenant_id, template_code, source_item_id, source_item_type,
              target_entity_type, target_entity_id, last_source_fingerprint)
           VALUES ($1, 'rls-proof-template', 'src-c', 'PRODUCT', 'PRODUCT', 'tgt-c', 'fp-c')
           RETURNING id, tenant_id`,
          [tenantCId],
        ),
      );
      expect(insertedSeedLink).toHaveLength(1);
      expect(insertedSeedLink[0].tenant_id).toBe(tenantCId);

      const insertedReceipt = returningRows(
        await runner.query(
          `INSERT INTO legacy_onboarding_migration_receipts
             (tenant_id, target_entity_type, target_entity_id, decision, reason)
           VALUES ($1, 'RECIPE_VERSION', 'legacy-c', 'KEEP_PUBLISHED', 'rls proof insert c')
           RETURNING id, tenant_id`,
          [tenantCId],
        ),
      );
      expect(insertedReceipt).toHaveLength(1);
      expect(insertedReceipt[0].tenant_id).toBe(tenantCId);
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
        'onboarding_template_applications',
        `INSERT INTO onboarding_template_applications
           (tenant_id, template_code, selection_hash, idempotency_key)
         VALUES ($1, 'rls-proof-template', 'hash-d', 'proof-key-d') RETURNING id`,
      ],
      [
        'onboarding_template_seed_links',
        `INSERT INTO onboarding_template_seed_links
           (tenant_id, template_code, source_item_id, source_item_type,
            target_entity_type, target_entity_id, last_source_fingerprint)
         VALUES ($1, 'rls-proof-template', 'src-d', 'PRODUCT', 'PRODUCT', 'tgt-d', 'fp-d')
         RETURNING id`,
      ],
      [
        'legacy_onboarding_migration_receipts',
        `INSERT INTO legacy_onboarding_migration_receipts
           (tenant_id, target_entity_type, target_entity_id, decision, reason)
         VALUES ($1, 'RECIPE_VERSION', 'legacy-d', 'KEEP_PUBLISHED', 'rls proof insert d')
         RETURNING id`,
      ],
    ] as const) {
      await asRuntimeRole(runtime, tenantCId, async (runner) => {
        await expect(
          runner.query(insertSql, [tenantDId]),
        ).rejects.toThrow(/row-level security/i);
        void table;
      });
    }
  });

  it('lets tenant A update and delete its own rows in every table', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const updatedApplication = returningRows(
        await runner.query(
          `UPDATE onboarding_template_applications SET status = 'APPLIED'
            WHERE id = $1 RETURNING id`,
          [applicationAId],
        ),
      );
      expect(updatedApplication.map((r) => r.id)).toEqual([applicationAId]);

      const updatedSeedLink = returningRows(
        await runner.query(
          `UPDATE onboarding_template_seed_links
            SET last_applied_version = last_applied_version + 1
            WHERE id = $1 RETURNING id`,
          [seedLinkAId],
        ),
      );
      expect(updatedSeedLink.map((r) => r.id)).toEqual([seedLinkAId]);

      const updatedReceipt = returningRows(
        await runner.query(
          `UPDATE legacy_onboarding_migration_receipts SET executed_by = 'rls-proof'
            WHERE id = $1 RETURNING id`,
          [receiptAId],
        ),
      );
      expect(updatedReceipt.map((r) => r.id)).toEqual([receiptAId]);

      // Delete of a throwaway own row per table: insert then delete inside
      // the same transaction, proving DELETE's USING clause admits tenant
      // A's rows through each table's own policy.
      const throwawayApplication = returningRows(
        await runner.query(
          `INSERT INTO onboarding_template_applications
             (tenant_id, template_code, selection_hash, idempotency_key)
           VALUES ($1, 'rls-proof-template', 'hash-del-a', 'proof-del-a') RETURNING id`,
          [tenantAId],
        ),
      );
      const deletedApplication = returningRows(
        await runner.query(
          `DELETE FROM onboarding_template_applications WHERE id = $1 RETURNING id`,
          [throwawayApplication[0].id],
        ),
      );
      expect(deletedApplication.map((r) => r.id)).toEqual([
        throwawayApplication[0].id,
      ]);

      const throwawaySeedLink = returningRows(
        await runner.query(
          `INSERT INTO onboarding_template_seed_links
             (tenant_id, template_code, source_item_id, source_item_type,
              target_entity_type, target_entity_id, last_source_fingerprint)
           VALUES ($1, 'rls-proof-template', 'src-del-a', 'PRODUCT', 'PRODUCT', 'tgt-del-a', 'fp-del-a')
           RETURNING id`,
          [tenantAId],
        ),
      );
      const deletedSeedLink = returningRows(
        await runner.query(
          `DELETE FROM onboarding_template_seed_links WHERE id = $1 RETURNING id`,
          [throwawaySeedLink[0].id],
        ),
      );
      expect(deletedSeedLink.map((r) => r.id)).toEqual([throwawaySeedLink[0].id]);

      const throwawayReceipt = returningRows(
        await runner.query(
          `INSERT INTO legacy_onboarding_migration_receipts
             (tenant_id, target_entity_type, target_entity_id, decision, reason)
           VALUES ($1, 'RECIPE_VERSION', 'legacy-del-a', 'KEEP_PUBLISHED', 'rls proof delete a')
           RETURNING id`,
          [tenantAId],
        ),
      );
      const deletedReceipt = returningRows(
        await runner.query(
          `DELETE FROM legacy_onboarding_migration_receipts WHERE id = $1 RETURNING id`,
          [throwawayReceipt[0].id],
        ),
      );
      expect(deletedReceipt.map((r) => r.id)).toEqual([throwawayReceipt[0].id]);
    });
  });

  it('stops tenant A’s UPDATE and DELETE from touching tenant B’s rows in any of the three tables', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const updatedApplication = returningRows(
        await runner.query(
          `UPDATE onboarding_template_applications SET status = 'APPLIED'
            WHERE id = $1 RETURNING id`,
          [applicationBId],
        ),
      );
      expect(updatedApplication).toEqual([]);

      const updatedSeedLink = returningRows(
        await runner.query(
          `UPDATE onboarding_template_seed_links
            SET last_applied_version = last_applied_version + 1
            WHERE id = $1 RETURNING id`,
          [seedLinkBId],
        ),
      );
      expect(updatedSeedLink).toEqual([]);

      const updatedReceipt = returningRows(
        await runner.query(
          `UPDATE legacy_onboarding_migration_receipts SET executed_by = 'rls-proof'
            WHERE id = $1 RETURNING id`,
          [receiptBId],
        ),
      );
      expect(updatedReceipt).toEqual([]);

      const deletedApplication = returningRows(
        await runner.query(
          `DELETE FROM onboarding_template_applications WHERE id = $1 RETURNING id`,
          [applicationBId],
        ),
      );
      expect(deletedApplication).toEqual([]);

      const deletedSeedLink = returningRows(
        await runner.query(
          `DELETE FROM onboarding_template_seed_links WHERE id = $1 RETURNING id`,
          [seedLinkBId],
        ),
      );
      expect(deletedSeedLink).toEqual([]);

      const deletedReceipt = returningRows(
        await runner.query(
          `DELETE FROM legacy_onboarding_migration_receipts WHERE id = $1 RETURNING id`,
          [receiptBId],
        ),
      );
      expect(deletedReceipt).toEqual([]);
    });
  });
});
