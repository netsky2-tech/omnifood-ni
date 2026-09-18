import { MigrationInterface, QueryRunner } from 'typeorm';

const OBSERVABILITY_APPEND_ONLY_GUARD =
  'guard_human_auth_observability_append_only_mutation';

export class CreateHumanAuthorizationObservability1809020000000 implements MigrationInterface {
  name = 'CreateHumanAuthorizationObservability1809020000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS human_auth_verification_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id varchar(128) NOT NULL,
        terminal_id varchar(128) NOT NULL,
        assertion_id uuid NOT NULL,
        credential_id uuid NOT NULL,
        credential_version integer NOT NULL,
        epoch_sequence bigint NOT NULL CHECK (epoch_sequence >= 0),
        epoch_digest varchar(71) NOT NULL CHECK (epoch_digest ~ '^sha256:[0-9a-f]{64}$'),
        authorizer_user_id uuid NOT NULL,
        operator_user_id uuid NULL,
        operation_type varchar(64) NOT NULL,
        operation_schema varchar(128) NOT NULL,
        operation_digest varchar(71) NOT NULL CHECK (operation_digest ~ '^sha256:[0-9a-f]{64}$'),
        local_audit_id varchar(128) NULL,
        local_sequence bigint NULL,
        trust_level varchar(64) NOT NULL,
        decision varchar(32) NOT NULL,
        reason_code varchar(64) NULL,
        correlation_id varchar(128) NULL,
        occurred_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_human_auth_verification_events_authorizer
          FOREIGN KEY (authorizer_user_id) REFERENCES users(id) ON DELETE RESTRICT
      );

      COMMENT ON TABLE human_auth_verification_events IS
        'Append-only verification outcome facts. assertion_id is deliberately not unique: duplicate verification of an unconsumed assertion is harmless, and consumption uniqueness belongs to the consumer table. Stores no assertion body, no PIN material, and no verifier material.';

      CREATE INDEX IF NOT EXISTS idx_human_auth_verification_events_assertion
        ON human_auth_verification_events (tenant_id, assertion_id);
    `);

    await this.enableTenantRls(queryRunner, 'human_auth_verification_events', {
      allowUpdate: false,
    });

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION ${OBSERVABILITY_APPEND_ONLY_GUARD}() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION '% is append-only: update and delete are forbidden', TG_TABLE_NAME;
        RETURN NULL;
      END; $$ LANGUAGE plpgsql;
    `);

    await this.attachAppendOnlyTrigger(
      queryRunner,
      'human_auth_verification_events',
      'trg_human_auth_append_only_verification_events',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS human_auth_rollout_cohorts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id varchar(128) NOT NULL,
        pos_build varchar(128) NOT NULL,
        backend_build varchar(128) NOT NULL,
        policy_schema varchar(128) NOT NULL,
        assertion_schema varchar(128) NOT NULL,
        enabled boolean NOT NULL DEFAULT false,
        owner_acceptance_actor_id uuid NULL,
        owner_acceptance_ref varchar(255) NULL,
        owner_acceptance_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_human_auth_rollout_cohorts_build_pair UNIQUE (tenant_id, pos_build, backend_build),
        -- Enablement requires the exact POS/backend build pair plus a recorded OWNER acceptance, so a
        -- cohort row cannot be flipped on with the acceptance reference missing.
        CONSTRAINT ck_human_auth_rollout_cohorts_owner_acceptance CHECK (
          enabled = false
          OR (
            owner_acceptance_actor_id IS NOT NULL
            AND owner_acceptance_ref IS NOT NULL
            AND owner_acceptance_at IS NOT NULL
          )
        )
      );

      CREATE INDEX IF NOT EXISTS idx_human_auth_rollout_cohorts_tenant_enabled
        ON human_auth_rollout_cohorts (tenant_id, enabled);
    `);

    await this.enableTenantRls(queryRunner, 'human_auth_rollout_cohorts', {
      allowUpdate: true,
    });
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Evidence retention is normative (design section 11 and section 12): rollback must not erase
    // verification outcome or cohort gate rows. This removes only the enforcement objects this
    // migration added: triggers first, then its own guard function. Both tables and every retained
    // row stay in place, and dropping them is an explicit operator action outside the migration
    // path. up() is idempotent throughout, so re-applying after a revert is safe.
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_human_auth_append_only_verification_events_row ON human_auth_verification_events;
      DROP TRIGGER IF EXISTS trg_human_auth_append_only_verification_events_stmt ON human_auth_verification_events;
    `);
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS ${OBSERVABILITY_APPEND_ONLY_GUARD}();
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
      CREATE POLICY ${tableName}_tenant_select ON ${tableName}
        FOR SELECT USING (${tenantPredicate});

      DROP POLICY IF EXISTS ${tableName}_tenant_insert ON ${tableName};
      CREATE POLICY ${tableName}_tenant_insert ON ${tableName}
        FOR INSERT WITH CHECK (${tenantPredicate});
    `);

    if (!options.allowUpdate) {
      return;
    }

    await queryRunner.query(`
      DROP POLICY IF EXISTS ${tableName}_tenant_update ON ${tableName};
      CREATE POLICY ${tableName}_tenant_update ON ${tableName}
        FOR UPDATE USING (${tenantPredicate})
        WITH CHECK (${tenantPredicate});
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
        EXECUTE FUNCTION ${OBSERVABILITY_APPEND_ONLY_GUARD}();

      DROP TRIGGER IF EXISTS ${triggerName}_stmt ON ${tableName};
      CREATE TRIGGER ${triggerName}_stmt
        BEFORE UPDATE OR DELETE ON ${tableName}
        FOR EACH STATEMENT
        EXECUTE FUNCTION ${OBSERVABILITY_APPEND_ONLY_GUARD}();
    `);
  }
}
