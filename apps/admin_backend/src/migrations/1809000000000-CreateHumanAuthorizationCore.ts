import { MigrationInterface, QueryRunner } from 'typeorm';
import { resolveTenantRlsPredicate } from '../core/database/tenant-rls-policy';

const APPEND_ONLY_GUARD = 'guard_human_auth_append_only_mutation';
const FLOOR_MONOTONIC_GUARD = 'guard_human_auth_ack_floor_monotonic';
const FLOOR_DELETE_GUARD = 'guard_human_auth_ack_floor_no_delete';

export class CreateHumanAuthorizationCore1809000000000 implements MigrationInterface {
  name = 'CreateHumanAuthorizationCore1809000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS human_auth_policy_epochs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id varchar(128) NOT NULL,
        terminal_id varchar(128) NOT NULL,
        schema varchar(128) NOT NULL,
        sequence bigint NOT NULL CHECK (sequence >= 0),
        previous_sequence bigint NOT NULL CHECK (previous_sequence >= 0),
        previous_digest varchar(71) NOT NULL
          CHECK (previous_digest = 'GENESIS' OR previous_digest ~ '^sha256:[0-9a-f]{64}$'),
        publisher_backend_build varchar(128) NOT NULL,
        target_pos_build varchar(128) NOT NULL,
        minimum_assertion_schema varchar(128) NOT NULL,
        cohort_decision varchar(32) NOT NULL,
        digest varchar(71) NOT NULL CHECK (digest ~ '^sha256:[0-9a-f]{64}$'),
        payload jsonb NOT NULL,
        published_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_human_auth_policy_epochs_sequence UNIQUE (tenant_id, terminal_id, sequence),
        CONSTRAINT uq_human_auth_policy_epochs_digest UNIQUE (tenant_id, terminal_id, digest)
      );

      CREATE INDEX IF NOT EXISTS idx_human_auth_policy_epochs_tenant
        ON human_auth_policy_epochs (tenant_id);
      CREATE INDEX IF NOT EXISTS idx_human_auth_policy_epochs_terminal_sequence
        ON human_auth_policy_epochs (tenant_id, terminal_id, sequence DESC);
    `);

    await this.enableTenantRls(queryRunner, 'human_auth_policy_epochs', {
      allowUpdate: false,
    });

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION ${APPEND_ONLY_GUARD}() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION '% is append-only: update and delete are forbidden', TG_TABLE_NAME;
        RETURN NULL;
      END; $$ LANGUAGE plpgsql;
    `);

    await this.attachAppendOnlyTrigger(
      queryRunner,
      'human_auth_policy_epochs',
      'trg_human_auth_append_only_epochs',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS human_auth_terminal_ack_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id varchar(128) NOT NULL,
        terminal_id varchar(128) NOT NULL,
        sequence bigint NOT NULL CHECK (sequence >= 0),
        previous_sequence bigint NOT NULL CHECK (previous_sequence >= 0),
        digest varchar(71) NOT NULL CHECK (digest ~ '^sha256:[0-9a-f]{64}$'),
        previous_digest varchar(71) NOT NULL
          CHECK (previous_digest = 'GENESIS' OR previous_digest ~ '^sha256:[0-9a-f]{64}$'),
        status varchar(32) NOT NULL CHECK (status IN ('ACCEPTED', 'REJECTED')),
        result_code varchar(64) NULL,
        idempotency_key varchar(128) NOT NULL,
        request_hash varchar(128) NOT NULL,
        pos_build varchar(128) NOT NULL,
        assertion_schema varchar(128) NOT NULL,
        ack_receipt_id uuid NULL,
        server_floor_sequence bigint NULL,
        server_build varchar(128) NULL,
        received_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        decided_at timestamptz NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS uq_human_auth_ack_history_accepted_sequence
        ON human_auth_terminal_ack_history (tenant_id, terminal_id, sequence)
        WHERE status = 'ACCEPTED';
      CREATE UNIQUE INDEX IF NOT EXISTS uq_human_auth_ack_history_idempotency
        ON human_auth_terminal_ack_history (tenant_id, terminal_id, idempotency_key)
        WHERE status = 'ACCEPTED';
      CREATE INDEX IF NOT EXISTS idx_human_auth_ack_history_terminal_received
        ON human_auth_terminal_ack_history (tenant_id, terminal_id, received_at DESC);
    `);

    await this.enableTenantRls(queryRunner, 'human_auth_terminal_ack_history', {
      allowUpdate: false,
    });

    await this.attachAppendOnlyTrigger(
      queryRunner,
      'human_auth_terminal_ack_history',
      'trg_human_auth_append_only_ack_history',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS human_auth_terminal_ack_floor (
        tenant_id varchar(128) NOT NULL,
        terminal_id varchar(128) NOT NULL,
        sequence bigint NOT NULL CHECK (sequence >= 0),
        digest varchar(71) NOT NULL CHECK (digest ~ '^sha256:[0-9a-f]{64}$'),
        revision bigint NOT NULL DEFAULT 1,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (tenant_id, terminal_id)
      );
    `);

    await this.enableTenantRls(queryRunner, 'human_auth_terminal_ack_floor', {
      allowUpdate: true,
    });

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION ${FLOOR_MONOTONIC_GUARD}() RETURNS trigger AS $$
      BEGIN
        IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
          RAISE EXCEPTION 'human_auth_terminal_ack_floor cannot change tenant identity';
        END IF;
        IF NEW.terminal_id IS DISTINCT FROM OLD.terminal_id THEN
          RAISE EXCEPTION 'human_auth_terminal_ack_floor cannot change terminal identity';
        END IF;
        IF NEW.sequence < OLD.sequence THEN
          RAISE EXCEPTION 'human_auth_terminal_ack_floor sequence regression from % to %', OLD.sequence, NEW.sequence;
        END IF;
        IF NEW.sequence = OLD.sequence AND NEW.digest <> OLD.digest THEN
          RAISE EXCEPTION 'human_auth_terminal_ack_floor digest change at same sequence %', OLD.sequence;
        END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql;

      CREATE OR REPLACE FUNCTION ${FLOOR_DELETE_GUARD}() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'human_auth_terminal_ack_floor rows cannot be deleted';
        RETURN NULL;
      END; $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_human_auth_ack_floor_monotonic ON human_auth_terminal_ack_floor;
      CREATE TRIGGER trg_human_auth_ack_floor_monotonic
        BEFORE UPDATE ON human_auth_terminal_ack_floor
        FOR EACH ROW
        EXECUTE FUNCTION ${FLOOR_MONOTONIC_GUARD}();

      DROP TRIGGER IF EXISTS trg_human_auth_ack_floor_no_delete ON human_auth_terminal_ack_floor;
      CREATE TRIGGER trg_human_auth_ack_floor_no_delete
        BEFORE DELETE ON human_auth_terminal_ack_floor
        FOR EACH ROW
        EXECUTE FUNCTION ${FLOOR_DELETE_GUARD}();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Evidence retention is normative (design section 11 and section 12): rollback must not erase
    // epoch or acknowledgement evidence, and must never lower an ack floor or reactivate an epoch.
    // This removes only the enforcement objects the migration added. The three tables and every
    // retained row stay in place, and dropping them is an explicit operator action outside the
    // migration path. up() is idempotent throughout, so re-applying after a revert is safe.
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_human_auth_append_only_epochs_stmt ON human_auth_policy_epochs;
      DROP TRIGGER IF EXISTS trg_human_auth_append_only_epochs_row ON human_auth_policy_epochs;
      DROP TRIGGER IF EXISTS trg_human_auth_append_only_ack_history_stmt ON human_auth_terminal_ack_history;
      DROP TRIGGER IF EXISTS trg_human_auth_append_only_ack_history_row ON human_auth_terminal_ack_history;
      DROP TRIGGER IF EXISTS trg_human_auth_ack_floor_monotonic ON human_auth_terminal_ack_floor;
      DROP TRIGGER IF EXISTS trg_human_auth_ack_floor_no_delete ON human_auth_terminal_ack_floor;
    `);
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS ${APPEND_ONLY_GUARD}();
      DROP FUNCTION IF EXISTS ${FLOOR_MONOTONIC_GUARD}();
      DROP FUNCTION IF EXISTS ${FLOOR_DELETE_GUARD}();
    `);
  }

  private async enableTenantRls(
    queryRunner: QueryRunner,
    tableName: string,
    options: { allowUpdate: boolean },
  ): Promise<void> {
    // The predicate form must match the tenant_id column type as it is on this
    // run, not as it was when this migration was written: this file is in the
    // schema-build harness's partial-ledger re-run set, so once the Phase 2
    // slice rebinds these tables to uuid, a re-run must emit the uuid form or
    // the bare text comparison fails with "operator does not exist: uuid =
    // text". Resolving once per table through the shared type-aware seam keeps
    // each table's policies on the form that is valid and index-friendly for
    // that table's own column type.
    const tenantPredicate = await resolveTenantRlsPredicate(
      queryRunner,
      tableName,
    );

    await queryRunner.query(`
      ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS ${tableName}_tenant_select ON ${tableName};
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = '${tableName}'
            AND policyname = '${tableName}_tenant_select'
        ) THEN
          CREATE POLICY ${tableName}_tenant_select ON ${tableName}
            FOR SELECT USING (${tenantPredicate});
        END IF;
      END;
      $$;

      DROP POLICY IF EXISTS ${tableName}_tenant_insert ON ${tableName};
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = '${tableName}'
            AND policyname = '${tableName}_tenant_insert'
        ) THEN
          CREATE POLICY ${tableName}_tenant_insert ON ${tableName}
            FOR INSERT WITH CHECK (${tenantPredicate});
        END IF;
      END;
      $$;
    `);

    if (!options.allowUpdate) {
      return;
    }

    await queryRunner.query(`
      DROP POLICY IF EXISTS ${tableName}_tenant_update ON ${tableName};
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = '${tableName}'
            AND policyname = '${tableName}_tenant_update'
        ) THEN
          CREATE POLICY ${tableName}_tenant_update ON ${tableName}
            FOR UPDATE USING (${tenantPredicate})
            WITH CHECK (${tenantPredicate});
        END IF;
      END;
      $$;
    `);
  }

  private async attachAppendOnlyTrigger(
    queryRunner: QueryRunner,
    tableName: string,
    triggerName: string,
  ): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS ${triggerName}_row ON ${tableName};
      CREATE TRIGGER ${triggerName}_row
        BEFORE UPDATE OR DELETE ON ${tableName}
        FOR EACH ROW
        EXECUTE FUNCTION ${APPEND_ONLY_GUARD}();

      DROP TRIGGER IF EXISTS ${triggerName}_stmt ON ${tableName};
      CREATE TRIGGER ${triggerName}_stmt
        BEFORE UPDATE OR DELETE ON ${tableName}
        FOR EACH STATEMENT
        EXECUTE FUNCTION ${APPEND_ONLY_GUARD}();
    `);
  }
}
