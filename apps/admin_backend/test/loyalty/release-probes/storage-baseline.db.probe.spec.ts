/**
 * T1 storage-baseline probe: PostgreSQL Loyalty storage surface probed through
 * the FULL migration set (test/support/migration-built-schema.helper.ts) — the
 * scratch schema is built by real migrations as a restricted NOBYPASSRLS role,
 * never hand-built. Run only via `pnpm test:loyalty-release` (the default Jest
 * config ignores `*.probe.spec.ts` on purpose).
 *
 * Expected on the untouched baseline (roadmap §10 baseline-red gate):
 *   - `[CONTROL-pg-schema]` PASSES (the migrated Loyalty surface exists).
 *   - `[B4-pg]` FAILS: duplicate loyalty idempotency identity is accepted by
 *     PostgreSQL today (`idempotency_key`, migration 1795000000000, carries no
 *     unique enforcement) — the DB-enforcement gap T2 must close.
 *   - `[B7-rls-enforcement]` FAILS: no Loyalty tenant table has ENABLE+FORCE RLS (no migration
 *     touches them) and a restricted tenant-scoped session reads another
 *     tenant's ledger rows — the isolation gap T3 must close (two named
 *     probes: `[B7-rls-enforcement]` and `[B7-cross-tenant-read]`).
 *
 * State setup uses production entity/repository paths (tenants,
 * customer_point_transactions). Direct SQL is used ONLY for the allowed
 * exceptions: metadata inspection (information_schema, pg_class, pg_stat),
 * tenant session context (the production TENANT_CONTEXT_SET_CONFIG_SQL
 * binding), and a read-only count assertion.
 */
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../../src/core/database/tenant-transaction';
import { Tenant } from '../../../src/modules/tenant/entities/tenant.entity';
import { Customer } from '../../../src/modules/customers/entities/customer.entity';
import {
  CustomerPointTransaction,
  LoyaltyTransactionOrigin,
  PointTransactionType,
} from '../../../src/modules/customers/entities/customer-point-transaction.entity';
import { createMigrationBuiltSchemaFixture } from '../../support/migration-built-schema.helper';

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? 5432),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

const poolCleanupExtra = { extra: { allowExitOnIdle: true } };

/** The migrated Loyalty tenant storage surface probed by this suite. */
const LOYALTY_TABLES = [
  'customer_point_transactions',
  'loyalty_programs',
  'loyalty_rewards',
  'customer_loyalty_account_projection',
] as const;

describe('T1 storage baseline: migrated PostgreSQL Loyalty surface (release probes)', () => {
  jest.setTimeout(60000);

  let admin: DataSource;
  let reader: DataSource;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;

  const tenantAId = randomUUID();
  const tenantBId = randomUUID();

  beforeAll(async () => {
    fixture = await createMigrationBuiltSchemaFixture();

    // Superuser seeding connection (RLS-forced fixtures stay seedable), same
    // pattern as test/onboarding/readiness-tenant-binding.db.e2e-spec.ts.
    admin = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema: fixture.schema,
      entities: [Tenant, Customer, CustomerPointTransaction],
      ...poolCleanupExtra,
    });
    await admin.initialize();

    // The helper's SELECT-only, NOBYPASSRLS reader role; its role-level
    // search_path is pinned to the scratch schema by the helper.
    reader = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      username: fixture.readerRoleName,
      password: fixture.readerRolePassword,
      ...poolCleanupExtra,
    });
    await reader.initialize();

    // Two distinct tenants, each owning one loyalty ledger movement.
    const tenants = admin.getRepository(Tenant);
    await tenants.save([
      tenants.create({ id: tenantAId, name: `Probe A ${tenantAId}`, slug: `probe-a-${tenantAId.slice(0,8)}`, ruc: 'J0310000000001', is_active: true }),
      tenants.create({ id: tenantBId, name: `Probe B ${tenantBId}`, slug: `probe-b-${tenantBId.slice(0,8)}`, ruc: 'J0310000000002', is_active: true }),
    ]);
    const ledger = admin.getRepository(CustomerPointTransaction);
    for (const [tenantId, ticket] of [
      [tenantAId, 'TICKET-A'],
      [tenantBId, 'TICKET-B'],
    ] as const) {
      await ledger.save(
        ledger.create({
          tenant_id: tenantId,
          customer_id: randomUUID(),
          // V1-shaped EARN: `ck_loyalty_tx_type_semantics` requires a program
          // on every declared EARN row, so the fixture must not emulate the
          // pre-T2b legacy shape here.
          loyalty_program_id: randomUUID(),
          ticket_id: ticket,
          transaction_type: PointTransactionType.EARN,
          units: 10,
          origin: LoyaltyTransactionOrigin.CLOUD,
          idempotency_key: `baseline:${tenantId}:${ticket}`,
        }),
      );
    }
  });

  afterAll(async () => {
    if (reader?.isInitialized) await reader.destroy();
    if (admin?.isInitialized) await admin.destroy();
    if (fixture) await fixture.close();
  });

  it('[CONTROL-pg-schema] the full migration set builds the Loyalty storage surface', async () => {
    const found = await admin.query<Array<{ table_name: string }>>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = $1 AND table_name = ANY($2)`,
      [fixture.schema, LOYALTY_TABLES],
    );
    expect(found.map((r) => r.table_name).sort()).toEqual(
      [...LOYALTY_TABLES].sort(),
    );
    // The scratch schema's OWN migrations ledger proves the schema came from
    // runMigrations(). The schema is explicitly qualified — identifiers cannot
    // be bound parameters, so the quote is escaped and interpolated — making
    // it impossible to read public.migrations on a provisioned database or to
    // fail on a fresh one.
    const qualifiedSchema = fixture.schema.replace(/"/g, '""');
    const ledger = await admin.query<Array<{ count: number }>>(
      `SELECT count(*)::int AS count FROM "${qualifiedSchema}".migrations`,
    );
    expect(ledger[0].count).toBeGreaterThan(0);
  });

  it('[B4-pg] PostgreSQL rejects a duplicate loyalty idempotency identity (arch §5.3; T2b acceptance)', async () => {
    const ledger = admin.getRepository(CustomerPointTransaction);
    const idempotencyKey = `probe:${randomUUID()}`;
    // Two DIFFERENT loyalty movements — distinct customer and ticket_id —
    // sharing ONLY the idempotency identity. Holding every other business
    // field constant could let a future green pass via some unrelated unique
    // subset; varying them pins the proof to idempotency-key uniqueness.
    const movement = (ticket: string) => ({
      tenant_id: tenantAId,
      customer_id: randomUUID(),
      loyalty_program_id: randomUUID(),
      ticket_id: ticket,
      transaction_type: PointTransactionType.EARN,
      units: 5,
      origin: LoyaltyTransactionOrigin.POS,
      idempotency_key: idempotencyKey,
    });
    await ledger.save(ledger.create(movement('TICKET-B4-FIRST')));
    // Correct behavior: the second movement with the same identity is a
    // PostgreSQL-level unique violation (23505); a resolving insert is the
    // DB-enforcement gap this probe guards against regressing into.
    await expect(
      ledger.save(ledger.create(movement('TICKET-B4-RETRY'))),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('[B7-rls-enforcement] every Loyalty tenant table is RLS ENABLE+FORCEd (arch §9.6; T3 acceptance) — RED on baseline', async () => {
    const unforced = await admin.query<Array<{ table_name: string }>>(
      `SELECT c.relname AS table_name
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1
          AND c.relname = ANY($2)
          AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)`,
      [fixture.schema, LOYALTY_TABLES],
    );
    expect(unforced.map((r) => r.table_name)).toEqual([]);
  });

  it("[B7-cross-tenant-read] a restricted tenant-scoped session cannot read another tenant's loyalty rows (arch §9.6; T3 acceptance) — RED on baseline", async () => {
    // Production-shaped tenant bind: transaction-local set_config through the
    // shared TENANT_CONTEXT_SET_CONFIG_SQL constant, on the helper's
    // SELECT-only NOBYPASSRLS reader role. Correct behavior: only tenant A's
    // ledger row is visible. On the baseline (no RLS) both tenants' rows come
    // back, which is exactly the B7 isolation gap.
    const runner = reader.createQueryRunner();
    await runner.connect();
    try {
      await runner.startTransaction();
      await runner.query(TENANT_CONTEXT_SET_CONFIG_SQL, [tenantAId]);
      const visible = await runner.query(
        `SELECT tenant_id, count(*)::int AS count
           FROM customer_point_transactions
          GROUP BY tenant_id`,
      );
      await runner.commitTransaction();
      // Correct behavior: no row belonging to tenant B is ever visible from
      // tenant A's bound session (order/count-independent by design).
      const leaked = visible.filter((row) => row.tenant_id === tenantBId);
      expect(leaked).toEqual([]);
    } finally {
      await runner.release();
    }
  });
});
