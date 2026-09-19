import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { OhacTenantTransaction } from '../rls/ohac-tenant-transaction';
import { StaffPolicySnapshotPublisher } from '../services/staff-policy-snapshot-publisher.service';
import { StaffPolicyEpochMaterializationService } from '../services/staff-policy-epoch-materialization.service';
import { StaffPolicyEpochAcknowledgementService } from '../services/staff-policy-epoch-acknowledgement.service';
import { projectStaffPolicySnapshotV1 } from '../projection/staff-policy-snapshot-projector';
import { CreateHumanAuthorizationCore1809000000000 } from '../../../../migrations/1809000000000-CreateHumanAuthorizationCore';
import { CreateHumanAuthorizationRecovery1809010000000 } from '../../../../migrations/1809010000000-CreateHumanAuthorizationRecovery';
import { CreateHumanAuthorizationObservability1809020000000 } from '../../../../migrations/1809020000000-CreateHumanAuthorizationObservability';
import { RebindHumanAuthorizationTenantColumns1809100000000 } from '../../../../migrations/1809100000000-RebindHumanAuthorizationTenantColumns';
import { RebindHumanAuthorizationStateColumns1809110000000 } from '../../../../migrations/1809110000000-RebindHumanAuthorizationStateColumns';
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
 * - The real migrations 180900/180901/180902/180903/180904/180905 run via
 *   their up(),
 *   followed by the two tenant rebinds 180910/180911, so the OHAC tenant
 *   columns here are uuid exactly as they are in production.
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
  readonly materialization: StaffPolicyEpochMaterializationService;
  readonly acknowledgement: StaffPolicyEpochAcknowledgementService;
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
  /**
   * Seeds an enabled cohort for an explicit POS/backend pair. The delivery
   * path gates on the exact pair, so a test that materializes for a specific
   * POS build must enable that pair rather than the fixed one `seedCohort`
   * uses for the publisher's backend-only lookup.
   */
  seedCohortPair(
    tenantId: string,
    posBuild: string,
    backendBuild: string,
  ): Promise<void>;
  seedSnapshot(
    tenantId: string,
    sequence: number,
    digest: string,
  ): Promise<void>;
  /**
   * Seeds staff and a snapshot whose payload is produced by the real
   * projector, so the materialization service's payload validation sees a
   * genuine artifact instead of a placeholder it would reject.
   */
  seedProjectedSnapshot(
    tenantId: string,
    metadata: {
      readonly sequence: number;
      readonly publisherBackendBuild: string;
      /**
       * Replaces the digest inside the payload while the signed `digest`
       * column keeps the projected value, modelling a corrupted row. It has
       * to be done here because the table is append-only: a later UPDATE is
       * refused by the migration's trigger even for a superuser.
       */
      readonly payloadDigestOverride?: string;
    },
    staff: ReadonlyArray<{
      readonly role: string;
      readonly isActive: boolean;
      readonly pinHash: string | null;
      readonly customPermissions: readonly string[];
    }>,
  ): Promise<{ readonly sequence: string; readonly digest: string }>;
  seedMarker(tenantId: string, revision: number): Promise<void>;
  /**
   * Seeds a materialized epoch row directly, which the delivery path itself
   * cannot produce out of order. A test that needs an epoch to exist at a
   * sequence the terminal is not yet owed uses this.
   */
  seedEpoch(
    tenantId: string,
    terminalId: string,
    sequence: number,
    digest: string,
    posBuild: string,
  ): Promise<void>;
  /** Seeds the terminal's accepted head, as an earlier acknowledgement would have. */
  seedAckFloor(
    tenantId: string,
    terminalId: string,
    sequence: number,
    digest: string,
  ): Promise<void>;
  /** Reads the terminal's accepted head, or undefined when it never acknowledged. */
  readFloor(
    tenantId: string,
    terminalId: string,
  ): Promise<
    { readonly sequence: string; readonly digest: string } | undefined
  >;
  /** Reads the stored epoch rows for a terminal, newest last. */
  readEpochs(
    tenantId: string,
    terminalId: string,
  ): Promise<
    ReadonlyArray<{
      readonly sequence: string;
      readonly digest: string;
      readonly targetPosBuild: string;
    }>
  >;
  /** Reads the acknowledgement history for a terminal, oldest first. */
  readAckHistory(
    tenantId: string,
    terminalId: string,
  ): Promise<
    ReadonlyArray<{
      readonly sequence: string;
      readonly status: string;
      readonly resultCode: string | null;
      readonly idempotencyKey: string;
      readonly receiptId: string | null;
    }>
  >;
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
    materialization: new StaffPolicyEpochMaterializationService(
      new OhacTenantTransaction(restricted),
    ),
    acknowledgement: new StaffPolicyEpochAcknowledgementService(
      new OhacTenantTransaction(restricted),
    ),

    seedProjectedSnapshot: async (tenantId, metadata, staff) => {
      await fixture.seedTenantStaff(tenantId, staff);
      const sequence = String(metadata.sequence);
      const projected = projectStaffPolicySnapshotV1(
        {
          tenantId,
          sequence,
          previousSequence: String(metadata.sequence - 1),
          previousDigest:
            metadata.sequence === 1 ? 'GENESIS' : 'sha256:' + '0'.repeat(64),
          publisherBackendBuild: metadata.publisherBackendBuild,
        },
        staff.map((member, index) => ({
          userId: `${tenantId.slice(0, 8)}-0000-4000-8000-${String(index).padStart(12, '0')}`,
          role: member.role,
          isActive: member.isActive,
          pinHash: member.pinHash,
          customPermissions: member.customPermissions
            ? [...member.customPermissions]
            : null,
          attemptResetGeneration: '0',
        })),
      );
      if (projected.ok === false) {
        throw new Error(
          `fixture failed to project a snapshot: ${projected.error.code}`,
        );
      }
      await admin.query(
        `INSERT INTO human_auth_policy_snapshots
           (tenant_id, sequence, previous_sequence, schema, previous_digest,
            publisher_backend_build, minimum_assertion_schema, cohort_decision,
            digest, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          tenantId,
          projected.value.sequence,
          projected.value.previousSequence,
          projected.value.schema,
          projected.value.previousDigest,
          projected.value.publisherBackendBuild,
          projected.value.minimumAssertionSchema,
          'ELIGIBLE',
          projected.value.digest,
          {
            ...projected.value,
            digest: metadata.payloadDigestOverride ?? projected.value.digest,
          },
        ],
      );
      return {
        sequence: projected.value.sequence,
        digest: projected.value.digest,
      };
    },

    seedEpoch: async (tenantId, terminalId, sequence, digest, posBuild) => {
      await admin.query(
        `INSERT INTO human_auth_policy_epochs
           (tenant_id, terminal_id, schema, sequence, previous_sequence,
            previous_digest, publisher_backend_build, target_pos_build,
            minimum_assertion_schema, cohort_decision, digest, payload)
         VALUES ($1, $2, 'ohac.staff-policy-epoch.v1', $3, $4,
                 'GENESIS', 'backend-build-1', $5,
                 'ohac.assertion.v1', 'ELIGIBLE', $6, $7)`,
        [
          tenantId,
          terminalId,
          sequence,
          sequence - 1,
          posBuild,
          digest,
          { schema: 'ohac.staff-policy-epoch.v1', sequence: String(sequence) },
        ],
      );
    },

    seedAckFloor: async (tenantId, terminalId, sequence, digest) => {
      await admin.query(
        `INSERT INTO human_auth_terminal_ack_floor
           (tenant_id, terminal_id, sequence, digest, revision, updated_at)
         VALUES ($1, $2, $3, $4, 1, CURRENT_TIMESTAMP)
         ON CONFLICT (tenant_id, terminal_id) DO UPDATE
           SET sequence = EXCLUDED.sequence,
               digest = EXCLUDED.digest,
               revision = human_auth_terminal_ack_floor.revision + 1,
               updated_at = CURRENT_TIMESTAMP`,
        [tenantId, terminalId, sequence, digest],
      );
    },

    readFloor: async (tenantId, terminalId) => {
      const rows: { sequence: string; digest: string }[] = await admin.query(
        `SELECT sequence, digest
           FROM human_auth_terminal_ack_floor
          WHERE tenant_id = $1 AND terminal_id = $2`,
        [tenantId, terminalId],
      );
      return rows[0];
    },

    readEpochs: async (tenantId, terminalId) => {
      return await admin.query(
        `SELECT sequence,
                digest,
                target_pos_build AS "targetPosBuild"
           FROM human_auth_policy_epochs
          WHERE tenant_id = $1 AND terminal_id = $2
          ORDER BY sequence`,
        [tenantId, terminalId],
      );
    },

    readAckHistory: async (tenantId, terminalId) => {
      return await admin.query(
        `SELECT sequence,
                status,
                result_code AS "resultCode",
                idempotency_key AS "idempotencyKey",
                ack_receipt_id AS "receiptId"
           FROM human_auth_terminal_ack_history
          WHERE tenant_id = $1 AND terminal_id = $2
          ORDER BY received_at, sequence`,
        [tenantId, terminalId],
      );
    },

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

    seedCohortPair: async (tenantId, posBuild, backendBuild) => {
      await admin.query(
        `INSERT INTO human_auth_rollout_cohorts
           (tenant_id, pos_build, backend_build, policy_schema, assertion_schema,
            enabled, owner_acceptance_actor_id, owner_acceptance_ref, owner_acceptance_at)
         VALUES ($1, $2, $3, 'ohac.staff-policy-snapshot.v1',
                 'ohac.assertion.v1', TRUE, $4, 'p4-acceptance', CURRENT_TIMESTAMP)`,
        [tenantId, posBuild, backendBuild, randomUUID()],
      );
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
      await new CreateHumanAuthorizationCore1809000000000().up(migrationRunner);
      await new CreateHumanAuthorizationRecovery1809010000000().up(
        migrationRunner,
      );
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
      // The tenant columns were rebound to uuid in production (issue #286,
      // units B2.2 and B2.3). Running the rebinds keeps this schema faithful:
      // without them every OHAC tenant column here would still be varchar
      // while production compares uuid, and the delivery and acknowledgement
      // paths would be exercised against a shape that no longer exists.
      await new RebindHumanAuthorizationTenantColumns1809100000000().up(
        migrationRunner,
      );
      await new RebindHumanAuthorizationStateColumns1809110000000().up(
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
      `GRANT SELECT, INSERT ON "${schema}".human_auth_policy_epochs,
                               "${schema}".human_auth_terminal_ack_history
         TO "${roleName}"`,
    );
    await admin.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE
         ON "${schema}".human_auth_terminal_ack_floor
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
