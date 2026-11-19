import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { CreateBootstrapIdentityTables1759000000001 } from '../../migrations/1759000000001-CreateBootstrapIdentityTables';
import { CreateEntitlementsTables1810400000000 } from '../../migrations/1810400000000-CreateEntitlementsTables';
import { DropChangeHistoryMutationPolicies1810550000000 } from '../../migrations/1810550000000-DropChangeHistoryMutationPolicies';
import { HardenEntitlementChangeHistory1810600000000 } from '../../migrations/1810600000000-HardenEntitlementChangeHistory';
import { BackfillFounderSubscriptions1810700000000 } from '../../migrations/1810700000000-BackfillFounderSubscriptions';

/**
 * Real-PostgreSQL contract net for ENT-08 of issue #984 (ODD S16/S17): the
 * backfill migration that gives every existing tenant WITHOUT a subscription
 * the plan that grants full access (PRO), with its audit row, idempotently.
 *
 * Owner decision (2026-11-19): deploying entitlements without this backfill
 * would drop tenants that use the product today into `sin_plan` (nucleus
 * only), removing purchases, recipes, promotions and margins overnight. The
 * production customer used every feature, so every existing tenant gets PRO.
 *
 * What this spec proves, against the stored effect and not the SQL text:
 *   - the subscription row AND its `tenant_entitlement_change_history` row
 *     are written together (a plan trail row without its subscription is
 *     impossible: the table's CHECK requires `subscription_id`);
 *   - a tenant that already has a subscription is left completely alone;
 *   - running `up` twice changes nothing (idempotent, ODD S16);
 *   - `down` deletes ONLY the rows marked `notes = 'backfill:#984'` and
 *     leaves every trail row in place — the trail is append-only by trigger
 *     (migration 1810600000000, installed here in the schema) and deleting
 *     it would contradict the ENT-06 guarantee (ODD S17);
 *   - under a restricted NOBYPASSRLS role (the role the schema gate uses),
 *     both `up` and `down` still work: the migration binds `app.tenant_id`
 *     per tenant instead of relying on a superuser bypass.
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
  await new DropChangeHistoryMutationPolicies1810550000000().up(queryRunner);
  // The append-only trigger is part of the deployed reality the backfill
  // runs against: installing it here proves the backfill's INSERTs are the
  // INSERTs the trigger allows (and that down() never needs to touch it).
  await new HardenEntitlementChangeHistory1810600000000().up(queryRunner);
}

async function seedTenant(
  queryRunner: QueryRunner,
  label: string,
): Promise<string> {
  const tenantId = randomUUID();
  await queryRunner.query(`INSERT INTO tenants (id, name) VALUES ($1, $2)`, [
    tenantId,
    `Backfill ${label} ${tenantId.slice(0, 8)}`,
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
  const role = `ent_backfill_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
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

const countRows = async (
  queryRunner: QueryRunner,
  table: string,
): Promise<number> => {
  const rows = (await queryRunner.query(
    `SELECT count(*)::int AS total FROM ${table}`,
  )) as Array<{ total: number }>;
  return rows[0].total;
};

const subscriptionRows = async (queryRunner: QueryRunner) =>
  (await queryRunner.query(
    `SELECT id, tenant_id, plan_code, status, starts_at, ends_at, add_ons,
            support_tier, notes
       FROM tenant_subscription
      ORDER BY plan_code, tenant_id`,
  )) as Array<{
    id: string;
    tenant_id: string;
    plan_code: string;
    status: string;
    starts_at: Date;
    ends_at: Date | null;
    add_ons: string[];
    support_tier: string;
    notes: string | null;
  }>;

const historyRows = async (queryRunner: QueryRunner) =>
  (await queryRunner.query(
    `SELECT tenant_id, change_type, subscription_id, capability_key,
            previous_value_json, new_value_json, actor, reason, occurred_at
       FROM tenant_entitlement_change_history
      ORDER BY occurred_at, tenant_id`,
  )) as Array<{
    tenant_id: string;
    change_type: string;
    subscription_id: string | null;
    capability_key: string | null;
    previous_value_json: Record<string, unknown> | null;
    new_value_json: Record<string, unknown>;
    actor: string;
    reason: string;
    occurred_at: Date;
  }>;

describe('BackfillFounderSubscriptions1810700000000 (db, ENT-08 #984)', () => {
  const TEST_TIMEOUT_MS = 60000;
  const migration = new BackfillFounderSubscriptions1810700000000();

  it(
    'crea PRO activo para un tenant sin suscripción, con su rastro (S16)',
    async () => {
      await withIsolatedSchema('ent_backfill_create', async (queryRunner) => {
        await buildSchema(queryRunner);
        const tenantId = await seedTenant(queryRunner, 'sin-plan');

        await migration.up(queryRunner);

        const subs = await subscriptionRows(queryRunner);
        expect(subs).toHaveLength(1);
        expect(subs[0].tenant_id).toBe(tenantId);
        expect(subs[0].plan_code).toBe('PRO');
        expect(subs[0].status).toBe('active');
        // PRO's own support tier (capability-registry §4), never a guess.
        expect(subs[0].support_tier).toBe('priority');
        expect(subs[0].add_ons).toEqual([]);
        expect(subs[0].notes).toBe('backfill:#984');

        // The trail row: same construction the service writes, with the
        // migration actor, a reason that says WHY, and no previous contract
        // because there was none.
        const history = await historyRows(queryRunner);
        expect(history).toHaveLength(1);
        expect(history[0].tenant_id).toBe(tenantId);
        expect(history[0].change_type).toBe('plan');
        expect(history[0].subscription_id).toBe(subs[0].id);
        expect(history[0].capability_key).toBeNull();
        expect(history[0].previous_value_json).toBeNull();
        expect(history[0].new_value_json).toMatchObject({
          plan_code: 'PRO',
          status: 'active',
          support_tier: 'priority',
        });
        expect(history[0].new_value_json.add_ons).toEqual([]);
        expect(history[0].actor).toBe('migration:#984-backfill');
        expect(history[0].reason.trim().length).toBeGreaterThan(0);
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'deja intacto al tenant que ya tiene suscripción y rellena solo al que falta',
    async () => {
      await withIsolatedSchema('ent_backfill_skip', async (queryRunner) => {
        await buildSchema(queryRunner);
        const tenantWithPlan = await seedTenant(queryRunner, 'con-plan');
        await seedSubscription(queryRunner, tenantWithPlan, 'ESENCIAL');
        const tenantWithoutPlan = await seedTenant(queryRunner, 'sin-plan');

        await migration.up(queryRunner);

        const subs = await subscriptionRows(queryRunner);
        expect(subs).toHaveLength(2);
        const existing = subs.find((row) => row.tenant_id === tenantWithPlan);
        expect(existing.plan_code).toBe('ESENCIAL');
        expect(existing.notes).toBeNull();

        const backfilled = subs.find(
          (row) => row.tenant_id === tenantWithoutPlan,
        );
        expect(backfilled.plan_code).toBe('PRO');

        // Only the tenant that lacked a contract got a trail row.
        const history = await historyRows(queryRunner);
        expect(history).toHaveLength(1);
        expect(history[0].tenant_id).toBe(tenantWithoutPlan);
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'es idempotente: correrlo dos veces no duplica suscripción ni rastro',
    async () => {
      await withIsolatedSchema('ent_backfill_twice', async (queryRunner) => {
        await buildSchema(queryRunner);
        await seedTenant(queryRunner, 'idempotente');

        await migration.up(queryRunner);
        await migration.up(queryRunner);

        expect(await countRows(queryRunner, 'tenant_subscription')).toBe(1);
        expect(
          await countRows(queryRunner, 'tenant_entitlement_change_history'),
        ).toBe(1);
        const subs = await subscriptionRows(queryRunner);
        expect(subs[0].notes).toBe('backfill:#984');
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'down elimina solo las filas marcadas y el rastro queda entero (S17)',
    async () => {
      await withIsolatedSchema('ent_backfill_down', async (queryRunner) => {
        await buildSchema(queryRunner);
        const backfilledTenant = await seedTenant(queryRunner, 'marcado');
        const manualTenant = await seedTenant(queryRunner, 'manual');
        await seedSubscription(queryRunner, manualTenant, 'OPERACION');

        await migration.up(queryRunner);
        expect(await countRows(queryRunner, 'tenant_subscription')).toBe(2);
        expect(
          await countRows(queryRunner, 'tenant_entitlement_change_history'),
        ).toBe(1);

        await migration.down(queryRunner);

        // The marked backfill subscription is gone; the operator-created
        // contract of the other tenant survives untouched.
        const subs = await subscriptionRows(queryRunner);
        expect(subs).toHaveLength(1);
        expect(subs[0].tenant_id).toBe(manualTenant);
        expect(subs[0].plan_code).toBe('OPERACION');

        // The asymmetry S17 demands: the trail row written by the backfill
        // STAYS. The history is append-only by trigger (1810600000000), and
        // deleting it would contradict the ENT-06 guarantee.
        const history = await historyRows(queryRunner);
        expect(history).toHaveLength(1);
        expect(history[0].tenant_id).toBe(backfilledTenant);
        expect(history[0].actor).toBe('migration:#984-backfill');
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'bajo un rol NOBYPASSRLS, up y down escriben y borran de verdad por el binding por tenant',
    async () => {
      await withIsolatedSchema(
        'ent_backfill_rls',
        async (queryRunner, schema) => {
          await buildSchema(queryRunner);
          const tenantId = await seedTenant(queryRunner, 'rls');

          const role = await provisionRestrictedRole(queryRunner, schema);
          await queryRunner.query(`SET ROLE "${role}"`);

          // Baseline: an unbound read by the restricted role sees nothing
          // (the predicate is NULL without a binding). This must run BEFORE
          // up(): a transaction-local set_config leaves an empty-string
          // residual on the session, and the policy cast (''::uuid) would
          // then fail this read instead of filtering it.
          const unbound = (await queryRunner.query(
            `SELECT count(*)::int AS total FROM tenant_subscription`,
          )) as Array<{ total: number }>;
          expect(unbound[0].total).toBe(0);

          // Under NOBYPASSRLS the FORCE RLS policies apply: the per-tenant
          // set_config binding is what lets the INSERTs pass WITH CHECK at
          // all. Without it, up() would fail loudly here.
          await migration.up(queryRunner);

          // The stored effect is verified as the schema-owner superuser,
          // which bypasses RLS entirely.
          await queryRunner.query('RESET ROLE');
          const subs = await subscriptionRows(queryRunner);
          expect(subs).toHaveLength(1);
          expect(subs[0].tenant_id).toBe(tenantId);
          expect(subs[0].plan_code).toBe('PRO');
          expect(subs[0].notes).toBe('backfill:#984');

          // Same for down(): under the restricted role it must actually
          // delete the marked row (not silently no-op), verified as owner.
          await queryRunner.query(`SET ROLE "${role}"`);
          await migration.down(queryRunner);
          await queryRunner.query('RESET ROLE');
          expect(await countRows(queryRunner, 'tenant_subscription')).toBe(0);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );
});
