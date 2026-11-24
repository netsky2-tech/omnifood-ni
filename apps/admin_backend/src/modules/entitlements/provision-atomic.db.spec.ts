import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { CreateBootstrapIdentityTables1759000000001 } from '../../migrations/1759000000001-CreateBootstrapIdentityTables';
import { CreateEntitlementsTables1810400000000 } from '../../migrations/1810400000000-CreateEntitlementsTables';
import { bindTenantContext } from '../../core/database/tenant-transaction';
import { EntitlementsService } from './entitlements.service';
import {
  SUBSCRIPTION_REJECTION_CODES,
  SubscriptionRejectedError,
  TenantSubscriptionService,
} from './tenant-subscription.service';

/**
 * Real-PostgreSQL contract test for issue #997:
 * provisioning a tenant and its initial subscription MUST be atomic.
 *
 *   1. Success: inserting the tenant and calling `changePlanInTransaction`
 *      within the same tenant-bound transaction commits the tenant, the
 *      `tenant_subscription` row, and the `tenant_entitlement_change_history`
 *      row together, and `EntitlementsService.snapshot` resolves to that plan.
 *   2. Failure: when `changePlanInTransaction` fails (for example, a contract
 *      that breaks the snapshot such as `ESENCIAL` + `bundle.convenio`), the
 *      entire transaction rolls back so NO orphan tenant remains in `tenants`.
 */

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for DB-backed contract tests`);
  }
  return value;
}

function readPostgresPort(): number {
  const value = process.env.DB_PORT?.trim() ?? '5432';
  const port = Number(value);
  if (!Number.isInteger(port)) {
    throw new Error('DB_PORT must be a valid integer');
  }
  return port;
}

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: readPostgresPort(),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: getRequiredEnv('DB_PASSWORD'),
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

class SessionQueryRunner {
  constructor(private readonly inner: QueryRunner) {}

  connect(): Promise<void> {
    return Promise.resolve();
  }

  query(sql: string, parameters?: unknown[]): Promise<unknown> {
    return this.inner.query(sql, parameters);
  }

  startTransaction(): Promise<void> {
    return this.inner.startTransaction();
  }

  commitTransaction(): Promise<void> {
    return this.inner.commitTransaction();
  }

  rollbackTransaction(): Promise<void> {
    return this.inner.rollbackTransaction();
  }

  release(): Promise<void> {
    return Promise.resolve();
  }
}

describe('atomic tenant + subscription provisioning (#997)', () => {
  let dataSource: DataSource;
  let queryRunner: QueryRunner;
  let schemaName: string;
  let subscriptions: TenantSubscriptionService;
  let entitlements: EntitlementsService;

  beforeAll(async () => {
    schemaName = `prov_atomic_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    dataSource = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      synchronize: false,
      logging: false,
    });
    await dataSource.initialize();
    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.query(`CREATE SCHEMA "${schemaName}"`);
    await queryRunner.query(`SET search_path TO "${schemaName}", public`);

    await new CreateBootstrapIdentityTables1759000000001().up(queryRunner);
    await new CreateEntitlementsTables1810400000000().up(queryRunner);

    const fakeDataSource = {
      createQueryRunner: () => new SessionQueryRunner(queryRunner),
    } as unknown as DataSource;
    subscriptions = new TenantSubscriptionService(fakeDataSource);
    entitlements = new EntitlementsService(fakeDataSource);
  });

  afterAll(async () => {
    if (queryRunner) {
      await queryRunner.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await queryRunner.release();
    }
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('commits tenant, subscription and audit row together in one transaction', async () => {
    const tenantId = randomUUID();
    const now = new Date('2026-11-20T12:00:00.000Z');

    await queryRunner.startTransaction();
    try {
      await bindTenantContext(queryRunner, tenantId);
      await queryRunner.query(
        `INSERT INTO tenants (id, name) VALUES ($1, $2)`,
        [tenantId, 'Tenant Completo'],
      );
      const created = await subscriptions.changePlanInTransaction(queryRunner, {
        tenantId,
        planCode: 'OPERACION',
        supportTier: 'standard',
        addOns: ['pack.retail'],
        startsAt: now,
        actor: 'owner@completo.ni',
        reason: 'Alta inicial del tenant (#997)',
        now,
      });
      expect(created.planCode).toBe('OPERACION');
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    }

    const snapshot = await entitlements.snapshot(tenantId, now);
    expect(snapshot.planCode).toBe('OPERACION');
    expect(snapshot.status).toBe('active');
    expect(snapshot.addOns).toEqual(['pack.retail']);

    const trail = await subscriptions.list({ tenantId });
    expect(trail).toHaveLength(1);
    expect(trail[0].actor).toBe('owner@completo.ni');
  });

  it('rolls back the tenant when subscription creation fails (zero orphan tenant)', async () => {
    const tenantId = randomUUID();
    const now = new Date('2026-11-20T12:00:00.000Z');

    let caught: unknown;
    await queryRunner.startTransaction();
    try {
      await bindTenantContext(queryRunner, tenantId);
      await queryRunner.query(
        `INSERT INTO tenants (id, name) VALUES ($1, $2)`,
        [tenantId, 'Tenant Que Falla'],
      );
      // ESENCIAL does not include `promotions`, so `bundle.convenio` violates
      // the prerequisite invariant and throws SUBSCRIPTION_WOULD_BREAK_SNAPSHOT.
      await subscriptions.changePlanInTransaction(queryRunner, {
        tenantId,
        planCode: 'ESENCIAL',
        supportTier: 'standard',
        addOns: ['bundle.convenio'],
        startsAt: now,
        actor: 'owner@falla.ni',
        reason: 'Alta inicial inválida (#997)',
        now,
      });
      await queryRunner.commitTransaction();
    } catch (error) {
      caught = error;
      await queryRunner.rollbackTransaction();
    }

    expect(caught).toBeInstanceOf(SubscriptionRejectedError);
    expect((caught as SubscriptionRejectedError).code).toBe(
      SUBSCRIPTION_REJECTION_CODES.SUBSCRIPTION_WOULD_BREAK_SNAPSHOT,
    );

    const tenantRows = (await queryRunner.query(
      `SELECT id FROM tenants WHERE id = $1`,
      [tenantId],
    )) as Array<{ id: string }>;
    expect(tenantRows).toHaveLength(0);

    const subRows = (await queryRunner.query(
      `SELECT id FROM tenant_subscription WHERE tenant_id = $1`,
      [tenantId],
    )) as Array<{ id: string }>;
    expect(subRows).toHaveLength(0);

    const historyRows = (await queryRunner.query(
      `SELECT id FROM tenant_entitlement_change_history WHERE tenant_id = $1`,
      [tenantId],
    )) as Array<{ id: string }>;
    expect(historyRows).toHaveLength(0);
  });
});
