import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { OhacTenantTransaction } from '../rls/ohac-tenant-transaction';
import { StaffPolicySnapshotPublisher } from '../services/staff-policy-snapshot-publisher.service';
import { CreateHumanAuthorizationObservability1809020000000 } from '../../../../migrations/1809020000000-CreateHumanAuthorizationObservability';
import { AddHumanAuthorizationAttemptResetGeneration1809030000000 } from '../../../../migrations/1809030000000-AddHumanAuthorizationAttemptResetGeneration';
import { CreateHumanAuthorizationTenantPublicationState1809040000000 } from '../../../../migrations/1809040000000-CreateHumanAuthorizationTenantPublicationState';
import { CreateHumanAuthorizationPolicySnapshots1809050000000 } from '../../../../migrations/1809050000000-CreateHumanAuthorizationPolicySnapshots';

/**
 * Test-only real-database fixture for the OHAC publication stack db specs.
 *
 * Deliberate decisions (mirror scripts/verify-schema-build.sh where possible):
 * - A fresh per-run scratch SCHEMA (not a hand-built table set) inside the
 *   database the runner provides via DB_DATABASE; cleanup drops the schema
 *   and the role. Random suffixes make concurrent runs safe.
 * - The real migrations 180902/180903/180904/180905 run via their up().
 *   180902 is required because the publisher's source reader resolves the
 *   tenant cohort decision against human_auth_rollout_cohorts, and its
 *   verification_events table FKs users(id). 180903 alters users, so the
 *   minimal users/security_profiles fixture tables are created first —
 *   deliberately minimal: only the columns the migrations and the publisher's
 *   source reader touch, never a hand-built version of the migration's DDL.
 * - All RLS assertions run through a dedicated per-run NOSUPERUSER NOBYPASSRLS
 *   role. `ALTER ROLE ... SET search_path TO "<schema>", public` is set
 *   because raw SQL in the production paths ignores TypeORM's schema option;
 *   the restricted DataSource relies on that role-level setting, exactly like
 *   production.
 * - Provisioning is failure-proof: it first drops any stale roles/schemas
 *   from earlier runs that share the `ohac_p4_` prefix, and if provisioning
 *   itself throws partway, a best-effort self-cleanup removes this run's own
 *   schema and role before the error propagates — a failed run leaves no
 *   `ohac_p4_*` objects behind instead of accumulating them for later runs.
 * - The admin (superuser) connection is used only for provisioning, seeding,
 *   and pg_policies inspection; superuser bypasses the FORCED row-level
 *   security, which is what makes cross-tenant seeding possible.
 */
export interface OhacPublicationFixture {
  readonly schema: string;
  readonly admin: DataSource;
  readonly restricted: DataSource;
  readonly transaction: OhacTenantTransaction;
  readonly publisher: StaffPolicySnapshotPublisher;
  seedTenantStaff(
    tenantId: string,
    staff: ReadonlyArray<{
      readonly role: string;
      readonly isActive: boolean;
      readonly pinHash: string | null;
      readonly customPermissions: readonly string[];
    }>,
  ): Promise<void>;
  seedCohort(tenantId: string, backendBuild: string): Promise<void>;
  seedSnapshot(
    tenantId: string,
    sequence: number,
    digest: string,
  ): Promise<void>;
  seedMarker(tenantId: string, revision: number): Promise<void>;
  close(): Promise<void>;
}

const postgresConnection = {
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? '5432'),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_DATABASE ?? 'omnifood',
};

export async function createOhacPublicationFixture(): Promise<OhacPublicationFixture> {
  const suffix = randomUUID().replace(/-/g, '');
  const schema = `ohac_p4_${suffix}`;
  const roleName = `ohac_p4_rls_${suffix}`;
  const rolePassword = randomUUID();

  // The startup-parameter search_path makes every admin connection —
  // including pooled ones — resolve the migrations' unqualified SQL into the
  // scratch schema.
  const admin = new DataSource({
    type: 'postgres',
    ...postgresConnection,
    extra: { max: 2, options: `-c search_path=${schema},public` },
  });
  const restricted = new DataSource({
    type: 'postgres',
    ...postgresConnection,
    username: roleName,
    password: rolePassword,
    extra: { max: 4 },
  });

  const uniqueDigest = (salt: number) =>
    `sha256:${String(salt).padStart(2, '0')}${'a'.repeat(62)}`;

  // Grants are schema-qualified on purpose: they must never depend on the
  // granting connection's search_path resolving to a same-named table
  // elsewhere. DELETE is granted deliberately (see the RLS spec): with the
  // grant present, a refused delete can only come from RLS default-deny or
  // the append-only trigger, never from a missing ACL entry.

  const fixture: OhacPublicationFixture = {
    schema,
    admin,
    restricted,
    transaction: new OhacTenantTransaction(restricted),
    publisher: new StaffPolicySnapshotPublisher(
      new OhacTenantTransaction(restricted),
    ),

    seedTenantStaff: async (tenantId, staff) => {
      for (const member of staff) {
        const userId = randomUUID();
        await admin.query(
          `INSERT INTO users (id, tenant_id, email, role, is_active)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            userId,
            tenantId,
            `${userId}@p4-fixture.test`,
            member.role,
            member.isActive,
          ],
        );
        await admin.query(
          `INSERT INTO security_profiles (user_id, pin_hash, custom_permissions)
           VALUES ($1, $2, $3)`,
          [userId, member.pinHash, [...member.customPermissions]],
        );
      }
    },

    seedCohort: async (tenantId, backendBuild) => {
      await admin.query(
        `INSERT INTO human_auth_rollout_cohorts
           (tenant_id, pos_build, backend_build, policy_schema, assertion_schema,
            enabled, owner_acceptance_actor_id, owner_acceptance_ref, owner_acceptance_at)
         VALUES ($1, 'pos-p4-test', $2, 'ohac.staff-policy-snapshot.v1',
                 'ohac.minimum-assertion.v1', TRUE, $3, 'p4-acceptance', CURRENT_TIMESTAMP)`,
        [tenantId, backendBuild, randomUUID()],
      );
    },

    seedSnapshot: async (tenantId, sequence, digest) => {
      await admin.query(
        `INSERT INTO human_auth_policy_snapshots
           (tenant_id, sequence, previous_sequence, schema, previous_digest,
            publisher_backend_build, minimum_assertion_schema, cohort_decision,
            digest, payload)
         VALUES ($1, $2, $3, 'ohac.staff-policy-snapshot.v1', $4, 'p4-test', 'p4-test',
                 'ELIGIBLE', $5, '{}'::jsonb)`,
        [
          tenantId,
          sequence,
          Math.max(0, sequence - 1),
          sequence === 1 ? 'GENESIS' : uniqueDigest(sequence),
          digest,
        ],
      );
    },

    seedMarker: async (tenantId, revision) => {
      await admin.query(
        `INSERT INTO human_auth_tenant_publication_state (tenant_id, dirty, revision)
         VALUES ($1, TRUE, $2)`,
        [tenantId, revision],
      );
    },

    close: async () => {
      // Restricted sessions must be gone before the schema/role drop; the
      // admin connection stays open to perform the cleanup itself. Each step
      // runs even when an earlier one failed, so a failing test never leaks.
      let firstError: unknown = undefined;
      try {
        await restricted.destroy();
      } catch (error) {
        firstError ??= error;
      }
      try {
        await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } catch (error) {
        firstError ??= error;
      }
      try {
        await admin.query(`DROP ROLE IF EXISTS "${roleName}"`);
      } catch (error) {
        firstError ??= error;
      }
      try {
        await admin.destroy();
      } catch (error) {
        firstError ??= error;
      }
      if (firstError !== undefined) throw firstError;
    },
  };

  await admin.initialize();

  try {
    // Stale-run cleanup (Fix 5): earlier runs could leak their role/schema
    // when provisioning failed partway, so drop every `ohac_p4_*` schema and
    // role still present in the database before provisioning this run's own.
    // Underscores in the prefix are escaped so the pattern matches literally;
    // backends are terminated first so DROP ROLE cannot fail on live sessions.
    await admin.query(`
      DO $stale_cleanup$
      DECLARE
        stale record;
      BEGIN
        PERFORM pg_terminate_backend(pid)
          FROM pg_stat_activity
         WHERE usename LIKE 'ohac\\_p4\\_%' ESCAPE '\\'
           AND pid <> pg_backend_pid();
        FOR stale IN
          SELECT nspname AS name FROM pg_namespace
           WHERE nspname LIKE 'ohac\\_p4\\_%' ESCAPE '\\'
        LOOP
          EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', stale.name);
        END LOOP;
        FOR stale IN
          SELECT rolname AS name FROM pg_roles
           WHERE rolname LIKE 'ohac\\_p4\\_%' ESCAPE '\\'
             AND rolname <> current_user
        LOOP
          EXECUTE format('DROP ROLE %I', stale.name);
        END LOOP;
      END
      $stale_cleanup$;
    `);

    await admin.query(`CREATE SCHEMA "${schema}"`);

    // Minimal fixture base tables, deliberately: 180902 FKs users(id) and
    // 180903 alters users, so both must predate the migration run. Columns the
    // migrations or the publisher's source reader do not touch are omitted on
    // purpose — the migrations themselves own their DDL.
    await admin.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'users_role_enum' AND n.nspname = current_schema()
      ) THEN
        CREATE TYPE users_role_enum AS ENUM ('OWNER', 'MANAGER', 'CASHIER', 'WAITER');
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY,
      tenant_id uuid NOT NULL,
      email varchar(255) NOT NULL,
      role users_role_enum NOT NULL,
      is_active boolean NOT NULL DEFAULT true
    );

    CREATE TABLE IF NOT EXISTS security_profiles (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL UNIQUE REFERENCES users(id),
      pin_hash varchar NULL,
      custom_permissions text[] NOT NULL DEFAULT '{}'
    );
  `);

    const migrationRunner: QueryRunner = admin.createQueryRunner();
    try {
      await migrationRunner.connect();
      await migrationRunner.query(`SET search_path TO "${schema}", public`);
      await new CreateHumanAuthorizationObservability1809020000000().up(
        migrationRunner,
      );
      await new AddHumanAuthorizationAttemptResetGeneration1809030000000().up(
        migrationRunner,
      );
      await new CreateHumanAuthorizationTenantPublicationState1809040000000().up(
        migrationRunner,
      );
      await new CreateHumanAuthorizationPolicySnapshots1809050000000().up(
        migrationRunner,
      );
    } finally {
      await migrationRunner.release();
    }

    // Dedicated restricted role, mirroring scripts/verify-schema-build.sh: the
    // role can never bypass RLS, and its role-level search_path (raw SQL ignores
    // TypeORM's schema option) points at the scratch schema first.
    await admin.query(
      `CREATE ROLE "${roleName}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '${rolePassword}'`,
    );
    await admin.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${roleName}"`);
    await admin.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE
         ON "${schema}".human_auth_policy_snapshots,
            "${schema}".human_auth_tenant_publication_state,
            "${schema}".human_auth_rollout_cohorts
         TO "${roleName}"`,
    );
    await admin.query(
      `GRANT SELECT ON "${schema}".users, "${schema}".security_profiles TO "${roleName}"`,
    );
    await admin.query(
      `ALTER ROLE "${roleName}" SET search_path TO "${schema}", public`,
    );

    await restricted.initialize();
  } catch (error) {
    // Provisioning failed partway: attempt every cleanup step so this run
    // leaks neither its schema nor its role, then propagate the original
    // error (or the aggregate when the cleanup itself also failed).
    const cleanupErrors: unknown[] = [];
    try {
      await restricted.destroy();
    } catch (cleanupError) {
      cleanupErrors.push(cleanupError);
    }
    try {
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } catch (cleanupError) {
      cleanupErrors.push(cleanupError);
    }
    try {
      await admin.query(`DROP ROLE IF EXISTS "${roleName}"`);
    } catch (cleanupError) {
      cleanupErrors.push(cleanupError);
    }
    try {
      await admin.destroy();
    } catch (cleanupError) {
      cleanupErrors.push(cleanupError);
    }
    if (cleanupErrors.length > 0) {
      const wrapped = new AggregateError(
        cleanupErrors,
        'fixture provisioning failed and its best-effort cleanup failed too',
      );
      (wrapped as { cause?: unknown }).cause = error;
      throw wrapped;
    }
    throw error;
  }

  return fixture;
}
