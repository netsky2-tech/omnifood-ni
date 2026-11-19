import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { CreateBootstrapIdentityTables1759000000001 } from '../../migrations/1759000000001-CreateBootstrapIdentityTables';
import { CreateEntitlementsTables1810400000000 } from '../../migrations/1810400000000-CreateEntitlementsTables';
import { HardenEntitlementChangeHistory1810600000000 } from '../../migrations/1810600000000-HardenEntitlementChangeHistory';

/**
 * Real-PostgreSQL proof that the entitlement audit trail is append-only **in
 * the database**, not only by procedure (issue #984, ENT-06 debt).
 *
 * Why this spec exists: the runbook claimed the trail was read-only "by
 * database policy", and a review showed that was false — the ENT-01 migration
 * creates INSERT/UPDATE/DELETE policies for the application role. A trail that
 * can be rewritten is worthless for a commercial exception that ends in a DGI
 * audit, so the migration now rejects mutation at the storage level and this
 * spec proves it: an UPDATE, a DELETE and a TRUNCATE all fail, while INSERT
 * keeps working.
 *
 * Mutation attempts run under a NOSUPERUSER NOBYPASSRLS role, because a
 * superuser session would prove nothing about what the application can do.
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
  // Running the hardening twice proves the migration is idempotent.
  await new HardenEntitlementChangeHistory1810600000000().up(queryRunner);
  await new HardenEntitlementChangeHistory1810600000000().up(queryRunner);
}

async function seedHistoryRow(
  queryRunner: QueryRunner,
  label: string,
): Promise<string> {
  const tenantId = randomUUID();
  await queryRunner.query(`INSERT INTO tenants (id, name) VALUES ($1, $2)`, [
    tenantId,
    `Immutable ${label} ${tenantId.slice(0, 8)}`,
  ]);
  // The history row carries a check constraint: an `override` entry must point
  // at the override it records, so the fixture creates the real row first.
  const override = (await queryRunner.query(
    `INSERT INTO tenant_entitlement_override
       (tenant_id, capability_key, value_json, actor, reason, expires_at)
     VALUES ($1, 'inventory.retail', '{"included": true}'::jsonb,
             'soporte@nhilos.com', 'Piloto autorizado', '2026-12-18T15:00:00.000Z')
     RETURNING id`,
    [tenantId],
  )) as Array<{ id: string }>;
  await queryRunner.query(
    `INSERT INTO tenant_entitlement_change_history
       (tenant_id, change_type, override_id, capability_key, previous_value_json,
        new_value_json, actor, reason, occurred_at)
     VALUES ($1, 'override', $2, 'inventory.retail', NULL, '{"included": true}'::jsonb,
             'soporte@nhilos.com', 'Piloto autorizado', '2026-11-18T15:00:00.000Z')`,
    [tenantId, override[0].id],
  );
  return tenantId;
}

async function provisionRestrictedRole(
  queryRunner: QueryRunner,
  schema: string,
): Promise<string> {
  const role = `ent_aud_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
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

const historyRows = async (queryRunner: QueryRunner): Promise<number> => {
  const rows = (await queryRunner.query(
    `SELECT count(*)::int AS total FROM tenant_entitlement_change_history`,
  )) as Array<{ total: number }>;
  return rows[0].total;
};

describe('entitlement change history immutability (db, #984)', () => {
  const TEST_TIMEOUT_MS = 60000;

  it(
    'rechaza actualizar una fila del rastro y la deja intacta',
    async () => {
      await withIsolatedSchema(
        'ent_aud_update',
        async (queryRunner, schema) => {
          await buildSchema(queryRunner);
          const tenantId = await seedHistoryRow(queryRunner, 'update');
          const role = await provisionRestrictedRole(queryRunner, schema);
          await queryRunner.query(`SET ROLE "${role}"`);
          // Without the tenant binding RLS would hide the row and the UPDATE
          // would silently affect zero rows, proving nothing about the trigger.
          await queryRunner.query(
            `SELECT set_config('app.tenant_id', $1, false)`,
            [tenantId],
          );

          await expect(
            queryRunner.query(
              `UPDATE tenant_entitlement_change_history SET reason = 'reescrito'`,
            ),
          ).rejects.toThrow();

          await queryRunner.query('RESET ROLE');
          const rows = (await queryRunner.query(
            `SELECT reason FROM tenant_entitlement_change_history`,
          )) as Array<{ reason: string }>;
          expect(rows[0].reason).toBe('Piloto autorizado');
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'rechaza borrar una fila del rastro',
    async () => {
      await withIsolatedSchema(
        'ent_aud_delete',
        async (queryRunner, schema) => {
          await buildSchema(queryRunner);
          const tenantId = await seedHistoryRow(queryRunner, 'delete');
          const role = await provisionRestrictedRole(queryRunner, schema);
          await queryRunner.query(`SET ROLE "${role}"`);
          await queryRunner.query(
            `SELECT set_config('app.tenant_id', $1, false)`,
            [tenantId],
          );

          await expect(
            queryRunner.query(`DELETE FROM tenant_entitlement_change_history`),
          ).rejects.toThrow();

          await queryRunner.query('RESET ROLE');
          expect(await historyRows(queryRunner)).toBe(1);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'rechaza vaciar la tabla: un TRUNCATE tampoco es una salida',
    async () => {
      await withIsolatedSchema('ent_aud_truncate', async (queryRunner) => {
        await buildSchema(queryRunner);
        await seedHistoryRow(queryRunner, 'truncate');

        await expect(
          queryRunner.query(`TRUNCATE tenant_entitlement_change_history`),
        ).rejects.toThrow();

        expect(await historyRows(queryRunner)).toBe(1);
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'sigue aceptando altas: el rastro es append-only, no de solo lectura',
    async () => {
      await withIsolatedSchema(
        'ent_aud_insert',
        async (queryRunner, schema) => {
          await buildSchema(queryRunner);
          const tenantId = await seedHistoryRow(queryRunner, 'insert');
          const role = await provisionRestrictedRole(queryRunner, schema);
          await queryRunner.query(`SET ROLE "${role}"`);
          await queryRunner.query(
            `SELECT set_config('app.tenant_id', $1, false)`,
            [tenantId],
          );

          const override = (await queryRunner.query(
            `SELECT id FROM tenant_entitlement_override WHERE tenant_id = $1`,
            [tenantId],
          )) as Array<{ id: string }>;

          await queryRunner.query(
            `INSERT INTO tenant_entitlement_change_history
             (tenant_id, change_type, override_id, capability_key, previous_value_json,
              new_value_json, actor, reason, occurred_at)
           VALUES ($1, 'override', $2, 'inventory.retail',
                   '{"included": true}'::jsonb, '{"revoked": true}'::jsonb,
                   'soporte@nhilos.com', 'Fin del piloto',
                   '2026-11-25T15:00:00.000Z')`,
            [tenantId, override[0].id],
          );

          await queryRunner.query('RESET ROLE');
          expect(await historyRows(queryRunner)).toBe(2);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );
});
