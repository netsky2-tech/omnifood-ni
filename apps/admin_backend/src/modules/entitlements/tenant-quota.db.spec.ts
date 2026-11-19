import { randomUUID } from 'crypto';
import { HttpException, UnauthorizedException } from '@nestjs/common';
import { DataSource, type QueryRunner } from 'typeorm';
import { CreateBootstrapIdentityTables1759000000001 } from '../../migrations/1759000000001-CreateBootstrapIdentityTables';
import { CreateDeviceSyncCredentials1807000000000 } from '../../migrations/1807000000000-CreateDeviceSyncCredentials';
import { CreateEntitlementsTables1810400000000 } from '../../migrations/1810400000000-CreateEntitlementsTables';
import { DeviceSyncCredentialStatus } from '../identity/entities/device-sync-credential.entity';
import { EntitlementsService } from './entitlements.service';
import {
  TENANT_SEAT_ACTIVITY_WINDOW_MS,
  TenantQuotaService,
  terminalQuotaExceededMessage,
} from './tenant-quota.service';

/**
 * Real-PostgreSQL contract net for ENT-03b (issue #984, catalog §6.2).
 *
 * The unit spec proves the decision rules against stubs; this spec proves
 * the COUNTING against STORED rows: a fresh credential occupies a seat, a
 * credential whose last renewal left the 30-day window does not, a revoked
 * or retired credential never does, and — under a NOSUPERUSER NOBYPASSRLS
 * role — two tenants cannot see each other's seats, so the counting is
 * protected by the FORCE RLS policies and not only by the WHERE clause.
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

const serviceOnSession = (runner: QueryRunner): TenantQuotaService =>
  new TenantQuotaService(
    {
      createQueryRunner: () => new SessionQueryRunner(runner),
    } as unknown as DataSource,
    new EntitlementsService({
      createQueryRunner: () => new SessionQueryRunner(runner),
    } as unknown as DataSource),
  );

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
  // The activation attempts table is hand-built here, NOT via
  // CreateActivationCoreTables1800000000000: that migration creates its
  // tables through TypeORM's `createTable(table, ifNotExists)`, whose
  // existence check resolves against the shared dev database's `public`
  // schema (where earlier suites left these tables behind) and silently
  // skips creating them in the scratch schema, then fails on the index. The
  // raw-SQL `IF NOT EXISTS` migrations below respect `search_path`, so only
  // this one dependency is rebuilt by hand with exactly the columns the
  // credential seeding inserts; the quota never reads this table — it only
  // needs to exist for device_sync_credentials' foreign key.
  await queryRunner.query(`
    CREATE TABLE IF NOT EXISTS onboarding_activation_attempts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id varchar(128) NOT NULL,
      onboarding_session_id uuid NOT NULL,
      candidate_terminal_id varchar(128) NOT NULL,
      trusted_terminal_id varchar(128) NULL,
      status varchar(64) NOT NULL DEFAULT 'CREATED',
      started_by_user_id varchar(128) NOT NULL,
      started_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz NULL,
      server_time_anchor_at timestamptz NOT NULL DEFAULT now(),
      required_fiscal_revision int NOT NULL DEFAULT 0,
      required_fiscal_fingerprint varchar(64) NOT NULL DEFAULT 'fp',
      verification_product_id varchar(128) NOT NULL DEFAULT 'prod',
      verification_product_revision int NOT NULL DEFAULT 1,
      verification_product_fingerprint varchar(64) NOT NULL DEFAULT 'fp',
      verification_ticket_id varchar(128) NULL,
      pos_build varchar(128) NULL,
      warnings_count int NOT NULL DEFAULT 0,
      failure_code varchar(128) NULL,
      idempotency_key varchar(256) NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await new CreateDeviceSyncCredentials1807000000000().up(queryRunner);
  await new CreateEntitlementsTables1810400000000().up(queryRunner);
}

async function seedTenant(
  queryRunner: QueryRunner,
  label: string,
): Promise<string> {
  const tenantId = randomUUID();
  await queryRunner.query(`INSERT INTO tenants (id, name) VALUES ($1, $2)`, [
    tenantId,
    `Quota ${label} ${tenantId.slice(0, 8)}`,
  ]);
  return tenantId;
}

/**
 * Seeds one credential with explicit lifecycle columns. `issuedAt` and
 * `rotatedAt` are ISO strings (or null); activity for the seat rule is
 * max(issued_at, rotated_at).
 */
async function seedCredential(
  queryRunner: QueryRunner,
  tenantId: string,
  fields: {
    status?: DeviceSyncCredentialStatus;
    issuedAt?: string;
    rotatedAt?: string | null;
    revokedAt?: string | null;
  } = {},
): Promise<string> {
  const attempt = (
    await queryRunner.query(
      `INSERT INTO onboarding_activation_attempts (
         tenant_id, onboarding_session_id, candidate_terminal_id,
         trusted_terminal_id, status, started_by_user_id,
         server_time_anchor_at, required_fiscal_revision,
         required_fiscal_fingerprint, verification_product_id,
         verification_product_fingerprint
       ) VALUES ($1, $2, $3, $3, 'PASS', 'quota-db-spec', now(), 0, 'fp', 'prod', 'fp')
       RETURNING id`,
      [tenantId, randomUUID(), `DEV-${randomUUID().slice(0, 8)}`],
    )
  )[0];
  const credential = (
    await queryRunner.query(
      `INSERT INTO device_sync_credentials (
         tenant_id, activation_attempt_id, renewal_secret_hash,
         version, status, expires_at, issued_at, rotated_at, revoked_at
       ) VALUES ($1, $2, 'quota-db-spec-hash', 1, $3,
                 $4::timestamptz + interval '1 day', $5::timestamptz,
                 $6::timestamptz, $7::timestamptz)
       RETURNING id`,
      [
        tenantId,
        attempt.id,
        fields.status ?? DeviceSyncCredentialStatus.ACTIVE,
        fields.issuedAt ?? NOW.toISOString(),
        fields.issuedAt ?? NOW.toISOString(),
        fields.rotatedAt ?? null,
        fields.revokedAt ?? null,
      ],
    )
  )[0];
  return credential.id as string;
}

async function seedUser(
  queryRunner: QueryRunner,
  tenantId: string,
  role: 'OWNER' | 'MANAGER' | 'CASHIER',
  isActive: boolean,
): Promise<string> {
  const rows = (await queryRunner.query(
    `INSERT INTO users (tenant_id, name, email, role, is_active)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [
      tenantId,
      `user-${randomUUID().slice(0, 8)}`,
      `quota-spec-${randomUUID()}@omnifood.test`,
      role,
      isActive,
    ],
  )) as Array<{ id: string }>;
  return rows[0].id;
}

async function seedSubscription(
  queryRunner: QueryRunner,
  tenantId: string,
  plan: string,
  addOns: string[] = [],
): Promise<void> {
  await queryRunner.query(
    `INSERT INTO tenant_subscription
       (tenant_id, plan_code, status, starts_at, ends_at, add_ons, support_tier)
     VALUES ($1, $2, 'active', '2026-01-01T00:00:00.000Z', NULL, $3::jsonb, 'standard')`,
    [tenantId, plan, JSON.stringify(addOns)],
  );
}

async function provisionRestrictedRole(
  queryRunner: QueryRunner,
  schema: string,
): Promise<string> {
  const role = `ent_quota_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
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

describe('TenantQuotaService counting (db, ENT-03b #984)', () => {
  const TEST_TIMEOUT_MS = 60000;

  it(
    'cuenta el asiento fresco y excluye vencido por ventana, revocado y retirado',
    async () => {
      await withIsolatedSchema('ent_quota_window', async (queryRunner) => {
        await buildSchema(queryRunner);
        const tenantId = await seedTenant(queryRunner, 'ventana');

        const fresh = new Date(NOW.getTime() - 1000).toISOString();
        // A live POS renews its token: issued long ago, rotated recently.
        const renewed = new Date(NOW.getTime() - 2 * 86400000).toISOString();
        const stale = new Date(
          NOW.getTime() - TENANT_SEAT_ACTIVITY_WINDOW_MS - 86400000,
        ).toISOString();

        await seedCredential(queryRunner, tenantId, { issuedAt: fresh });
        await seedCredential(queryRunner, tenantId, {
          issuedAt: stale,
          rotatedAt: renewed,
        });
        // Stale and never rotated: its seat freed itself.
        await seedCredential(queryRunner, tenantId, { issuedAt: stale });
        // Revoked and retired never count, even when fresh.
        await seedCredential(queryRunner, tenantId, {
          issuedAt: fresh,
          revokedAt: fresh,
        });
        await seedCredential(queryRunner, tenantId, {
          status: DeviceSyncCredentialStatus.RETIRED,
          issuedAt: fresh,
          rotatedAt: fresh,
        });

        const occupied = await serviceOnSession(
          queryRunner,
        ).countOccupiedTerminalSeats(tenantId, NOW);
        expect(occupied).toBe(2);
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'bloquea el enrolamiento al llegar al límite y lo libera tras la baja',
    async () => {
      await withIsolatedSchema('ent_quota_limit', async (queryRunner) => {
        await buildSchema(queryRunner);
        const tenantId = await seedTenant(queryRunner, 'limite');
        await seedSubscription(queryRunner, tenantId, 'ESENCIAL');
        const credentialId = await seedCredential(queryRunner, tenantId, {
          issuedAt: new Date(NOW.getTime() - 1000).toISOString(),
        });

        const service = serviceOnSession(queryRunner);
        await expect(
          service.assertCanEnrollTerminal(tenantId, NOW),
        ).rejects.toThrow(
          new HttpException(terminalQuotaExceededMessage(1), 409),
        );

        // The explicit baja frees the seat immediately (catalog §6.2).
        await queryRunner.query(
          `UPDATE device_sync_credentials
              SET revoked_at = $1, status = 'REVOKED', revocation_reason = 'baja'
            WHERE id = $2`,
          [NOW.toISOString(), credentialId],
        );

        await expect(
          service.assertCanEnrollTerminal(tenantId, NOW),
        ).resolves.toBeUndefined();
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'cuenta solo owners activos y bloquea al llegar al límite',
    async () => {
      await withIsolatedSchema('ent_quota_owners', async (queryRunner) => {
        await buildSchema(queryRunner);
        const tenantId = await seedTenant(queryRunner, 'owners');
        await seedSubscription(queryRunner, tenantId, 'ESENCIAL');

        await seedUser(queryRunner, tenantId, 'OWNER', true);
        await seedUser(queryRunner, tenantId, 'OWNER', true);
        // An inactive owner and a manager are not seats (catalog §6.2).
        await seedUser(queryRunner, tenantId, 'OWNER', false);
        await seedUser(queryRunner, tenantId, 'MANAGER', true);

        const service = serviceOnSession(queryRunner);
        const owners = await service.countActiveOwnerAccounts(tenantId);
        expect(owners).toBe(2);

        await expect(
          service.assertCanAddOwnerAccount(tenantId, 'OWNER'),
        ).rejects.toThrow(HttpException);
        // Any other role never consumes an owner seat.
        await expect(
          service.assertCanAddOwnerAccount(tenantId, 'CASHIER'),
        ).resolves.toBeUndefined();
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'dos tenants no se ven los asientos bajo un rol restringido NOBYPASSRLS',
    async () => {
      await withIsolatedSchema(
        'ent_quota_isolation',
        async (queryRunner, schema) => {
          await buildSchema(queryRunner);
          const tenantA = await seedTenant(queryRunner, 'aislado-a');
          const tenantB = await seedTenant(queryRunner, 'aislado-b');
          await seedSubscription(queryRunner, tenantA, 'PRO');
          await seedSubscription(queryRunner, tenantB, 'ESENCIAL');

          for (let i = 0; i < 2; i += 1) {
            await seedCredential(queryRunner, tenantA, {
              issuedAt: new Date(NOW.getTime() - 1000).toISOString(),
            });
          }
          await seedCredential(queryRunner, tenantB, {
            issuedAt: new Date(NOW.getTime() - 1000).toISOString(),
          });

          await seedUser(queryRunner, tenantA, 'OWNER', true);
          await seedUser(queryRunner, tenantB, 'OWNER', true);
          await seedUser(queryRunner, tenantB, 'OWNER', true);

          const role = await provisionRestrictedRole(queryRunner, schema);
          await queryRunner.query(`SET ROLE "${role}"`);

          const service = serviceOnSession(queryRunner);
          await expect(
            service.countOccupiedTerminalSeats(tenantA, NOW),
          ).resolves.toBe(2);
          await expect(
            service.countOccupiedTerminalSeats(tenantB, NOW),
          ).resolves.toBe(1);
          await expect(service.countActiveOwnerAccounts(tenantA)).resolves.toBe(
            1,
          );
          await expect(service.countActiveOwnerAccounts(tenantB)).resolves.toBe(
            2,
          );
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'rechaza una petición sin contexto de tenant antes de tocar la base',
    async () => {
      await withIsolatedSchema('ent_quota_notenant', async (queryRunner) => {
        await buildSchema(queryRunner);
        await expect(
          serviceOnSession(queryRunner).countOccupiedTerminalSeats('   '),
        ).rejects.toThrow(UnauthorizedException);
      });
    },
    TEST_TIMEOUT_MS,
  );
});
