import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../src/core/database/tenant-transaction';
import { createMigrationBuiltSchemaFixture } from '../support/migration-built-schema.helper';

/**
 * Issue #512 T3 slice 4 part B: tenant isolation for the customer/loyalty
 * tables `customer_loyalty_account_projection`, `customer_point_transactions`,
 * `customers`, `loyalty_programs` and `loyalty_rewards`.
 *
 * The schema is built by RUNNING THE FULL MIGRATION SET (via
 * test/support/migration-built-schema.helper.ts), so the RLS shape asserted
 * here is migration 1809280000000's own output — never a hand-written copy.
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
 * - `loyalty_programs` and `loyalty_rewards` FK `tenant_id -> tenants(id)`,
 *   so real tenant rows are seeded for every synthetic tenant context used
 *   below. `customers` and `customer_point_transactions` carry only indexes
 *   on `tenant_id` (no FK), and `customer_loyalty_account_projection`'s only
 *   FK is `fk_clap_program` on `loyalty_program_id` — its identity is the
 *   composite `(tenant_id, customer_id, loyalty_program_id)` primary key, so
 *   it has no `id` column and its row-identity assertions below use the
 *   composite key and its own column names.
 * - `loyalty_rewards` also FKs `loyalty_program_id -> loyalty_programs(id)`,
 *   so every reward INSERT proof (own-tenant accepted, throwaway deletes)
 *   references a loyalty_programs row created earlier in the same
 *   rolled-back transaction, seeded row for tenant A or the C-proof's own
 *   program — the insert never fails on a missing FK parent.
 * - None of the five tables carries a further tenant-scoped FK parent, so
 *   every insert proof below fails (or passes) on RLS alone, never on a
 *   missing FK parent.
 * - For the foreign-tenant reward INSERT the WITH CHECK clause is evaluated
 *   before the row is inserted and therefore before the FK's AFTER-row
 *   triggers fire, so the rejection is RLS's, not a FK violation.
 * - `customer_point_transactions.type` defaults to `earn` and every
 *   loyalty-v1 column added by 1795000000000 is nullable; the projection's
 *   NOT NULL `recomputed_at` is passed explicitly. So `(id, tenant_id,
 *   customer_id)` / `(tenant_id, customer_id, loyalty_program_id,
 *   recomputed_at)` is a complete row for seeding and probes.
 */

const TABLES = [
  'customer_loyalty_account_projection',
  'customer_point_transactions',
  'customers',
  'loyalty_programs',
  'loyalty_rewards',
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
 * Normalizes both shapes to the rows array so assertions read on the
 * returned column values.
 */
function returningRows(
  result: unknown,
): Array<Record<string, string | number | boolean>> {
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0] as Array<Record<string, string | number | boolean>>;
  }
  return (Array.isArray(result) ? result : []) as Array<
    Record<string, string | number | boolean>
  >;
}

describe('customer/loyalty tenant RLS (Real PostgreSQL DB, migration-built schema)', () => {
  jest.setTimeout(180000);

  let admin: DataSource;
  let runtime: DataSource;
  let schema: string;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;

  // A and B own the seeded probes; C and D are fresh synthetic tenant
  // contexts for the INSERT proofs (an own-tenant INSERT bound to A or B
  // would sit next to seeded rows, and C/D keep the WITH CHECK proofs free
  // of interference). All four exist as real tenant rows because
  // loyalty_programs and loyalty_rewards FK to tenants(id).
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const tenantCId = randomUUID();
  const tenantDId = randomUUID();

  // Seeded probe rows, one per tenant per table (A and B). The projection's
  // identity is the composite (tenant_id, customer_id, loyalty_program_id);
  // it points at its own tenant's customer and program rows.
  const customerAId = randomUUID();
  const customerBId = randomUUID();
  const programAId = randomUUID();
  const programBId = randomUUID();
  const rewardAId = randomUUID();
  const rewardBId = randomUUID();
  const pointTransactionAId = randomUUID();
  const pointTransactionBId = randomUUID();

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

    // Real tenant rows first: loyalty_programs and loyalty_rewards FK to
    // tenants(id).
    await admin.query(
      `INSERT INTO tenants (id, name) VALUES ($1, $2), ($3, $4), ($5, $6), ($7, $8)`,
      [
        tenantAId,
        'customer-loyalty-rls-tenant-a',
        tenantBId,
        'customer-loyalty-rls-tenant-b',
        tenantCId,
        'customer-loyalty-rls-tenant-c',
        tenantDId,
        'customer-loyalty-rls-tenant-d',
      ],
    );

    // Seeded probes, one row per table per tenant A and B.
    await admin.query(
      `INSERT INTO loyalty_programs (id, tenant_id, name, program_type, earning_rule, eligibility_rule)
       VALUES ($1, $2, 'rls-program-a', 'SPEND_POINTS', '{}'::jsonb, '{}'::jsonb),
              ($3, $4, 'rls-program-b', 'SPEND_POINTS', '{}'::jsonb, '{}'::jsonb)`,
      [programAId, tenantAId, programBId, tenantBId],
    );
    await admin.query(
      `INSERT INTO loyalty_rewards (id, tenant_id, loyalty_program_id, name, reward_type, cost_units, benefit_config)
       VALUES ($1, $2, $3, 'rls-reward-a', 'DISCOUNT_AMOUNT', 100, '{}'::jsonb),
              ($4, $5, $6, 'rls-reward-b', 'DISCOUNT_AMOUNT', 100, '{}'::jsonb)`,
      [rewardAId, tenantAId, programAId, rewardBId, tenantBId, programBId],
    );
    await admin.query(
      `INSERT INTO customers (id, tenant_id, name) VALUES ($1, $2, 'rls-customer-a'), ($3, $4, 'rls-customer-b')`,
      [customerAId, tenantAId, customerBId, tenantBId],
    );
    await admin.query(
      `INSERT INTO customer_point_transactions (id, tenant_id, customer_id) VALUES ($1, $2, $3), ($4, $5, $6)`,
      [
        pointTransactionAId,
        tenantAId,
        customerAId,
        pointTransactionBId,
        tenantBId,
        customerBId,
      ],
    );
    await admin.query(
      `INSERT INTO customer_loyalty_account_projection (tenant_id, customer_id, loyalty_program_id, recomputed_at)
       VALUES ($1, $2, $3, now()), ($4, $5, $6, now())`,
      [tenantAId, customerAId, programAId, tenantBId, customerBId, programBId],
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
      `SELECT (SELECT count(*)::int FROM loyalty_programs) AS loyalty_programs,
              (SELECT count(*)::int FROM loyalty_rewards) AS loyalty_rewards,
              (SELECT count(*)::int FROM customers) AS customers,
              (SELECT count(*)::int FROM customer_point_transactions) AS customer_point_transactions,
              (SELECT count(*)::int FROM customer_loyalty_account_projection) AS customer_loyalty_account_projection`,
    );
    expect(seeded[0]).toEqual({
      loyalty_programs: 2,
      loyalty_rewards: 2,
      customers: 2,
      customer_point_transactions: 2,
      customer_loyalty_account_projection: 2,
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
          AND tablename IN ('customer_loyalty_account_projection', 'customer_point_transactions', 'customers', 'loyalty_programs', 'loyalty_rewards')
          AND tableowner = $2`,
      [schema, fixture.runtimeRoleName],
    );
    expect(ownership[0].count).toBe(0);
  });

  it('enables AND forces row level security on all five customer/loyalty tables with exactly one command-specific policy per command', async () => {
    const facts = await admin.query(
      `SELECT c.relname, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1
          AND c.relname IN ('customer_loyalty_account_projection', 'customer_point_transactions', 'customers', 'loyalty_programs', 'loyalty_rewards')
        ORDER BY c.relname`,
      [schema],
    );

    expect(facts).toEqual([
      {
        relname: 'customer_loyalty_account_projection',
        rls_enabled: true,
        rls_forced: true,
      },
      {
        relname: 'customer_point_transactions',
        rls_enabled: true,
        rls_forced: true,
      },
      { relname: 'customers', rls_enabled: true, rls_forced: true },
      { relname: 'loyalty_programs', rls_enabled: true, rls_forced: true },
      { relname: 'loyalty_rewards', rls_enabled: true, rls_forced: true },
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

  it('denies an unbound runtime role every row of all five tables', async () => {
    await asRuntimeRole(runtime, null, async (runner) => {
      for (const table of TABLES) {
        const rows = (await runner.query(
          `SELECT count(*)::int AS count FROM ${table}`,
        )) as Array<{ count: number }>;
        expect(rows[0].count).toBe(0);
      }
    });
  });

  it('shows tenant A only its own rows in all five tables, never tenant B’s', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const own = {
        customer_point_transactions: pointTransactionAId,
        customers: customerAId,
        loyalty_programs: programAId,
        loyalty_rewards: rewardAId,
      } as const;
      for (const [table, id] of Object.entries(own)) {
        const rows = (await runner.query(`SELECT id FROM ${table}`)) as Array<{
          id: string;
        }>;
        expect(rows.map((r) => r.id)).toEqual([id]);
      }

      // The projection has no `id` column: its identity is the composite
      // (tenant_id, customer_id, loyalty_program_id) primary key.
      const projections = (await runner.query(
        `SELECT tenant_id, customer_id, loyalty_program_id FROM customer_loyalty_account_projection`,
      )) as Array<{
        tenant_id: string;
        customer_id: string;
        loyalty_program_id: string;
      }>;
      expect(projections).toEqual([
        {
          tenant_id: tenantAId,
          customer_id: customerAId,
          loyalty_program_id: programAId,
        },
      ]);
    });
  });

  it('shows tenant B only its own rows in all five tables (triangulation)', async () => {
    await asRuntimeRole(runtime, tenantBId, async (runner) => {
      const own = {
        customer_point_transactions: pointTransactionBId,
        customers: customerBId,
        loyalty_programs: programBId,
        loyalty_rewards: rewardBId,
      } as const;
      for (const [table, id] of Object.entries(own)) {
        const rows = (await runner.query(`SELECT id FROM ${table}`)) as Array<{
          id: string;
        }>;
        expect(rows.map((r) => r.id)).toEqual([id]);
      }

      const projections = (await runner.query(
        `SELECT tenant_id, customer_id, loyalty_program_id FROM customer_loyalty_account_projection`,
      )) as Array<{
        tenant_id: string;
        customer_id: string;
        loyalty_program_id: string;
      }>;
      expect(projections).toEqual([
        {
          tenant_id: tenantBId,
          customer_id: customerBId,
          loyalty_program_id: programBId,
        },
      ]);
    });
  });

  it('accepts a tenant-bound runtime role inserting its own rows into all five tables', async () => {
    // Bound to tenant C: the own-tenant INSERT is the WITH CHECK half
    // passing. Proven inside the rolled-back transaction — the statement
    // returning its row IS the success. The reward references the program
    // inserted earlier in this same transaction, so the FK chain holds.
    await asRuntimeRole(runtime, tenantCId, async (runner) => {
      const insertedProgram = returningRows(
        await runner.query(
          `INSERT INTO loyalty_programs (tenant_id, name, program_type, earning_rule, eligibility_rule)
           VALUES ($1, 'rls-program-c', 'SPEND_POINTS', '{}'::jsonb, '{}'::jsonb)
           RETURNING id, tenant_id`,
          [tenantCId],
        ),
      );
      expect(insertedProgram).toHaveLength(1);
      expect(insertedProgram[0].tenant_id).toBe(tenantCId);
      const insertedProgramId = insertedProgram[0].id as string;

      const insertedReward = returningRows(
        await runner.query(
          `INSERT INTO loyalty_rewards (tenant_id, loyalty_program_id, name, reward_type, cost_units, benefit_config)
           VALUES ($1, $2, 'rls-reward-c', 'FREE_PRODUCT', 50, '{}'::jsonb)
           RETURNING id, tenant_id`,
          [tenantCId, insertedProgramId],
        ),
      );
      expect(insertedReward).toHaveLength(1);
      expect(insertedReward[0].tenant_id).toBe(tenantCId);

      const insertedCustomer = returningRows(
        await runner.query(
          `INSERT INTO customers (tenant_id, name)
           VALUES ($1, 'rls-customer-c') RETURNING id, tenant_id`,
          [tenantCId],
        ),
      );
      expect(insertedCustomer).toHaveLength(1);
      expect(insertedCustomer[0].tenant_id).toBe(tenantCId);
      const insertedCustomerId = insertedCustomer[0].id as string;

      const insertedPointTransaction = returningRows(
        await runner.query(
          `INSERT INTO customer_point_transactions (tenant_id, customer_id)
           VALUES ($1, $2) RETURNING id, tenant_id`,
          [tenantCId, insertedCustomerId],
        ),
      );
      expect(insertedPointTransaction).toHaveLength(1);
      expect(insertedPointTransaction[0].tenant_id).toBe(tenantCId);

      const insertedProjection = returningRows(
        await runner.query(
          `INSERT INTO customer_loyalty_account_projection (tenant_id, customer_id, loyalty_program_id, recomputed_at)
           VALUES ($1, $2, $3, now())
           RETURNING tenant_id, customer_id, loyalty_program_id`,
          [tenantCId, insertedCustomerId, insertedProgramId],
        ),
      );
      expect(insertedProjection).toEqual([
        {
          tenant_id: tenantCId,
          customer_id: insertedCustomerId,
          loyalty_program_id: insertedProgramId,
        },
      ]);
    });
  });

  it('rejects a tenant-bound runtime role inserting a foreign-tenant row into any of the five tables', async () => {
    // Bound to tenant C, inserting tenant D: a fresh synthetic foreign
    // value, so pre-policy the write itself goes through and post-policy
    // the WITH CHECK clause rejects it. One transaction per rejection: the
    // first WITH CHECK failure aborts its transaction, which would
    // otherwise poison the next statement with "current transaction is
    // aborted". The reward INSERT references tenant A's seeded program so
    // the only thing it could fail on is RLS — WITH CHECK is evaluated
    // before the FK's AFTER-row triggers, so the rejection is RLS's.
    await asRuntimeRole(runtime, tenantCId, async (runner) => {
      await expect(
        runner.query(
          `INSERT INTO loyalty_programs (tenant_id, name, program_type, earning_rule, eligibility_rule)
           VALUES ($1, 'rls-program-foreign', 'SPEND_POINTS', '{}'::jsonb, '{}'::jsonb) RETURNING id`,
          [tenantDId],
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    await asRuntimeRole(runtime, tenantCId, async (runner) => {
      await expect(
        runner.query(
          `INSERT INTO loyalty_rewards (tenant_id, loyalty_program_id, name, reward_type, cost_units, benefit_config)
           VALUES ($1, $2, 'rls-reward-foreign', 'DISCOUNT_AMOUNT', 10, '{}'::jsonb) RETURNING id`,
          [tenantDId, programAId],
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    await asRuntimeRole(runtime, tenantCId, async (runner) => {
      await expect(
        runner.query(
          `INSERT INTO customers (tenant_id, name)
           VALUES ($1, 'rls-customer-foreign') RETURNING id`,
          [tenantDId],
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    await asRuntimeRole(runtime, tenantCId, async (runner) => {
      await expect(
        runner.query(
          `INSERT INTO customer_point_transactions (tenant_id, customer_id)
           VALUES ($1, $2) RETURNING id`,
          [tenantDId, customerAId],
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    await asRuntimeRole(runtime, tenantCId, async (runner) => {
      await expect(
        runner.query(
          `INSERT INTO customer_loyalty_account_projection (tenant_id, customer_id, loyalty_program_id, recomputed_at)
           VALUES ($1, $2, $3, now()) RETURNING tenant_id`,
          [tenantDId, customerAId, programAId],
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it('lets tenant A update and delete its own rows in all five tables', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const updatedProgram = returningRows(
        await runner.query(
          `UPDATE loyalty_programs SET name = 'rls-program-a-renamed' WHERE id = $1 RETURNING id`,
          [programAId],
        ),
      );
      expect(updatedProgram.map((r) => r.id)).toEqual([programAId]);

      const updatedReward = returningRows(
        await runner.query(
          `UPDATE loyalty_rewards SET cost_units = 120 WHERE id = $1 RETURNING id`,
          [rewardAId],
        ),
      );
      expect(updatedReward.map((r) => r.id)).toEqual([rewardAId]);

      const updatedCustomer = returningRows(
        await runner.query(
          `UPDATE customers SET name = 'rls-customer-a-renamed' WHERE id = $1 RETURNING id`,
          [customerAId],
        ),
      );
      expect(updatedCustomer.map((r) => r.id)).toEqual([customerAId]);

      const updatedPointTransaction = returningRows(
        await runner.query(
          `UPDATE customer_point_transactions SET points = 5 WHERE id = $1 RETURNING id`,
          [pointTransactionAId],
        ),
      );
      expect(updatedPointTransaction.map((r) => r.id)).toEqual([
        pointTransactionAId,
      ]);

      const updatedProjection = returningRows(
        await runner.query(
          `UPDATE customer_loyalty_account_projection SET balance_units = 7
           WHERE tenant_id = $1 AND customer_id = $2 AND loyalty_program_id = $3
           RETURNING tenant_id, customer_id`,
          [tenantAId, customerAId, programAId],
        ),
      );
      expect(updatedProjection).toEqual([
        { tenant_id: tenantAId, customer_id: customerAId },
      ]);

      // Delete of throwaway own rows: insert then delete inside the same
      // transaction, proving DELETE's USING clause admits tenant A's rows.
      // The throwaway reward references tenant A's seeded program and the
      // throwaway projection reuses A's program id with a fresh customer_id
      // (the projection has no FK on customer_id).
      const throwawayProgram = returningRows(
        await runner.query(
          `INSERT INTO loyalty_programs (tenant_id, name, program_type, earning_rule, eligibility_rule)
           VALUES ($1, 'rls-program-a-throwaway', 'VISIT_STAMPS', '{}'::jsonb, '{}'::jsonb) RETURNING id`,
          [tenantAId],
        ),
      );
      const deletedProgram = returningRows(
        await runner.query(
          `DELETE FROM loyalty_programs WHERE id = $1 RETURNING id`,
          [throwawayProgram[0].id],
        ),
      );
      expect(deletedProgram.map((r) => r.id)).toEqual([throwawayProgram[0].id]);

      const throwawayReward = returningRows(
        await runner.query(
          `INSERT INTO loyalty_rewards (tenant_id, loyalty_program_id, name, reward_type, cost_units, benefit_config)
           VALUES ($1, $2, 'rls-reward-a-throwaway', 'FREE_PRODUCT', 5, '{}'::jsonb) RETURNING id`,
          [tenantAId, programAId],
        ),
      );
      const deletedReward = returningRows(
        await runner.query(
          `DELETE FROM loyalty_rewards WHERE id = $1 RETURNING id`,
          [throwawayReward[0].id],
        ),
      );
      expect(deletedReward.map((r) => r.id)).toEqual([throwawayReward[0].id]);

      const throwawayCustomer = returningRows(
        await runner.query(
          `INSERT INTO customers (tenant_id, name)
           VALUES ($1, 'rls-customer-a-throwaway') RETURNING id`,
          [tenantAId],
        ),
      );
      const deletedCustomer = returningRows(
        await runner.query(`DELETE FROM customers WHERE id = $1 RETURNING id`, [
          throwawayCustomer[0].id,
        ]),
      );
      expect(deletedCustomer.map((r) => r.id)).toEqual([
        throwawayCustomer[0].id,
      ]);

      const throwawayPointTransaction = returningRows(
        await runner.query(
          `INSERT INTO customer_point_transactions (tenant_id, customer_id)
           VALUES ($1, $2) RETURNING id`,
          [tenantAId, customerAId],
        ),
      );
      const deletedPointTransaction = returningRows(
        await runner.query(
          `DELETE FROM customer_point_transactions WHERE id = $1 RETURNING id`,
          [throwawayPointTransaction[0].id],
        ),
      );
      expect(deletedPointTransaction.map((r) => r.id)).toEqual([
        throwawayPointTransaction[0].id,
      ]);

      const throwawayProjectionCustomerId = randomUUID();
      const throwawayProjection = returningRows(
        await runner.query(
          `INSERT INTO customer_loyalty_account_projection (tenant_id, customer_id, loyalty_program_id, recomputed_at)
           VALUES ($1, $2, $3, now()) RETURNING tenant_id, customer_id, loyalty_program_id`,
          [tenantAId, throwawayProjectionCustomerId, programAId],
        ),
      );
      expect(throwawayProjection).toHaveLength(1);
      const deletedProjection = returningRows(
        await runner.query(
          `DELETE FROM customer_loyalty_account_projection
           WHERE tenant_id = $1 AND customer_id = $2 AND loyalty_program_id = $3
           RETURNING tenant_id, customer_id`,
          [tenantAId, throwawayProjectionCustomerId, programAId],
        ),
      );
      expect(deletedProjection).toEqual([
        { tenant_id: tenantAId, customer_id: throwawayProjectionCustomerId },
      ]);
    });
  });

  it('stops tenant A’s UPDATE and DELETE from touching tenant B’s rows in any of the five tables', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const updatedProgram = returningRows(
        await runner.query(
          `UPDATE loyalty_programs SET name = 'hijacked' WHERE id = $1 RETURNING id`,
          [programBId],
        ),
      );
      expect(updatedProgram).toEqual([]);

      const updatedReward = returningRows(
        await runner.query(
          `UPDATE loyalty_rewards SET cost_units = 999 WHERE id = $1 RETURNING id`,
          [rewardBId],
        ),
      );
      expect(updatedReward).toEqual([]);

      const updatedCustomer = returningRows(
        await runner.query(
          `UPDATE customers SET name = 'hijacked' WHERE id = $1 RETURNING id`,
          [customerBId],
        ),
      );
      expect(updatedCustomer).toEqual([]);

      const updatedPointTransaction = returningRows(
        await runner.query(
          `UPDATE customer_point_transactions SET points = 999 WHERE id = $1 RETURNING id`,
          [pointTransactionBId],
        ),
      );
      expect(updatedPointTransaction).toEqual([]);

      const updatedProjection = returningRows(
        await runner.query(
          `UPDATE customer_loyalty_account_projection SET balance_units = 999
           WHERE tenant_id = $1 AND customer_id = $2 AND loyalty_program_id = $3
           RETURNING tenant_id, customer_id`,
          [tenantBId, customerBId, programBId],
        ),
      );
      expect(updatedProjection).toEqual([]);

      const deletedProgram = returningRows(
        await runner.query(
          `DELETE FROM loyalty_programs WHERE id = $1 RETURNING id`,
          [programBId],
        ),
      );
      expect(deletedProgram).toEqual([]);

      const deletedReward = returningRows(
        await runner.query(
          `DELETE FROM loyalty_rewards WHERE id = $1 RETURNING id`,
          [rewardBId],
        ),
      );
      expect(deletedReward).toEqual([]);

      const deletedCustomer = returningRows(
        await runner.query(`DELETE FROM customers WHERE id = $1 RETURNING id`, [
          customerBId,
        ]),
      );
      expect(deletedCustomer).toEqual([]);

      const deletedPointTransaction = returningRows(
        await runner.query(
          `DELETE FROM customer_point_transactions WHERE id = $1 RETURNING id`,
          [pointTransactionBId],
        ),
      );
      expect(deletedPointTransaction).toEqual([]);

      const deletedProjection = returningRows(
        await runner.query(
          `DELETE FROM customer_loyalty_account_projection
           WHERE tenant_id = $1 AND customer_id = $2 AND loyalty_program_id = $3
           RETURNING tenant_id, customer_id`,
          [tenantBId, customerBId, programBId],
        ),
      );
      expect(deletedProjection).toEqual([]);
    });
  });
});
