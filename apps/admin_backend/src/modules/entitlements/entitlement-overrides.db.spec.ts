import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { CreateBootstrapIdentityTables1759000000001 } from '../../migrations/1759000000001-CreateBootstrapIdentityTables';
import { CreateEntitlementsTables1810400000000 } from '../../migrations/1810400000000-CreateEntitlementsTables';
import {
  OVERRIDE_REJECTION_CODES,
  OverrideRejectedError,
} from './entitlement-override-input';
import { EntitlementOverridesService } from './entitlement-overrides.service';
import { EntitlementsService } from './entitlements.service';

/**
 * Real-PostgreSQL contract net for ENT-06 of issue #984 (audited overrides).
 *
 * The unit spec proves the input rules; this spec proves the *stored* effect:
 * that a grant writes the exception AND its audit row in one transaction, that
 * a refusal leaves the database untouched, that a revoke ends the exception
 * without deleting it, and that isolation holds under a NOSUPERUSER
 * NOBYPASSRLS role.
 *
 * The last case is the one that matters most: an exception that would make the
 * tenant's snapshot unresolvable is refused and rolled back, so support can
 * never break a tenant's entitlements by granting something contradictory.
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

/** Same facade as entitlements-api.db.spec.ts: pooled connection stays the test's. */
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
const IN_30_DAYS = new Date('2026-12-18T15:00:00.000Z');

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
    `Overrides ${label} ${tenantId.slice(0, 8)}`,
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
  const role = `ent_ovr_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
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

const overridesOn = (runner: QueryRunner): EntitlementOverridesService =>
  new EntitlementOverridesService(dataSourceOnSession(runner));

const entitlementsOn = (runner: QueryRunner): EntitlementsService =>
  new EntitlementsService(dataSourceOnSession(runner));

const grant = (tenantId: string, overrides: Record<string, unknown> = {}) => ({
  tenantId,
  capabilityKey: 'inventory.retail',
  valueJson: { included: true },
  actor: 'soporte@nhilos.com',
  reason: 'Piloto autorizado: el cliente pagó el pack fuera del contrato.',
  expiresAt: IN_30_DAYS,
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

describe('EntitlementOverridesService (db, ENT-06 #984)', () => {
  const TEST_TIMEOUT_MS = 60000;

  it(
    'concede la excepción, la audita y la hace efectiva en el snapshot',
    async () => {
      await withIsolatedSchema('ent_ovr_grant', async (queryRunner) => {
        await buildSchema(queryRunner);
        const tenantId = await seedTenant(queryRunner, 'grant');
        await seedSubscription(queryRunner, tenantId);

        const before = await entitlementsOn(queryRunner).snapshot(
          tenantId,
          NOW,
        );
        expect(before.capabilities).not.toContain('inventory.retail');

        const granted = await overridesOn(queryRunner).grant(grant(tenantId));
        expect(granted.capabilityKey).toBe('inventory.retail');
        expect(granted.expiresAt).toStrictEqual(IN_30_DAYS);

        const after = await entitlementsOn(queryRunner).snapshot(tenantId, NOW);
        expect(after.capabilities).toContain('inventory.retail');

        const history = await overridesOn(queryRunner).history({ tenantId });
        expect(history).toHaveLength(1);
        expect(history[0].changeType).toBe('override');
        expect(history[0].overrideId).toBe(granted.overrideId);
        expect(history[0].capabilityKey).toBe('inventory.retail');
        expect(history[0].previousValueJson).toBeNull();
        expect(history[0].newValueJson).toStrictEqual({ included: true });
        expect(history[0].actor).toBe('soporte@nhilos.com');
        expect(history[0].reason).toContain('Piloto autorizado');
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'el límite concedido gana sobre el del plan',
    async () => {
      await withIsolatedSchema('ent_ovr_limit', async (queryRunner) => {
        await buildSchema(queryRunner);
        const tenantId = await seedTenant(queryRunner, 'limit');
        await seedSubscription(queryRunner, tenantId);

        await overridesOn(queryRunner).grant(
          grant(tenantId, {
            capabilityKey: 'limits.terminals',
            valueJson: { limit: 5 },
          }),
        );

        const snapshot = await entitlementsOn(queryRunner).snapshot(
          tenantId,
          NOW,
        );
        expect(snapshot.limits['limits.terminals']).toBe(5);
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'rechaza una segunda excepción vigente sobre la misma clave sin escribir nada',
    async () => {
      await withIsolatedSchema('ent_ovr_conflict', async (queryRunner) => {
        await buildSchema(queryRunner);
        const tenantId = await seedTenant(queryRunner, 'conflict');
        await seedSubscription(queryRunner, tenantId);

        await overridesOn(queryRunner).grant(grant(tenantId));

        await expect(
          overridesOn(queryRunner).grant(grant(tenantId)),
        ).rejects.toMatchObject({
          code: OVERRIDE_REJECTION_CODES.OVERRIDE_ALREADY_ACTIVE,
        });

        expect(
          await countRows(queryRunner, 'tenant_entitlement_override'),
        ).toBe(1);
        expect(
          await countRows(queryRunner, 'tenant_entitlement_change_history'),
        ).toBe(1);
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'revocar termina la excepción sin borrar el registro, y deja su propio rastro',
    async () => {
      await withIsolatedSchema('ent_ovr_revoke', async (queryRunner) => {
        await buildSchema(queryRunner);
        const tenantId = await seedTenant(queryRunner, 'revoke');
        await seedSubscription(queryRunner, tenantId);

        const granted = await overridesOn(queryRunner).grant(grant(tenantId));
        const later = new Date('2026-11-25T15:00:00.000Z');
        await overridesOn(queryRunner).revoke({
          tenantId,
          overrideId: granted.overrideId,
          actor: 'soporte@nhilos.com',
          reason: 'El cliente canceló el piloto.',
          now: later,
        });

        const snapshot = await entitlementsOn(queryRunner).snapshot(
          tenantId,
          later,
        );
        expect(snapshot.capabilities).not.toContain('inventory.retail');

        // The row survives: exceptions are ended, never deleted.
        expect(
          await countRows(queryRunner, 'tenant_entitlement_override'),
        ).toBe(1);
        const rows = (await queryRunner.query(
          `SELECT expires_at FROM tenant_entitlement_override`,
        )) as Array<{ expires_at: Date }>;
        expect(rows[0].expires_at.getTime()).toBe(later.getTime());

        const history = await overridesOn(queryRunner).history({ tenantId });
        expect(history).toHaveLength(2);
        expect(history[0].newValueJson).toStrictEqual({ revoked: true });
        expect(history[0].previousValueJson).toStrictEqual({ included: true });
        expect(history[0].reason).toContain('canceló el piloto');
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'se niega a conceder una excepción que dejaría el snapshot irresoluble',
    async () => {
      await withIsolatedSchema('ent_ovr_poison', async (queryRunner) => {
        await buildSchema(queryRunner);
        const tenantId = await seedTenant(queryRunner, 'poison');
        // ESENCIAL does not include `promotions`, and `promotions.convenio`
        // requires it: granting the convenio alone would break resolution.
        await seedSubscription(queryRunner, tenantId, 'ESENCIAL');

        await expect(
          overridesOn(queryRunner).grant(
            grant(tenantId, {
              capabilityKey: 'promotions.convenio',
              valueJson: { included: true },
            }),
          ),
        ).rejects.toBeInstanceOf(OverrideRejectedError);

        expect(
          await countRows(queryRunner, 'tenant_entitlement_override'),
        ).toBe(0);
        expect(
          await countRows(queryRunner, 'tenant_entitlement_change_history'),
        ).toBe(0);

        // The tenant's snapshot is still servable.
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
    'se niega a revocar la excepción que sostiene un prerrequisito, y no escribe nada',
    async () => {
      await withIsolatedSchema('ent_ovr_revoke_poison', async (queryRunner) => {
        await buildSchema(queryRunner);
        const tenantId = await seedTenant(queryRunner, 'revoke-poison');
        await seedSubscription(queryRunner, tenantId, 'ESENCIAL');

        // `promotions.convenio` requires `promotions`; both exist only as
        // exceptions here, so revoking `promotions` would leave the convenio
        // without its prerequisite and the snapshot unresolvable.
        await overridesOn(queryRunner).grant(
          grant(tenantId, { capabilityKey: 'promotions' }),
        );
        await overridesOn(queryRunner).grant(
          grant(tenantId, { capabilityKey: 'promotions.convenio' }),
        );
        const before = await entitlementsOn(queryRunner).snapshot(
          tenantId,
          NOW,
        );

        await expect(
          overridesOn(queryRunner).revoke({
            tenantId,
            capabilityKey: 'promotions',
            actor: 'soporte@nhilos.com',
            reason: 'Fin del piloto',
            now: NOW,
          }),
        ).rejects.toMatchObject({
          code: OVERRIDE_REJECTION_CODES.OVERRIDE_WOULD_BREAK_SNAPSHOT,
        });

        // Nothing changed: both exceptions are still in force, the trail has
        // only the two grants, and the snapshot still resolves.
        const active = (
          await overridesOn(queryRunner).list({ tenantId, now: NOW })
        )
          .filter((row) => row.isActive)
          .map((row) => row.capabilityKey)
          .sort();
        expect(active).toStrictEqual(['promotions', 'promotions.convenio']);
        expect(
          await countRows(queryRunner, 'tenant_entitlement_change_history'),
        ).toBe(2);
        expect(
          (await entitlementsOn(queryRunner).snapshot(tenantId, NOW))
            .capabilities,
        ).toStrictEqual(before.capabilities);
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'una excepción vencida no aplica pero sigue consultable',
    async () => {
      await withIsolatedSchema('ent_ovr_expired', async (queryRunner) => {
        await buildSchema(queryRunner);
        const tenantId = await seedTenant(queryRunner, 'expired');
        await seedSubscription(queryRunner, tenantId);

        await overridesOn(queryRunner).grant(grant(tenantId));
        const muchLater = new Date('2027-06-01T00:00:00.000Z');

        const rows = await overridesOn(queryRunner).list({
          tenantId,
          now: muchLater,
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].isActive).toBe(false);

        const snapshot = await entitlementsOn(queryRunner).snapshot(
          tenantId,
          muchLater,
        );
        expect(snapshot.capabilities).not.toContain('inventory.retail');
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'bajo una sesión restringida, las políticas RLS aíslan las excepciones entre tenants',
    async () => {
      await withIsolatedSchema(
        'ent_ovr_isolation',
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

          const granted = await overridesOn(queryRunner).grant(grant(tenantA));
          expect(granted.capabilityKey).toBe('inventory.retail');

          const visible = (await queryRunner.query(
            `SELECT tenant_id FROM tenant_entitlement_override`,
          )) as Array<{ tenant_id: string }>;
          expect(visible).toHaveLength(1);
          expect(visible[0].tenant_id).toBe(tenantA);

          // A foreign tenant_id is rejected by RLS WITH CHECK, not filtered out.
          await expect(
            queryRunner.query(
              `INSERT INTO tenant_entitlement_override
                 (tenant_id, capability_key, value_json, actor, reason, expires_at)
               VALUES ($1, 'loyalty', '{"included": true}'::jsonb, 'intruso',
                       'no debería poder', now() + interval '1 day')`,
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
});
