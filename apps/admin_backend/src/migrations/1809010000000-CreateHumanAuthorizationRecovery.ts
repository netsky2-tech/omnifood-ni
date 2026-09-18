import { MigrationInterface, QueryRunner } from 'typeorm';

const RECOVERY_APPEND_ONLY_GUARD =
  'guard_human_auth_recovery_append_only_mutation';
const TOKEN_TRANSITION_GUARD = 'guard_human_auth_recovery_token_transition';
const TOKEN_DELETE_GUARD = 'guard_human_auth_recovery_token_no_delete';

export class CreateHumanAuthorizationRecovery1809010000000 implements MigrationInterface {
  name = 'CreateHumanAuthorizationRecovery1809010000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS human_auth_recovery_tokens (
        token_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id varchar(128) NOT NULL,
        terminal_id varchar(128) NOT NULL,
        secret_hmac varchar(64) NOT NULL,
        status varchar(32) NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED', 'REVOKED', 'REDEEMED')),
        issued_by_user_id uuid NOT NULL,
        issuance_reason varchar(255) NOT NULL,
        issued_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at timestamptz NOT NULL CHECK (expires_at > issued_at),
        revoked_at timestamptz NULL,
        revoked_by_user_id uuid NULL,
        revocation_reason varchar(255) NULL,
        redeemed_at timestamptz NULL,
        redemption_credential_id uuid NULL,
        idempotency_key varchar(128) NULL,
        redemption_request_hash varchar(128) NULL,
        -- Per-row well-formedness, independent of the write path. The transition trigger guards
        -- updates; these constraints also hold for a direct INSERT, so a row cannot be created
        -- already REDEEMED or REVOKED without its required evidence fields.
        CONSTRAINT ck_human_auth_recovery_tokens_redemption CHECK (
          status <> 'REDEEMED'
          OR (redeemed_at IS NOT NULL AND redemption_credential_id IS NOT NULL)
        ),
        CONSTRAINT ck_human_auth_recovery_tokens_revocation CHECK (
          status <> 'REVOKED' OR revoked_at IS NOT NULL
        ),
        CONSTRAINT fk_human_auth_recovery_tokens_issuer
          FOREIGN KEY (issued_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
      );

      CREATE UNIQUE INDEX IF NOT EXISTS uq_human_auth_recovery_tokens_hmac
        ON human_auth_recovery_tokens (tenant_id, secret_hmac);
      CREATE INDEX IF NOT EXISTS idx_human_auth_recovery_tokens_tenant_terminal
        ON human_auth_recovery_tokens (tenant_id, terminal_id);
      CREATE INDEX IF NOT EXISTS idx_human_auth_recovery_tokens_expiry
        ON human_auth_recovery_tokens (status, expires_at);
    `);

    await this.enableTenantRls(queryRunner, 'human_auth_recovery_tokens', {
      allowUpdate: true,
    });

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION ${RECOVERY_APPEND_ONLY_GUARD}() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION '% is append-only: update and delete are forbidden', TG_TABLE_NAME;
        RETURN NULL;
      END; $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION ${TOKEN_TRANSITION_GUARD}() RETURNS trigger AS $$
      BEGIN
        IF NEW.token_id IS DISTINCT FROM OLD.token_id
          OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
          OR NEW.terminal_id IS DISTINCT FROM OLD.terminal_id
          OR NEW.secret_hmac IS DISTINCT FROM OLD.secret_hmac
          OR NEW.issued_by_user_id IS DISTINCT FROM OLD.issued_by_user_id
          OR NEW.issued_at IS DISTINCT FROM OLD.issued_at THEN
          RAISE EXCEPTION 'human_auth_recovery_tokens identity columns are immutable';
        END IF;
        IF OLD.status = 'REDEEMED' THEN
          RAISE EXCEPTION 'human_auth_recovery_tokens status REDEEMED is terminal';
        END IF;
        IF OLD.status = 'REVOKED' THEN
          RAISE EXCEPTION 'human_auth_recovery_tokens status REVOKED is terminal';
        END IF;
        IF NEW.status = 'REDEEMED' THEN
          IF NEW.redeemed_at IS NULL OR NEW.redemption_credential_id IS NULL THEN
            RAISE EXCEPTION 'human_auth_recovery_tokens redemption requires redeemed_at and redemption_credential_id';
          END IF;
        ELSIF NEW.status = 'REVOKED' THEN
          IF NEW.revoked_at IS NULL THEN
            RAISE EXCEPTION 'human_auth_recovery_tokens revocation requires revoked_at';
          END IF;
        ELSIF NEW.status <> OLD.status THEN
          RAISE EXCEPTION 'human_auth_recovery_tokens cannot transition from % to %', OLD.status, NEW.status;
        END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql;

      CREATE OR REPLACE FUNCTION ${TOKEN_DELETE_GUARD}() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'human_auth_recovery_tokens rows are evidence and cannot be deleted';
        RETURN NULL;
      END; $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_human_auth_recovery_token_transition ON human_auth_recovery_tokens;
      CREATE TRIGGER trg_human_auth_recovery_token_transition
        BEFORE UPDATE ON human_auth_recovery_tokens
        FOR EACH ROW
        EXECUTE FUNCTION ${TOKEN_TRANSITION_GUARD}();

      DROP TRIGGER IF EXISTS trg_human_auth_recovery_token_no_delete ON human_auth_recovery_tokens;
      CREATE TRIGGER trg_human_auth_recovery_token_no_delete
        BEFORE DELETE ON human_auth_recovery_tokens
        FOR EACH ROW
        EXECUTE FUNCTION ${TOKEN_DELETE_GUARD}();
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS human_auth_recovery_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id varchar(128) NOT NULL,
        terminal_id varchar(128) NOT NULL,
        token_id uuid NOT NULL,
        event_type varchar(32) NOT NULL CHECK (event_type IN ('ISSUANCE', 'DENIAL', 'EXPIRY_OBSERVED', 'REVOCATION', 'REDEMPTION', 'RACE_LOSS')),
        actor_user_id uuid NULL,
        principal_type varchar(32) NOT NULL,
        reason_code varchar(64) NULL,
        correlation_id varchar(128) NULL,
        occurred_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_human_auth_recovery_events_token
          FOREIGN KEY (token_id) REFERENCES human_auth_recovery_tokens(token_id) ON DELETE RESTRICT
      );

      CREATE UNIQUE INDEX IF NOT EXISTS uq_human_auth_recovery_events_expiry_observed
        ON human_auth_recovery_events (tenant_id, token_id)
        WHERE event_type = 'EXPIRY_OBSERVED';
      CREATE INDEX IF NOT EXISTS idx_human_auth_recovery_events_token
        ON human_auth_recovery_events (tenant_id, token_id, occurred_at DESC);
    `);

    await this.enableTenantRls(queryRunner, 'human_auth_recovery_events', {
      allowUpdate: false,
    });

    await this.attachAppendOnlyTrigger(
      queryRunner,
      'human_auth_recovery_events',
      'trg_human_auth_append_only_recovery_events',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Evidence retention is normative (design section 11 and section 12): rollback must not erase
    // recovery token or recovery event rows. This removes only the enforcement objects this
    // migration added: triggers first, then functions. Both tables and every retained row stay in
    // place, and dropping them is an explicit operator action outside the migration path. up() is
    // idempotent throughout, so re-applying after a revert is safe.
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_human_auth_recovery_token_transition ON human_auth_recovery_tokens;
      DROP TRIGGER IF EXISTS trg_human_auth_recovery_token_no_delete ON human_auth_recovery_tokens;
      DROP TRIGGER IF EXISTS trg_human_auth_append_only_recovery_events_row ON human_auth_recovery_events;
      DROP TRIGGER IF EXISTS trg_human_auth_append_only_recovery_events_stmt ON human_auth_recovery_events;
    `);
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS ${TOKEN_TRANSITION_GUARD}();
      DROP FUNCTION IF EXISTS ${TOKEN_DELETE_GUARD}();
      -- Only this migration's own guard function is dropped. The core migration owns
      -- guard_human_auth_append_only_mutation() for its own tables, and dropping it here would
      -- leave that migration's triggers bound to a missing function.
      DROP FUNCTION IF EXISTS ${RECOVERY_APPEND_ONLY_GUARD}();
    `);
  }

  private async enableTenantRls(
    queryRunner: QueryRunner,
    tableName: string,
    options: { allowUpdate: boolean },
  ): Promise<void> {
    const tenantPredicate =
      "tenant_id = current_setting('app.tenant_id', true)";

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
        EXECUTE FUNCTION ${RECOVERY_APPEND_ONLY_GUARD}();

      DROP TRIGGER IF EXISTS ${triggerName}_stmt ON ${tableName};
      CREATE TRIGGER ${triggerName}_stmt
        BEFORE UPDATE OR DELETE ON ${tableName}
        FOR EACH STATEMENT
        EXECUTE FUNCTION ${RECOVERY_APPEND_ONLY_GUARD}();
    `);
  }
}
