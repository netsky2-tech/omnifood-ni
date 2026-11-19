import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { CreateBootstrapIdentityTables1759000000001 } from '../../migrations/1759000000001-CreateBootstrapIdentityTables';
import { CreateEntitlementsTables1810400000000 } from '../../migrations/1810400000000-CreateEntitlementsTables';
import { EntitlementsService } from './entitlements.service';
import {
  SUBSCRIPTION_REJECTION_CODES,
  SubscriptionRejectedError,
} from './tenant-subscription.service';
import { TenantSubscriptionService } from './tenant-subscription.service';

/**
 * Real-PostgreSQL contract net for ENT-07 of issue #984 (plan changes and
 * add-ons, ODD S10–S13).
 *
 * The unit spec proves the input rules; this spec proves the *stored* effect:
 * that a plan change writes the new subscription AND its audit row in ONE
 * transaction, that the snapshot actually reflects the change, that the
 * previous contract is captured, that a refusal leaves the database
 * untouched, and that a change which would break the snapshot is rolled back
 * entirely.
 *
 * The isolation case binds `app.tenant_id` with `set_config` before mutating:
 * without the binding RLS hides every row and a broken mutation would be a
 * silent no-op that proves nothing.
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

/** Same facade as entitlement-overrides.db.spec.ts: pooled connection stays the test's. */
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

const dataSourceOnSession = (runner: QueryRunner): DataSource =>
  ({
    createQueryRunner: () => new SessionQueryRunner(runner),
  }) as unknown as DataSource;

const NOW = new Date('2026-11-18T15:00:00.000Z');

const grantedRoles = new Map<string, string>();

async function withIsolatedSchema(
  schemaPrefix: string,
  assertion: (queryRunner: QueryRunner, schema: string) => Promise<void>,
): Promise<void> {
  const dataSource = new DataSource({
    type: 'postgres',
    ...postgresConnection,
  });
  const schema = `${schemaPrefix}_${randomUUID().replace(/-/g, '')}`;
  const queryRunner = dataSource.createQueryRunner();
  let isInitialized = false;

  try {
    await dataSource.initialize();
    isInitialized = true;
    await queryRunner.connect();
    await queryRunner.query(`CREATE SCHEMA "${schema}"`);
    await queryRunner.query(`SET search_path TO "${schema}"`);
    await queryRunner.query(`SET statement_timeout TO '15000ms'`);
    await assertion(queryRunner, schema);
  } finally {
    try {
      await queryRunner.query('RESET ROLE');
    } catch {
      // no-op: the role switch may never have happened
    }
    try {
      await queryRunner.query('SET search_path TO public');
      await queryRunner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } catch {
      // no-op: cleanup is best effort when bootstrap fails
    }
    const restrictedRole = grantedRoles.get(schema);
    if (restrictedRole) {
      try {
        await queryRunner.query(`DROP ROLE IF EXISTS "${restrictedRole}"`);
        grantedRoles.delete(schema);
      } catch {
        // no-op: roles are cluster-wide objects; cleanup is best effort
      }
    }
    try {
      await queryRunner.release();
    } catch {
      // no-op: runner may not be connected on bootstrap errors
    }
    if (isInitialized) {
      await dataSource.destroy();
    }
  }
}

async function buildSchema(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.query(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'users_role_enum' AND n.nspname = 'public')
         AND NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'users_role_enum' AND n.nspname = current_schema()) THEN
        CREATE TYPE users_role_enum AS ENUM ('OWNER', 'MANAGER', 'CASHIER', 'WAITER');
      END IF;
    END $$;
  `);
  await new CreateBootstrapIdentityTables1759000000001().up(queryRunner);
  await new CreateEntitlementsTables1810400000000().up(queryRunner);
}

async function seedTenant(
  queryRunner: QueryRunner,
  label: string,
): Promise<string> {
  const tenantId = randomUUID();
  await queryRunner.query(`INSERT INTO tenants (id, name) VALUES ($1, $2)`, [
    tenantId,
    `Subscription ${label} ${tenantId.slice(0, 8)}`,
  ]);
  return tenantId;
}

async function seedSubscription(
  queryRunner: QueryRunner,
  tenantId: string,
  plan = 'ESENCIAL',
): Promise<void> {
  await queryRunner.query(
    `INSERT INTO tenant_subscription
       (tenant_id, plan_code, status, starts_at, ends_at, add_ons, support_tier)
     VALUES ($1, $2, 'active', '2026-01-01T00:00:00.000Z', NULL, '[]'::jsonb, 'standard')`,
    [tenantId, plan],
  );
}

async function provisionRestrictedRole(
  queryRunner: QueryRunner,
  schema: string,
): Promise<string> {
  const role = `ent_sub_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
  await queryRunner.query(
    `CREATE ROLE "${role}" NOLOGIN NOSUPERUSER NOBYPASSRLS`,
  );
  await queryRunner.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}"`);
  await queryRunner.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "${schema}" TO "${role}"`,
  );
  grantedRoles.set(schema, role);
  return role;
}

const subscriptionsOn = (runner: QueryRunner): TenantSubscriptionService =>
  new TenantSubscriptionService(dataSourceOnSession(runner));

const entitlementsOn = (runner: QueryRunner): EntitlementsService =>
  new EntitlementsService(dataSourceOnSession(runner));

const planChange = (
  tenantId: string,
  overrides: Record<string, unknown> = {},
) => ({
  tenantId,
  planCode: 'OPERACION',
  addOns: ['pack.retail'],
  actor: 'soporte@nhilos.com',
  reason: 'Upgrade solicitado por el cliente; contrato firmado 2026-11-25.',
  startsAt: NOW,
  now: NOW,
  ...overrides,
});

const countRows = async (
  queryRunner: QueryRunner,
  table: string,
): Promise<number> => {
  const rows = (await queryRunner.query(
    `SELECT count(*)::int AS total FROM ${table}`,
  )) as Array<{ total: number }>;
  return rows[0].total;
};

describe('TenantSubscriptionService (db, ENT-07 #984)', () => {
  const TEST_TIMEOUT_MS = 60000;

  it(
    'escribe la suscripción nueva y su rastro en una transacción, y el snapshot lo refleja',
    async () => {
      await withIsolatedSchema('ent_sub_change', async (queryRunner) => {
        await buildSchema(queryRunner);
        const tenantId = await seedTenant(queryRunner, 'change');
        await seedSubscription(queryRunner, tenantId, 'ESENCIAL');

        const before = await entitlementsOn(queryRunner).snapshot(
          tenantId,
          NOW,
        );
        expect(before.planCode).toBe('ESENCIAL');
        expect(before.capabilities).not.toContain('inventory.retail');

        const changed = await subscriptionsOn(queryRunner).changePlan(
          planChange(tenantId),
        );
        expect(changed.planCode).toBe('OPERACION');

        // The snapshot sees the new contract: the pack add-on turned the
        // retail pack on (ODD S13: the change is effective, not just stored).
        const after = await entitlementsOn(queryRunner).snapshot(tenantId, NOW);
        expect(after.planCode).toBe('OPERACION');
        expect(after.capabilities).toContain('inventory.retail');
        expect(after.addOns).toContain('pack.retail');

        // One trail row of kind `plan`, bound to the new subscription, with
        // the previous contract captured (ODD S10).
        const trail = await subscriptionsOn(queryRunner).list({ tenantId });
        expect(trail).toHaveLength(1);
        expect(trail[0].changeType).toBe('plan');
        expect(trail[0].subscriptionId).toBe(changed.subscriptionId);
        expect(trail[0].previousValueJson).toMatchObject({
          plan_code: 'ESENCIAL',
          status: 'active',
        });
        expect(trail[0].newValueJson).toMatchObject({
          plan_code: 'OPERACION',
          status: 'active',
          add_ons: ['pack.retail'],
        });
        expect(trail[0].actor).toBe('soporte@nhilos.com');
        expect(trail[0].reason).toContain('Upgrade solicitado');

        // Two rows total: the seeded one and the new one. The old contract is
        // never edited or deleted: supersession, not mutation.
        expect(await countRows(queryRunner, 'tenant_subscription')).toBe(2);
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'captura el contrato anterior completo, incluidos sus add-ons',
    async () => {
      await withIsolatedSchema('ent_sub_previous', async (queryRunner) => {
        await buildSchema(queryRunner);
        const tenantId = await seedTenant(queryRunner, 'previous');
        await queryRunner.query(
          `INSERT INTO tenant_subscription
             (tenant_id, plan_code, status, starts_at, ends_at, add_ons, support_tier)
           VALUES ($1, 'ESENCIAL', 'active', '2026-01-01T00:00:00.000Z',
                   '2026-12-31T23:59:59.000Z', '["terminal.extra"]'::jsonb, 'standard')`,
          [tenantId],
        );

        await subscriptionsOn(queryRunner).changePlan(planChange(tenantId));

        const trail = await subscriptionsOn(queryRunner).list({ tenantId });
        expect(trail[0].previousValueJson).toStrictEqual({
          plan_code: 'ESENCIAL',
          status: 'active',
          starts_at: '2026-01-01T00:00:00.000Z',
          ends_at: '2026-12-31T23:59:59.000Z',
          add_ons: ['terminal.extra'],
          support_tier: 'standard',
        });
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'rechaza un plan desconocido y un add-on desconocido sin escribir nada (S11)',
    async () => {
      await withIsolatedSchema('ent_sub_unknown', async (queryRunner) => {
        await buildSchema(queryRunner);
        const tenantId = await seedTenant(queryRunner, 'unknown');
        await seedSubscription(queryRunner, tenantId);

        await expect(
          subscriptionsOn(queryRunner).changePlan(
            planChange(tenantId, { planCode: 'ENTERPRISE' }),
          ),
        ).rejects.toMatchObject({
          code: SUBSCRIPTION_REJECTION_CODES.PLAN_CODE_NOT_REGISTERED,
        });
        await expect(
          subscriptionsOn(queryRunner).changePlan(
            planChange(tenantId, { addOns: ['pack.blockchain'] }),
          ),
        ).rejects.toMatchObject({
          code: SUBSCRIPTION_REJECTION_CODES.ADD_ON_NOT_REGISTERED,
        });

        expect(await countRows(queryRunner, 'tenant_subscription')).toBe(1);
        expect(
          await countRows(queryRunner, 'tenant_entitlement_change_history'),
        ).toBe(0);
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'rechaza el cambio sin actor o sin motivo: no existe cambio sin rastro (S12)',
    async () => {
      await withIsolatedSchema('ent_sub_trace', async (queryRunner) => {
        await buildSchema(queryRunner);
        const tenantId = await seedTenant(queryRunner, 'trace');
        await seedSubscription(queryRunner, tenantId);

        await expect(
          subscriptionsOn(queryRunner).changePlan(
            planChange(tenantId, { actor: '   ' }),
          ),
        ).rejects.toMatchObject({
          code: SUBSCRIPTION_REJECTION_CODES.SUBSCRIPTION_ACTOR_REQUIRED,
        });
        await expect(
          subscriptionsOn(queryRunner).changePlan(
            planChange(tenantId, { reason: '' }),
          ),
        ).rejects.toMatchObject({
          code: SUBSCRIPTION_REJECTION_CODES.SUBSCRIPTION_REASON_REQUIRED,
        });

        expect(await countRows(queryRunner, 'tenant_subscription')).toBe(1);
        expect(
          await countRows(queryRunner, 'tenant_entitlement_change_history'),
        ).toBe(0);
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'revierte por completo un cambio que dejaría el snapshot irresoluble (S13)',
    async () => {
      await withIsolatedSchema('ent_sub_poison', async (queryRunner) => {
        await buildSchema(queryRunner);
        const tenantId = await seedTenant(queryRunner, 'poison');
        await seedSubscription(queryRunner, tenantId, 'ESENCIAL');

        // `bundle.convenio` turns on `promotions.convenio`, whose prerequisite
        // `promotions` is in no part of this contract: the resolver refuses it.
        await expect(
          subscriptionsOn(queryRunner).changePlan(
            planChange(tenantId, {
              planCode: 'ESENCIAL',
              addOns: ['bundle.convenio'],
            }),
          ),
        ).rejects.toBeInstanceOf(SubscriptionRejectedError);

        // Nothing was written: neither the subscription nor the trail row.
        expect(await countRows(queryRunner, 'tenant_subscription')).toBe(1);
        expect(
          await countRows(queryRunner, 'tenant_entitlement_change_history'),
        ).toBe(0);

        // The tenant's snapshot is still servable on the old contract.
        const snapshot = await entitlementsOn(queryRunner).snapshot(
          tenantId,
          NOW,
        );
        expect(snapshot.planCode).toBe('ESENCIAL');
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'bajo una sesión restringida, las políticas RLS aíslan los cambios de plan entre tenants',
    async () => {
      await withIsolatedSchema(
        'ent_sub_isolation',
        async (queryRunner, schema) => {
          await buildSchema(queryRunner);
          const tenantA = await seedTenant(queryRunner, 'aislado-a');
          const tenantB = await seedTenant(queryRunner, 'aislado-b');
          await seedSubscription(queryRunner, tenantA);
          await seedSubscription(queryRunner, tenantB);

          const role = await provisionRestrictedRole(queryRunner, schema);
          await queryRunner.query(`SET ROLE "${role}"`);
          // Bind the session to tenant A by hand: from here on, anything this
          // session writes for tenant B must be refused by the policies, not
          // by the service (which always re-binds to its own argument).
          await queryRunner.query(
            `SELECT set_config('app.tenant_id', $1, false)`,
            [tenantA],
          );

          const changed = await subscriptionsOn(queryRunner).changePlan(
            planChange(tenantA),
          );
          expect(changed.planCode).toBe('OPERACION');

          const visible = (await queryRunner.query(
            `SELECT tenant_id FROM tenant_subscription`,
          )) as Array<{ tenant_id: string }>;
          expect(visible).toHaveLength(2);
          expect(visible.every((row) => row.tenant_id === tenantA)).toBe(true);

          // A foreign tenant_id is rejected by RLS WITH CHECK, not filtered out.
          await expect(
            queryRunner.query(
              `INSERT INTO tenant_subscription
                 (tenant_id, plan_code, status, starts_at, ends_at, add_ons, support_tier)
               VALUES ($1, 'PRO', 'active', '2026-01-01T00:00:00.000Z', NULL,
                       '[]'::jsonb, 'priority')`,
              [tenantB],
            ),
          ).rejects.toThrow();

          const historyVisible = (await queryRunner.query(
            `SELECT tenant_id FROM tenant_entitlement_change_history`,
          )) as Array<{ tenant_id: string }>;
          expect(historyVisible).toHaveLength(1);
          expect(historyVisible[0].tenant_id).toBe(tenantA);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'un cambio de estado a suspendida deja el contrato consultable pero sin premium',
    async () => {
      await withIsolatedSchema('ent_sub_suspend', async (queryRunner) => {
        await buildSchema(queryRunner);
        const tenantId = await seedTenant(queryRunner, 'suspend');
        await seedSubscription(queryRunner, tenantId, 'OPERACION');
        await queryRunner.query(
          `UPDATE tenant_subscription SET add_ons = '["pack.retail"]'::jsonb
            WHERE tenant_id = $1`,
          [tenantId],
        );

        const before = await entitlementsOn(queryRunner).snapshot(
          tenantId,
          NOW,
        );
        expect(before.capabilities).toContain('inventory.retail');

        // A downgrade to suspended keeps the row: no DELETE, ever.
        await subscriptionsOn(queryRunner).changePlan(
          planChange(tenantId, {
            planCode: 'OPERACION',
            addOns: ['pack.retail'],
            status: 'suspended',
            reason: 'Mora de dos ciclos; se suspende sin borrar el contrato.',
          }),
        );

        const after = await entitlementsOn(queryRunner).snapshot(tenantId, NOW);
        expect(after.status).toBe('suspended');
        expect(after.capabilities).not.toContain('inventory.retail');
        expect(await countRows(queryRunner, 'tenant_subscription')).toBe(2);
      });
    },
    TEST_TIMEOUT_MS,
  );
});
