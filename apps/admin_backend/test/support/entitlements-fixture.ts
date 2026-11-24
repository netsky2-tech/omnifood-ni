/**
 * Shared entitlements fixture for the e2e suites whose hand-built testing
 * modules gained the issue #984 providers (`EntitlementsService`,
 * `TenantQuotaService`, `CapabilitiesGuard`).
 *
 * The suites instantiate their controllers with `Test.createTestingModule`,
 * so the real resolver has to be wired against a REAL PostgreSQL database —
 * never stubbed: the guard/service must resolve the tenant's effective
 * capabilities through the same `EntitlementsService.snapshot()` reads the
 * production module performs.
 *
 * Most of these suites either keep their business data in memory
 * (repository mocks behind a fake `DataSource`) or build a scratch schema
 * whose raw SQL search_path is not pinned, so the fixture opens its own
 * dedicated scratch schema with `search_path` pinned on every pooled
 * connection and creates the two contract tables of migration
 * 1810400000000-CreateEntitlementsTables (same columns; no FK/RLS, and `tenant_id` stays varchar so the suites'
 * sentinel tenant ids work — the resolver only ever binds the id as a bound
 * the RLS policies are proven by the module's own `*.db.spec.ts`).
 *
 * Seeding mirrors production data: `seedActiveSubscription` writes the
 * plan row a PREMIUM endpoint needs (e.g. `PRO`), `seedLimitOverride`
 * writes an `tenant_entitlement_override` row (`{"limit": n | null}`) with
 * actor and reason filled, exactly as the resolver expects to read it.
 */
import { randomUUID } from 'crypto';
import type { Provider } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EntitlementsService } from '../../src/modules/entitlements/entitlements.service';
import { TenantQuotaService } from '../../src/modules/entitlements/tenant-quota.service';

/**
 * DI token carrying the fixture's real `DataSource`. Suites whose own
 * `DataSource` provider is a fake (or absent) bind the real resolver
 * through the provider factories below instead of the `DataSource` token.
 */
export const ENTITLEMENTS_TEST_DATA_SOURCE = Symbol(
  'ENTITLEMENTS_TEST_DATA_SOURCE',
);

/** Any executor exposing the parameterised `query` surface (DataSource or QueryRunner). */
export type EntitlementsFixtureRunner = {
  query(query: string, parameters?: unknown[]): Promise<unknown>;
};

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? 5432),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

/** The contract tables, with the exact columns of 1810400000000 (no FK/RLS). */
const ENTITLEMENTS_TABLE_DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS tenant_subscription (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id varchar NOT NULL,
      plan_code varchar NOT NULL,
      status varchar NOT NULL DEFAULT 'active',
      starts_at timestamptz NOT NULL DEFAULT now(),
      ends_at timestamptz,
      contract_price numeric(12, 2),
      currency varchar(3) NOT NULL DEFAULT 'USD',
      support_tier varchar NOT NULL DEFAULT 'standard',
      add_ons jsonb NOT NULL DEFAULT '[]'::jsonb,
      notes text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_tenant_subscription_status
        CHECK (status IN ('active', 'suspended', 'expired')),
      CONSTRAINT chk_tenant_subscription_support_tier
        CHECK (support_tier IN ('standard', 'priority')),
      CONSTRAINT chk_tenant_subscription_currency
        CHECK (currency ~ '^[A-Z]{3}$')
    )`,
  `CREATE TABLE IF NOT EXISTS tenant_entitlement_override (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id varchar NOT NULL,
      capability_key varchar NOT NULL,
      value_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      actor varchar NOT NULL,
      reason text NOT NULL,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
];

/** One open fixture: its dedicated scratch schema and the pinned DataSource. */
export interface EntitlementsFixture {
  readonly dataSource: DataSource;
  readonly schemaName: string;
}

/**
 * Opens a dedicated scratch schema (`ent_e2e_<uuid>` by default), pins
 * `search_path` on every pooled connection so the resolver's unqualified
 * contract-table reads land in it, and creates the contract tables.
 */
export async function openEntitlementsFixture(
  schemaName: string = `ent_e2e_${randomUUID().replace(/-/g, '')}`,
): Promise<EntitlementsFixture> {
  const description = `${postgresConnection.host}:${postgresConnection.port}/${postgresConnection.database}`;

  // R3-003: an unreachable or misconfigured PostgreSQL must fail with an
  // actionable error, never TypeORM's raw driver message — an e2e suite that
  // dies on `connect ECONNREFUSED` gives the runner no path to fix it.
  const diagnose = (error: unknown): Error =>
    new Error(
      `entitlements e2e fixture: cannot connect to PostgreSQL at ${description}. ` +
        'Verify the database is reachable and that DB_HOST, DB_PORT, ' +
        'DB_USERNAME, DB_PASSWORD and DB_DATABASE are set for the e2e run. ' +
        `Original error: ${
          error instanceof Error ? error.message : JSON.stringify(error)
        }`,
    );

  const bootstrap = new DataSource({ type: 'postgres', ...postgresConnection });
  try {
    await bootstrap.initialize();
    await bootstrap.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
  } catch (error) {
    // Never leave half-open pools behind when the fixture cannot even reach
    // the server.
    if (bootstrap.isInitialized) {
      await bootstrap.destroy().catch(() => undefined);
    }
    throw diagnose(error);
  }
  await bootstrap.destroy();

  const dataSource = new DataSource({
    type: 'postgres',
    ...postgresConnection,
    extra: {
      allowExitOnIdle: true,
      options: `-c search_path=${schemaName},public`,
    },
  });
  try {
    await dataSource.initialize();
  } catch (error) {
    throw diagnose(error);
  }
  for (const ddl of ENTITLEMENTS_TABLE_DDL) {
    await dataSource.query(ddl);
  }
  return { dataSource, schemaName };
}

/**
 * Closes a fixture opened by `openEntitlementsFixture`: drops its scratch
 * schema and releases the pool. Suites that only borrowed an existing
 * schema name can pass `{ dropSchema: false }` and keep teardown ownership.
 */
export async function closeEntitlementsFixture(
  fixture: EntitlementsFixture,
  options: { dropSchema?: boolean } = {},
): Promise<void> {
  const { dataSource, schemaName } = fixture;
  if (dataSource.isInitialized) {
    if (options.dropSchema !== false) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    }
    await dataSource.destroy();
  }
}

/** Creates the contract tables on any runner (e.g. a suite's own bootstrap). */
export async function createEntitlementsTables(
  runner: EntitlementsFixtureRunner,
): Promise<void> {
  for (const ddl of ENTITLEMENTS_TABLE_DDL) {
    await runner.query(ddl);
  }
}

/**
 * The active subscription a PREMIUM endpoint needs: active, started, never
 * ending. `add_ons` stays empty unless the caller opts in — capabilities
 * the plan itself includes need no add-on row.
 */
export async function seedActiveSubscription(
  runner: EntitlementsFixtureRunner,
  tenantId: string,
  planCode: string,
  options: { addOns?: readonly string[] } = {},
): Promise<void> {
  await runner.query(
    `INSERT INTO tenant_subscription
       (tenant_id, plan_code, status, starts_at, ends_at, add_ons, support_tier)
     VALUES ($1, $2, 'active', now() - interval '1 day', NULL, $3::jsonb, 'standard')`,
    [tenantId, planCode, JSON.stringify(options.addOns ?? [])],
  );
}

/**
 * An override row in force, shaped exactly as the resolver reads it:
 * flags carry `{"included": boolean}`, limits carry
 * `{"limit": non-negative integer | null}`. Actor and reason are always
 * filled — same as production data (audit requires both NOT NULL).
 */
export async function seedOverride(
  runner: EntitlementsFixtureRunner,
  tenantId: string,
  capabilityKey: string,
  valueJson: Record<string, unknown>,
  options: { actor?: string; reason?: string } = {},
): Promise<void> {
  await runner.query(
    `INSERT INTO tenant_entitlement_override
       (tenant_id, capability_key, value_json, actor, reason, expires_at)
     VALUES ($1, $2, $3::jsonb, $4, $5, now() + interval '365 days')`,
    [
      tenantId,
      capabilityKey,
      JSON.stringify(valueJson),
      options.actor ?? 'entitlements-fixture',
      options.reason ?? 'e2e: seeded by test/support/entitlements-fixture.ts',
    ],
  );
}

/** Convenience for the two limit keys of the frozen registry. */
export function seedLimitOverride(
  runner: EntitlementsFixtureRunner,
  tenantId: string,
  limitKey: 'limits.terminals' | 'limits.owner_accounts',
  limit: number | null,
  options: { actor?: string; reason?: string } = {},
): Promise<void> {
  return seedOverride(runner, tenantId, limitKey, { limit }, options);
}

/**
 * The real `EntitlementsService`, bound to the fixture's real DataSource
 * through {@link ENTITLEMENTS_TEST_DATA_SOURCE}. Same class, same reads —
 * only the connection comes from the fixture, because the host suite's own
 * `DataSource` provider may be a fake for its in-memory business fixtures.
 */
export const entitlementsServiceProvider = (): Provider => ({
  provide: EntitlementsService,
  useFactory: (dataSource: DataSource) => new EntitlementsService(dataSource),
  inject: [ENTITLEMENTS_TEST_DATA_SOURCE],
});

/** The real `TenantQuotaService` over the same fixture wiring. */
export const tenantQuotaServiceProvider = (): Provider => ({
  provide: TenantQuotaService,
  useFactory: (dataSource: DataSource, entitlements: EntitlementsService) =>
    new TenantQuotaService(dataSource, entitlements),
  inject: [ENTITLEMENTS_TEST_DATA_SOURCE, EntitlementsService],
});
