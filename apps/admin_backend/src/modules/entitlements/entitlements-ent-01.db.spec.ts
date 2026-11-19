import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { CreateBootstrapIdentityTables1759000000001 } from '../../migrations/1759000000001-CreateBootstrapIdentityTables';
import { CreateEntitlementsTables1810400000000 } from '../../migrations/1810400000000-CreateEntitlementsTables';
import { SeedConvenioCapability1810500000000 } from '../../migrations/1810500000000-SeedConvenioCapability';
import {
  CAPABILITY_REGISTRY,
  PLAN_CAPABILITY_MATRIX,
} from './capability-registry';

/**
 * Real-PostgreSQL integration net for ENT-01 of issue #984.
 *
 * Why a DB spec and not only the unit spec: the RLS isolation contract is a
 * fact about STORED ROWS and SESSION STATE, not about mock calls — only the
 * real database can prove that a session bound to tenant A cannot read,
 * insert, update or delete tenant B's entitlement rows on the three tenant
 * tables, and that the migration is re-runnable against a ledger that
 * already holds its own output (the repository's partial-ledger contract).
 *
 * Admin (superuser) connections provision the schema, seed and inspect the
 * policy catalog. Every isolation assertion runs through a dedicated
 * NOSUPERUSER NOBYPASSRLS NOLOGIN role via SET ROLE — a superuser bypasses
 * RLS entirely and would prove nothing.
 */

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for DB-backed migration tests`);
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

const ENTITLEMENT_TABLES = [
  'tenant_subscription',
  'tenant_entitlement_override',
  'tenant_entitlement_change_history',
] as const;

/** Expected seed row for one (plan, capability), derived from catalog §4. */
function expectedSeedValue(
  planCode: string,
  capabilityKey: string,
): Record<string, unknown> {
  const plan = PLAN_CAPABILITY_MATRIX.find((p) => p.planCode === planCode);
  if (!plan) throw new Error(`no matrix row for plan ${planCode}`);
  if (plan.includedLimits[capabilityKey] !== undefined) {
    return { included: plan.includedLimits[capabilityKey] };
  }
  if (plan.includedFlags[capabilityKey] !== undefined) {
    return { included: plan.includedFlags[capabilityKey] };
  }
  // Nucleus is always included; the unlimited POS-user quota is null.
  return { included: capabilityKey === 'core.pos_users' ? null : true };
}

interface TenantTableCase {
  table: string;
  /** One row owned by the given tenant. */
  insertRowFor(tenantId: string): string;
  /** Moves tenant A's rows under tenant B (a cross-tenant UPDATE). */
  updateToForeignTenant(tenantA: string, tenantB: string): string;
  /** Deletes every row owned by tenant B. */
  deleteForeignRows(tenantB: string): string;
  /** Every row owned by tenant B. */
  selectForeignRows(tenantB: string): string;
  /** Count of rows owned by tenant A. */
  selectOwnCount(tenantA: string): string;
}

const TENANT_TABLE_CASES: readonly TenantTableCase[] = [
  {
    table: 'tenant_subscription',
    insertRowFor: (tenantId) =>
      `INSERT INTO tenant_subscription (tenant_id, plan_code, status, starts_at)
       VALUES ('${tenantId}', 'PRO', 'active', now())`,
    updateToForeignTenant: (tenantA, tenantB) =>
      `UPDATE tenant_subscription SET tenant_id = '${tenantB}'
       WHERE tenant_id = '${tenantA}'`,
    deleteForeignRows: (tenantB) =>
      `DELETE FROM tenant_subscription WHERE tenant_id = '${tenantB}'`,
    selectForeignRows: (tenantB) =>
      `SELECT id FROM tenant_subscription WHERE tenant_id = '${tenantB}'`,
    selectOwnCount: (tenantA) =>
      `SELECT count(*)::int AS n FROM tenant_subscription WHERE tenant_id = '${tenantA}'`,
  },
  {
    table: 'tenant_entitlement_override',
    insertRowFor: (tenantId) =>
      `INSERT INTO tenant_entitlement_override
         (tenant_id, capability_key, value_json, actor, reason, expires_at)
       VALUES ('${tenantId}', 'inventory.retail', '{"included": true}'::jsonb,
               'ops', 'soho legacy', now() + interval '30 days')`,
    updateToForeignTenant: (tenantA, tenantB) =>
      `UPDATE tenant_entitlement_override SET tenant_id = '${tenantB}'
       WHERE tenant_id = '${tenantA}'`,
    deleteForeignRows: (tenantB) =>
      `DELETE FROM tenant_entitlement_override WHERE tenant_id = '${tenantB}'`,
    selectForeignRows: (tenantB) =>
      `SELECT id FROM tenant_entitlement_override WHERE tenant_id = '${tenantB}'`,
    selectOwnCount: (tenantA) =>
      `SELECT count(*)::int AS n FROM tenant_entitlement_override WHERE tenant_id = '${tenantA}'`,
  },
  {
    table: 'tenant_entitlement_change_history',
    insertRowFor: (tenantId) =>
      `INSERT INTO tenant_entitlement_change_history
         (tenant_id, change_type, subscription_id, previous_value_json,
          new_value_json, actor, reason)
       VALUES ('${tenantId}', 'plan', gen_random_uuid(),
               '{"plan_code": "ESENCIAL"}'::jsonb,
               '{"plan_code": "OPERACION"}'::jsonb, 'ops', 'upgrade')`,
    updateToForeignTenant: (tenantA, tenantB) =>
      `UPDATE tenant_entitlement_change_history SET tenant_id = '${tenantB}'
       WHERE tenant_id = '${tenantA}'`,
    deleteForeignRows: (tenantB) =>
      `DELETE FROM tenant_entitlement_change_history WHERE tenant_id = '${tenantB}'`,
    selectForeignRows: (tenantB) =>
      `SELECT id FROM tenant_entitlement_change_history WHERE tenant_id = '${tenantB}'`,
    selectOwnCount: (tenantA) =>
      `SELECT count(*)::int AS n FROM tenant_entitlement_change_history WHERE tenant_id = '${tenantA}'`,
  },
] as const;

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
    // Roles are cluster-wide objects and MUST NOT leak across runs.
    const restrictedRole = grantedRolesBySchema.get(schema);
    if (restrictedRole) {
      try {
        await queryRunner.query(`DROP ROLE IF EXISTS "${restrictedRole}"`);
        grantedRolesBySchema.delete(schema);
      } catch {
        // no-op: best effort
      }
    }
    try {
      await queryRunner.release();
    } catch {
      // no-op: query runner may not be connected on bootstrap errors
    }
    if (isInitialized) {
      await dataSource.destroy();
    }
  }
}

/**
 * Roles granted on the isolated schema, keyed by schema, so the finally
 * block can DROP them. Roles are cluster-wide objects and MUST NOT leak.
 */
const grantedRolesBySchema = new Map<string, string>();

/**
 * Provisions a NOLOGIN, NOSUPERUSER, NOBYPASSRLS role with ordinary table
 * privileges on the isolated schema — the exact shape an application role
 * has, so the RLS policies are judged against a role that cannot bypass
 * them. The role is registered for cleanup.
 */
async function provisionRestrictedRole(
  queryRunner: QueryRunner,
  schema: string,
): Promise<string> {
  const role = `ent_rls_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
  await queryRunner.query(
    `CREATE ROLE "${role}" NOLOGIN NOSUPERUSER NOBYPASSRLS`,
  );
  await queryRunner.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}"`);
  await queryRunner.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "${schema}" TO "${role}"`,
  );
  grantedRolesBySchema.set(schema, role);
  return role;
}

/** Builds tenants + the ENT-01 migration output in the isolated schema. */
async function buildEntitlementsSchema(
  queryRunner: QueryRunner,
): Promise<void> {
  // The bootstrap migrations guard their enum creation against `public` BY
  // NAME; the shim copies the same local-dev gap handling used by the other
  // migration db specs (CI's empty public creates it itself).
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

/** Binds the session to one tenant and one restricted role. */
async function bindSession(
  queryRunner: QueryRunner,
  role: string,
  tenantId: string | null,
): Promise<void> {
  await queryRunner.query(`RESET ROLE`);
  if (tenantId === null) {
    // UNBOUND means the GUC was NEVER set in this session:
    // current_setting('app.tenant_id', true) resolves to NULL and the policy
    // predicate denies every row. RESET is deliberately NOT used — resetting
    // a custom GUC gives it the empty-string default, whose uuid cast ERRORS
    // ("invalid input syntax for type uuid") instead of cleanly denying.
    // Callers must therefore assert unbound state BEFORE any bind. Every test
    // here does (the unbound block runs first).
    //
    // The restricted role is still SET ROLE'd: a superuser BYPASSES RLS
    // entirely and would see every row, proving nothing.
    await queryRunner.query(`SET ROLE "${role}"`);
    return;
  }
  await queryRunner.query(`SET app.tenant_id = '${tenantId}'`);
  await queryRunner.query(`SET ROLE "${role}"`);
}

describe('CreateEntitlementsTables1810400000000 (db, ENT-01 #984)', () => {
  const TEST_TIMEOUT_MS = 60000;

  it(
    'seeds plan_capability exactly as catalog §4 for the three plans',
    async () => {
      await withIsolatedSchema('ent_seed', async (queryRunner) => {
        await buildEntitlementsSchema(queryRunner);

        const rows: Array<{
          plan_code: string;
          capability_key: string;
          value_json: Record<string, unknown>;
        }> = await queryRunner.query(
          `SELECT plan_code, capability_key, value_json FROM plan_capability`,
        );

        const expected: Array<{
          plan_code: string;
          capability_key: string;
          value_json: Record<string, unknown>;
        }> = [];
        for (const plan of PLAN_CAPABILITY_MATRIX) {
          for (const capability of CAPABILITY_REGISTRY) {
            expected.push({
              plan_code: plan.planCode,
              capability_key: capability.key,
              value_json: expectedSeedValue(plan.planCode, capability.key),
            });
          }
        }

        // One row per (plan, key): no implicit defaults, no missing keys.
        expect(rows).toHaveLength(expected.length);
        const rowKey = (row: { plan_code: string; capability_key: string }) =>
          `${row.plan_code}|${row.capability_key}`;
        const rowsByExactKey = new Map(rows.map((row) => [rowKey(row), row]));
        expect(rowsByExactKey.size).toBe(expected.length);
        for (const wanted of expected) {
          const found = rowsByExactKey.get(rowKey(wanted));
          expect(found).toBeDefined();
          expect(found?.value_json).toEqual(wanted.value_json);
        }

        // Spot-check the limit rows against §4 verbatim.
        expect(rowsByExactKey.get('PRO|limits.terminals')?.value_json).toEqual({
          included: 2,
        });
        expect(
          rowsByExactKey.get('ESENCIAL|limits.owner_accounts')?.value_json,
        ).toEqual({ included: 2 });
        // The unlimited nucleus quota is null (= ilimitado), never a number.
        expect(
          rowsByExactKey.get('OPERACION|core.pos_users')?.value_json,
        ).toEqual({ included: null });
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'is re-runnable: up() twice keeps twelve policies and the seed stable',
    async () => {
      await withIsolatedSchema('ent_rerun', async (queryRunner) => {
        await buildEntitlementsSchema(queryRunner);

        // The partial-ledger contract: re-running the migration must not
        // throw, must not duplicate policies, and must not reseed changed
        // rows on top of the existing ledger.
        await new CreateEntitlementsTables1810400000000().up(queryRunner);

        const policies: Array<{ table: string; n: number }> =
          await queryRunner.query(
            `SELECT tablename AS table, count(*)::int AS n
               FROM pg_policies
              WHERE schemaname = current_schema()
                AND tablename IN ('tenant_subscription',
                                  'tenant_entitlement_override',
                                  'tenant_entitlement_change_history')
              GROUP BY tablename`,
          );
        expect(policies).toHaveLength(3);
        for (const row of policies) {
          expect(row.n).toBe(4);
        }

        const seeded: Array<{ n: number }> = await queryRunner.query(
          `SELECT count(*)::int AS n FROM plan_capability`,
        );
        expect(seeded[0].n).toBe(
          PLAN_CAPABILITY_MATRIX.length * CAPABILITY_REGISTRY.length,
        );

        // ENABLE + FORCE on every tenant table, re-asserted after re-run.
        const forced: Array<{
          rel: string;
          relrowsecurity: boolean;
          relforcerowsecurity: boolean;
        }> = await queryRunner.query(
          `SELECT relname AS rel, relrowsecurity, relforcerowsecurity
               FROM pg_class
               JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
              WHERE nspname = current_schema()
                AND relname IN ('tenant_subscription',
                                'tenant_entitlement_override',
                                'tenant_entitlement_change_history')`,
        );
        expect(forced).toHaveLength(3);
        for (const row of forced) {
          expect(row.relrowsecurity).toBe(true);
          expect(row.relforcerowsecurity).toBe(true);
        }
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'down() reverses only this migration (tables and policies removed)',
    async () => {
      await withIsolatedSchema('ent_down', async (queryRunner) => {
        await buildEntitlementsSchema(queryRunner);
        await new CreateEntitlementsTables1810400000000().down(queryRunner);

        for (const table of ['plan_capability', ...ENTITLEMENT_TABLES]) {
          const existing: Array<{ regclass: string | null }> =
            await queryRunner.query(
              `SELECT to_regclass(current_schema() || '.' || $1)::text AS regclass`,
              [table],
            );
          expect(existing[0].regclass).toBeNull();
        }

        const policies: Array<{ n: number }> = await queryRunner.query(
          `SELECT count(*)::int AS n FROM pg_policies
            WHERE schemaname = current_schema()
              AND tablename IN ('tenant_subscription',
                                'tenant_entitlement_override',
                                'tenant_entitlement_change_history')`,
        );
        expect(policies[0].n).toBe(0);

        // Re-running up() after down() restores the full state.
        await new CreateEntitlementsTables1810400000000().up(queryRunner);
        const reseeded: Array<{ n: number }> = await queryRunner.query(
          `SELECT count(*)::int AS n FROM plan_capability`,
        );
        expect(reseeded[0].n).toBe(
          PLAN_CAPABILITY_MATRIX.length * CAPABILITY_REGISTRY.length,
        );
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'keeps plan_capability global: readable by a restricted role with no tenant binding',
    async () => {
      await withIsolatedSchema('ent_global', async (queryRunner, schema) => {
        await buildEntitlementsSchema(queryRunner);
        const role = await provisionRestrictedRole(queryRunner, schema);

        await bindSession(queryRunner, role, null);
        const rows: Array<{ n: number }> = await queryRunner.query(
          `SELECT count(*)::int AS n FROM plan_capability`,
        );
        expect(rows[0].n).toBe(
          PLAN_CAPABILITY_MATRIX.length * CAPABILITY_REGISTRY.length,
        );
      });
    },
    TEST_TIMEOUT_MS,
  );

  for (const tableCase of TENANT_TABLE_CASES) {
    it(
      `denies cross-tenant read, insert, update and delete on ${tableCase.table}`,
      async () => {
        await withIsolatedSchema('ent_rls', async (queryRunner, schema) => {
          await buildEntitlementsSchema(queryRunner);
          const role = await provisionRestrictedRole(queryRunner, schema);
          const tenantA = await seedTenant(queryRunner, 'A');
          const tenantB = await seedTenant(queryRunner, 'B');

          // Two rows for A, one for B, written by the admin provisioning
          // connection (a superuser bypasses RLS, which is fine for setup).
          await queryRunner.query(tableCase.insertRowFor(tenantA));
          await queryRunner.query(tableCase.insertRowFor(tenantA));
          await queryRunner.query(tableCase.insertRowFor(tenantB));

          // Unbound session: no rows visible, no rows writable.
          await bindSession(queryRunner, role, null);
          const unbound: Array<{ n: number }> = await queryRunner.query(
            tableCase.selectOwnCount(tenantA),
          );
          expect(unbound[0].n).toBe(0);
          await expect(
            queryRunner.query(tableCase.insertRowFor(tenantA)),
          ).rejects.toMatchObject({ code: '42501' });

          // Bound to tenant A: own rows visible, own insert allowed.
          await bindSession(queryRunner, role, tenantA);
          const bound: Array<{ n: number }> = await queryRunner.query(
            tableCase.selectOwnCount(tenantA),
          );
          expect(bound[0].n).toBe(2);
          await queryRunner.query(tableCase.insertRowFor(tenantA));
          const afterOwnInsert: Array<{ n: number }> = await queryRunner.query(
            tableCase.selectOwnCount(tenantA),
          );
          expect(afterOwnInsert[0].n).toBe(3);

          // Cross-tenant SELECT: tenant B's row is invisible.
          const foreign: unknown[] = await queryRunner.query(
            tableCase.selectForeignRows(tenantB),
          );
          expect(foreign).toHaveLength(0);

          // Cross-tenant INSERT: rejected by the WITH CHECK half.
          await expect(
            queryRunner.query(tableCase.insertRowFor(tenantB)),
          ).rejects.toMatchObject({ code: '42501' });

          // Cross-tenant UPDATE (re-labelling own rows as tenant B's):
          // rejected by USING/WITH CHECK.
          await expect(
            queryRunner.query(
              tableCase.updateToForeignTenant(tenantA, tenantB),
            ),
          ).rejects.toMatchObject({ code: '42501' });

          // Cross-tenant DELETE: touches nothing, and B's stored row is
          // unchanged — a rejected input never mutates the other tenant.
          await queryRunner.query(tableCase.deleteForeignRows(tenantB));

          await queryRunner.query(`RESET ROLE`);
          const foreignAfter: Array<{ n: number }> = await queryRunner.query(
            `SELECT count(*)::int AS n FROM ${tableCase.table} WHERE tenant_id = '${tenantB}'`,
          );
          expect(foreignAfter[0].n).toBe(1);
          const ownAfter: Array<{ n: number }> = await queryRunner.query(
            tableCase.selectOwnCount(tenantA),
          );
          expect(ownAfter[0].n).toBe(3);
        });
      },
      TEST_TIMEOUT_MS,
    );
  }
  it(
    'seeds catalog v1.1 convenio rows idempotently and reverses only them',
    async () => {
      await withIsolatedSchema('ent_convenio', async (queryRunner) => {
        await buildEntitlementsSchema(queryRunner);

        const countCapabilities = async (): Promise<number> => {
          const rows: Array<{ n: number }> = await queryRunner.query(
            `SELECT count(*)::int AS n FROM plan_capability`,
          );
          return rows[0].n;
        };

        // 1810400000000 seeds whatever the current registry declares, so a
        // fresh database already carries the convenio rows.
        const seeded = await countCapabilities();
        expect(seeded).toBe(
          PLAN_CAPABILITY_MATRIX.length * CAPABILITY_REGISTRY.length,
        );

        await new SeedConvenioCapability1810500000000().up(queryRunner);
        expect(await countCapabilities()).toBe(seeded);

        await new SeedConvenioCapability1810500000000().down(queryRunner);
        expect(await countCapabilities()).toBe(
          seeded - PLAN_CAPABILITY_MATRIX.length,
        );

        await new SeedConvenioCapability1810500000000().up(queryRunner);
        expect(await countCapabilities()).toBe(seeded);

        const rows: Array<{ plan_code: string; value_json: unknown }> =
          await queryRunner.query(
            `SELECT plan_code, value_json FROM plan_capability
              WHERE capability_key = 'promotions.convenio'`,
          );
        expect(rows).toHaveLength(PLAN_CAPABILITY_MATRIX.length);
        for (const row of rows) {
          expect(row.value_json).toEqual({ included: row.plan_code === 'PRO' });
        }
      });
    },
    TEST_TIMEOUT_MS,
  );
});
