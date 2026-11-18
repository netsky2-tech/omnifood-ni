import { randomUUID } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { DataSource, type QueryRunner } from 'typeorm';
import { CreateBootstrapIdentityTables1759000000001 } from '../../migrations/1759000000001-CreateBootstrapIdentityTables';
import { CreateEntitlementsTables1810400000000 } from '../../migrations/1810400000000-CreateEntitlementsTables';
import { NUCLEUS_CAPABILITY_KEYS } from './capability-registry';
import { EntitlementsService } from './entitlements.service';
import { ENTITLEMENT_SNAPSHOT_TTL_MS } from './entitlement-resolution';

/**
 * Real-PostgreSQL contract net for ENT-02 of issue #984.
 *
 * The unit spec proves the rules; this spec proves the *contract*: that the
 * snapshot served for a tenant is built from STORED rows under the tenant's
 * RLS context, that the envelope's versioning and TTL hold, and that a session
 * bound to tenant A cannot see tenant B's subscription or override. Isolation
 * assertions run through a NOSUPERUSER NOBYPASSRLS role via SET ROLE, because
 * a superuser bypasses RLS and would prove nothing.
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

/**
 * Minimal QueryRunner facade over the test's own runner: the service opens,
 * commits and "releases" what it believes is a pooled connection, while the
 * queries stay on the session whose `search_path` and role the test controls.
 */
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

const serviceOnSession = (runner: QueryRunner): EntitlementsService =>
  new EntitlementsService({
    createQueryRunner: () => new SessionQueryRunner(runner),
  } as unknown as DataSource);

const NOW = new Date('2026-11-17T15:00:00.000Z');

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
    `Entitlements ${label} ${tenantId.slice(0, 8)}`,
  ]);
  return tenantId;
}

async function seedSubscription(
  queryRunner: QueryRunner,
  tenantId: string,
  fields: {
    plan?: string;
    status?: string;
    startsAt?: string;
    endsAt?: string | null;
    addOns?: string[];
    supportTier?: string;
  } = {},
): Promise<void> {
  await queryRunner.query(
    `INSERT INTO tenant_subscription
       (tenant_id, plan_code, status, starts_at, ends_at, add_ons, support_tier)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [
      tenantId,
      fields.plan ?? 'ESENCIAL',
      fields.status ?? 'active',
      fields.startsAt ?? '2026-01-01T00:00:00.000Z',
      fields.endsAt ?? null,
      JSON.stringify(fields.addOns ?? []),
      fields.supportTier ?? 'standard',
    ],
  );
}

async function seedOverride(
  queryRunner: QueryRunner,
  tenantId: string,
  capabilityKey: string,
  valueJson: Record<string, unknown>,
  expiresAt: string,
): Promise<void> {
  await queryRunner.query(
    `INSERT INTO tenant_entitlement_override
       (tenant_id, capability_key, value_json, actor, reason, expires_at)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6)`,
    [
      tenantId,
      capabilityKey,
      JSON.stringify(valueJson),
      'ent-02-spec',
      'contract fixture',
      expiresAt,
    ],
  );
}

async function provisionRestrictedRole(
  queryRunner: QueryRunner,
  schema: string,
): Promise<string> {
  const role = `ent_api_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
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

describe('EntitlementsService.snapshot (db, ENT-02 #984)', () => {
  const TEST_TIMEOUT_MS = 60000;

  it(
    'sirve el contrato v1 completo para un ESENCIAL activo',
    async () => {
      await withIsolatedSchema('ent_api_contract', async (queryRunner) => {
        await buildSchema(queryRunner);
        const tenantId = await seedTenant(queryRunner, 'esencial');
        await seedSubscription(queryRunner, tenantId);

        const snapshot = await serviceOnSession(queryRunner).snapshot(
          tenantId,
          NOW,
        );

        expect(snapshot.version).toBe(1);
        expect(snapshot.planCode).toBe('ESENCIAL');
        expect(snapshot.status).toBe('active');
        expect(snapshot.supportTier).toBe('standard');
        expect(snapshot.capabilities).toStrictEqual([
          ...NUCLEUS_CAPABILITY_KEYS,
        ]);
        expect(snapshot.limits).toStrictEqual({
          'limits.terminals': 1,
          'limits.owner_accounts': 2,
          'core.pos_users': null,
        });
        expect(snapshot.addOns).toStrictEqual([]);

        expect(snapshot.issuedAt).toBe(NOW.toISOString());
        const ttl =
          new Date(snapshot.expiresAt).getTime() -
          new Date(snapshot.issuedAt).getTime();
        expect(ttl).toBe(ENTITLEMENT_SNAPSHOT_TTL_MS);
        expect(Number.isNaN(new Date(snapshot.expiresAt).getTime())).toBe(
          false,
        );
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'aplica add-ons y overrides vigentes, e ignora los vencidos',
    async () => {
      await withIsolatedSchema('ent_api_resolve', async (queryRunner) => {
        await buildSchema(queryRunner);
        const tenantId = await seedTenant(queryRunner, 'pro');
        await seedSubscription(queryRunner, tenantId, {
          plan: 'PRO',
          addOns: ['terminal.extra', 'terminal.extra'],
          supportTier: 'priority',
        });
        await seedOverride(
          queryRunner,
          tenantId,
          'loyalty',
          { included: false },
          '2027-01-01T00:00:00.000Z',
        );
        await seedOverride(
          queryRunner,
          tenantId,
          'reports.margins',
          { included: false },
          '2026-11-17T14:59:59.000Z',
        );

        const snapshot = await serviceOnSession(queryRunner).snapshot(
          tenantId,
          NOW,
        );

        expect(snapshot.status).toBe('active');
        expect(snapshot.supportTier).toBe('priority');
        // The vigente override wins over the plan; both packs stay.
        expect(snapshot.capabilities).not.toContain('loyalty');
        expect(snapshot.capabilities).toContain('inventory.retail');
        expect(snapshot.capabilities).toContain('inventory.cooking');
        // The expired override no longer applies, without being deleted.
        expect(snapshot.capabilities).toContain('reports.margins');
        expect(snapshot.limits['limits.terminals']).toBe(4);
        expect(snapshot.addOns).toStrictEqual([
          'terminal.extra',
          'terminal.extra',
        ]);
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'un tenant sin suscripción recibe el núcleo y estado sin_plan',
    async () => {
      await withIsolatedSchema('ent_api_sinplan', async (queryRunner) => {
        await buildSchema(queryRunner);
        const tenantId = await seedTenant(queryRunner, 'sin-plan');

        const snapshot = await serviceOnSession(queryRunner).snapshot(
          tenantId,
          NOW,
        );

        expect(snapshot.status).toBe('sin_plan');
        expect(snapshot.planCode).toBeNull();
        expect(snapshot.capabilities).toStrictEqual([
          ...NUCLEUS_CAPABILITY_KEYS,
        ]);
        expect(snapshot.limits['limits.terminals']).toBe(1);
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'una suscripción suspendida conserva el núcleo y sus cuotas de hardware',
    async () => {
      await withIsolatedSchema('ent_api_suspended', async (queryRunner) => {
        await buildSchema(queryRunner);
        const tenantId = await seedTenant(queryRunner, 'suspendido');
        await seedSubscription(queryRunner, tenantId, {
          plan: 'PRO',
          status: 'suspended',
        });

        const snapshot = await serviceOnSession(queryRunner).snapshot(
          tenantId,
          NOW,
        );

        expect(snapshot.status).toBe('suspended');
        expect(snapshot.capabilities).toStrictEqual([
          ...NUCLEUS_CAPABILITY_KEYS,
        ]);
        expect(snapshot.limits['limits.terminals']).toBe(2);
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'no expone el contrato de otro tenant bajo una sesión restringida',
    async () => {
      await withIsolatedSchema(
        'ent_api_isolation',
        async (queryRunner, schema) => {
          await buildSchema(queryRunner);
          const tenantA = await seedTenant(queryRunner, 'aislado-a');
          const tenantB = await seedTenant(queryRunner, 'aislado-b');
          await seedSubscription(queryRunner, tenantA);
          await seedSubscription(queryRunner, tenantB, {
            plan: 'PRO',
            addOns: ['pack.retail'],
          });
          await seedOverride(
            queryRunner,
            tenantB,
            'reports.margins',
            { included: true },
            '2027-01-01T00:00:00.000Z',
          );

          const role = await provisionRestrictedRole(queryRunner, schema);
          await queryRunner.query(`SET ROLE "${role}"`);

          const snapshotA = await serviceOnSession(queryRunner).snapshot(
            tenantA,
            NOW,
          );

          expect(snapshotA.planCode).toBe('ESENCIAL');
          expect(snapshotA.capabilities).toStrictEqual([
            ...NUCLEUS_CAPABILITY_KEYS,
          ]);
          expect(snapshotA.addOns).toStrictEqual([]);
          expect(snapshotA.capabilities).not.toContain('reports.margins');

          const snapshotB = await serviceOnSession(queryRunner).snapshot(
            tenantB,
            NOW,
          );
          expect(snapshotB.planCode).toBe('PRO');
          expect(snapshotB.capabilities).toContain('reports.margins');
          expect(snapshotB.addOns).toStrictEqual(['pack.retail']);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'rechaza una petición sin contexto de tenant antes de tocar la base',
    async () => {
      await withIsolatedSchema('ent_api_notenant', async (queryRunner) => {
        await buildSchema(queryRunner);
        await expect(
          serviceOnSession(queryRunner).snapshot('   '),
        ).rejects.toThrow(UnauthorizedException);
      });
    },
    TEST_TIMEOUT_MS,
  );
});
