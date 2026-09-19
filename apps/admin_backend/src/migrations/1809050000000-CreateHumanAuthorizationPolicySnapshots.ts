import { MigrationInterface, QueryRunner } from 'typeorm';
import { resolveTenantRlsPredicate } from '../core/database/tenant-rls-policy';

// Design §11.2 decision 17 (user decision): the publisher persists one immutable terminal-agnostic
// policy snapshot per (tenant_id, sequence); the per-terminal epoch row is materialized on the
// terminal's first pull. Design §11.3 gap 1: no tenant-global policy sequence exists in the epoch
// table (unique only per terminal), so this snapshot store is the sequence source of truth. The
// sequence is derived, not stored in a counter: the publisher computes the next value from this
// table under the tenant advisory lock (§11.2 decision 19), so this migration provisions exactly
// one table. No FK and no entity registration belong to this migration.
const APPEND_ONLY_GUARD = 'guard_human_auth_policy_snapshots_append_only';
const APPEND_ONLY_TRIGGER = 'trg_human_auth_policy_snapshots_append_only';

export class CreateHumanAuthorizationPolicySnapshots1809050000000 implements MigrationInterface {
  name = 'CreateHumanAuthorizationPolicySnapshots1809050000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS human_auth_policy_snapshots (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id varchar(128) NOT NULL,
        sequence bigint NOT NULL CHECK (sequence >= 0),
        previous_sequence bigint NOT NULL CHECK (previous_sequence >= 0),
        schema varchar(128) NOT NULL,
        previous_digest varchar(71) NOT NULL
          CHECK (previous_digest = 'GENESIS' OR previous_digest ~ '^sha256:[0-9a-f]{64}$'),
        publisher_backend_build varchar(128) NOT NULL,
        minimum_assertion_schema varchar(128) NOT NULL,
        cohort_decision varchar(32) NOT NULL,
        digest varchar(71) NOT NULL CHECK (digest ~ '^sha256:[0-9a-f]{64}$'),
        payload jsonb NOT NULL,
        published_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_human_auth_policy_snapshots_sequence UNIQUE (tenant_id, sequence),
        CONSTRAINT uq_human_auth_policy_snapshots_digest UNIQUE (tenant_id, digest)
      );

      CREATE INDEX IF NOT EXISTS idx_human_auth_policy_snapshots_tenant_sequence
        ON human_auth_policy_snapshots (tenant_id, sequence DESC);

      COMMENT ON TABLE human_auth_policy_snapshots IS
        'One immutable terminal-agnostic policy snapshot per (tenant_id, sequence). The sequence is
        tenant-global and contiguous, derived as MAX(sequence) + 1 from this table under the
        pg_advisory_xact_lock(hashtext(tenant_id)) lock the publisher holds while publishing; no
        counter table exists, so contiguity holds because the lock serializes publishers and this
        store is append-only with no delete path.';
    `);

    await this.enableTenantRls(queryRunner, 'human_auth_policy_snapshots');

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION ${APPEND_ONLY_GUARD}() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION '% is append-only: update and delete are forbidden', TG_TABLE_NAME;
        RETURN NULL;
      END; $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS ${APPEND_ONLY_TRIGGER}_row ON human_auth_policy_snapshots;
      CREATE TRIGGER ${APPEND_ONLY_TRIGGER}_row
        BEFORE UPDATE OR DELETE ON human_auth_policy_snapshots
        FOR EACH ROW
        EXECUTE FUNCTION ${APPEND_ONLY_GUARD}();

      DROP TRIGGER IF EXISTS ${APPEND_ONLY_TRIGGER}_stmt ON human_auth_policy_snapshots;
      CREATE TRIGGER ${APPEND_ONLY_TRIGGER}_stmt
        BEFORE UPDATE OR DELETE ON human_auth_policy_snapshots
        FOR EACH STATEMENT
        EXECUTE FUNCTION ${APPEND_ONLY_GUARD}();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Snapshot retention is normative (design §11/§12): rollback must not erase published policy
    // evidence, and the snapshot is the tenant sequence source of truth, so dropping it would
    // corrupt the derived next sequence. This removes only the enforcement objects this migration
    // added: its triggers first, then its own guard function. The table and every row stay in
    // place; dropping them is an explicit operator action outside the migration path, and up() is
    // idempotent, so re-applying after a revert is safe.
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS ${APPEND_ONLY_TRIGGER}_row ON human_auth_policy_snapshots;
      DROP TRIGGER IF EXISTS ${APPEND_ONLY_TRIGGER}_stmt ON human_auth_policy_snapshots;
    `);
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS ${APPEND_ONLY_GUARD}();
    `);
  }

  private async enableTenantRls(
    queryRunner: QueryRunner,
    tableName: string,
  ): Promise<void> {
    // The predicate form must match the tenant_id column type as it is on this
    // run, not as it was when this migration was written: this file is in the
    // schema-build harness's partial-ledger re-run set, so once the Phase 2
    // slice rebinds this table to uuid, a re-run must emit the uuid form or
    // the bare text comparison fails with "operator does not exist: uuid =
    // text". Resolving through the shared type-aware seam keeps the policies
    // on the form that is valid and index-friendly for the column's real type.
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
  }
}
