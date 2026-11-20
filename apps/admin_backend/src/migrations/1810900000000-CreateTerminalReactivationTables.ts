import { MigrationInterface, QueryRunner } from 'typeorm';
import { resolveTenantRlsPredicate } from '../core/database/tenant-rls-policy';

/**
 * Creates tenant-scoped tables for POS terminal reactivation without creating
 * duplicate terminals or resetting fiscal sequences (issue #566):
 *
 * 1. `terminal_install_fingerprints`: SHA-256 hardware fingerprint (ANDROID_ID)
 *    captured at device link / reactivation time so a reinstalled APK on the
 *    same physical tablet can be recognized pre-auth without exposing tenant
 *    identity or credentials.
 * 2. `terminal_reactivation_challenges`: Short-lived, human-gated reactivation
 *    challenges (approved via dashboard or one-time 6-digit recovery code).
 * 3. `terminal_recovery_codes`: Bcrypt-hashed one-time 6-digit recovery codes
 *    issued upon activation finalization (or rotated from the dashboard).
 * 4. Adds nullable `replaces_terminal_id` to `device_linking_codes` so a
 *    dashboard-initiated factory-reset replacement linking code explicitly
 *    targets and preserves an existing `terminalId`.
 *
 * Isolation & RLS
 * ---------------
 * - `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` on all 3 tables.
 * - Pre-auth lookup/completion uses the narrow transaction-local flag
 *   `current_setting('app.device_lookup', true) = 'on'` (set exclusively inside
 *   a transaction via `set_config('app.device_lookup', 'on', true)`, never from
 *   client input and never session-scoped).
 */
export class CreateTerminalReactivationTables1810900000000
  implements MigrationInterface
{
  name = 'CreateTerminalReactivationTables1810900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS terminal_install_fingerprints (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        terminal_id varchar(128) NOT NULL,
        fingerprint_hash varchar(128) NOT NULL,
        first_seen_at timestamptz NOT NULL DEFAULT now(),
        last_seen_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_terminal_install_fingerprints_tenant
          FOREIGN KEY (tenant_id)
          REFERENCES tenants(id)
          ON DELETE CASCADE,
        CONSTRAINT uq_terminal_install_fingerprints_tenant_terminal_hash
          UNIQUE (tenant_id, terminal_id, fingerprint_hash)
      );

      CREATE INDEX IF NOT EXISTS idx_terminal_install_fingerprints_hash
        ON terminal_install_fingerprints (fingerprint_hash);

      CREATE INDEX IF NOT EXISTS idx_terminal_install_fingerprints_tenant_terminal
        ON terminal_install_fingerprints (tenant_id, terminal_id);

      ALTER TABLE terminal_install_fingerprints ENABLE ROW LEVEL SECURITY;
      ALTER TABLE terminal_install_fingerprints FORCE ROW LEVEL SECURITY;

      CREATE TABLE IF NOT EXISTS terminal_reactivation_challenges (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        terminal_id varchar(128) NOT NULL,
        fingerprint_hash varchar(128) NULL,
        status varchar(32) NOT NULL DEFAULT 'PENDING',
        reason varchar(32) NOT NULL DEFAULT 'reinstall',
        approval_method varchar(32) NULL,
        approved_by_user_id uuid NULL,
        approved_at timestamptz NULL,
        completed_at timestamptz NULL,
        previous_credential_id uuid NULL,
        previous_credential_version integer NULL,
        new_credential_id uuid NULL,
        new_credential_version integer NULL,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_terminal_reactivation_challenges_tenant
          FOREIGN KEY (tenant_id)
          REFERENCES tenants(id)
          ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_terminal_reactivation_challenges_tenant_status_expires
        ON terminal_reactivation_challenges (tenant_id, status, expires_at);

      CREATE INDEX IF NOT EXISTS idx_terminal_reactivation_challenges_fingerprint_status
        ON terminal_reactivation_challenges (fingerprint_hash, status);

      ALTER TABLE terminal_reactivation_challenges ENABLE ROW LEVEL SECURITY;
      ALTER TABLE terminal_reactivation_challenges FORCE ROW LEVEL SECURITY;

      CREATE TABLE IF NOT EXISTS terminal_recovery_codes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        terminal_id varchar(128) NOT NULL,
        activation_attempt_id uuid NULL,
        code_hash varchar(255) NOT NULL,
        issued_at timestamptz NOT NULL DEFAULT now(),
        used_at timestamptz NULL,
        revoked_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_terminal_recovery_codes_tenant
          FOREIGN KEY (tenant_id)
          REFERENCES tenants(id)
          ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_terminal_recovery_codes_tenant_terminal
        ON terminal_recovery_codes (tenant_id, terminal_id);

      ALTER TABLE terminal_recovery_codes ENABLE ROW LEVEL SECURITY;
      ALTER TABLE terminal_recovery_codes FORCE ROW LEVEL SECURITY;

      ALTER TABLE device_linking_codes
        ADD COLUMN IF NOT EXISTS replaces_terminal_id varchar(128) NULL;
    `);

    const buildPredicates = async (tableName: string) => {
      const predicate = await resolveTenantRlsPredicate(queryRunner, tableName);
      const nullSafePredicate = predicate.replace(
        "current_setting('app.tenant_id', true)",
        "NULLIF(current_setting('app.tenant_id', true), '')",
      );
      const lookupPredicate = `(${nullSafePredicate} OR current_setting('app.device_lookup', true) = 'on')`;
      return { predicate, lookupPredicate };
    };

    const fp = await buildPredicates('terminal_install_fingerprints');
    const ch = await buildPredicates('terminal_reactivation_challenges');
    const rc = await buildPredicates('terminal_recovery_codes');

    await queryRunner.query(`
      DO $$
      BEGIN
        -- terminal_install_fingerprints: lookup allowed on SELECT; tenant-only on INSERT/UPDATE/DELETE
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'terminal_install_fingerprints'
            AND policyname = 'terminal_install_fingerprints_tenant_select'
        ) THEN
          CREATE POLICY terminal_install_fingerprints_tenant_select
            ON terminal_install_fingerprints
            FOR SELECT USING (${fp.lookupPredicate});
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'terminal_install_fingerprints'
            AND policyname = 'terminal_install_fingerprints_tenant_insert'
        ) THEN
          CREATE POLICY terminal_install_fingerprints_tenant_insert
            ON terminal_install_fingerprints
            FOR INSERT WITH CHECK (${fp.predicate});
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'terminal_install_fingerprints'
            AND policyname = 'terminal_install_fingerprints_tenant_update'
        ) THEN
          CREATE POLICY terminal_install_fingerprints_tenant_update
            ON terminal_install_fingerprints
            FOR UPDATE USING (${fp.predicate})
            WITH CHECK (${fp.predicate});
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'terminal_install_fingerprints'
            AND policyname = 'terminal_install_fingerprints_tenant_delete'
        ) THEN
          CREATE POLICY terminal_install_fingerprints_tenant_delete
            ON terminal_install_fingerprints
            FOR DELETE USING (${fp.predicate});
        END IF;

        -- terminal_reactivation_challenges: lookup allowed on SELECT/INSERT/UPDATE; tenant-only on DELETE
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'terminal_reactivation_challenges'
            AND policyname = 'terminal_reactivation_challenges_tenant_select'
        ) THEN
          CREATE POLICY terminal_reactivation_challenges_tenant_select
            ON terminal_reactivation_challenges
            FOR SELECT USING (${ch.lookupPredicate});
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'terminal_reactivation_challenges'
            AND policyname = 'terminal_reactivation_challenges_tenant_insert'
        ) THEN
          CREATE POLICY terminal_reactivation_challenges_tenant_insert
            ON terminal_reactivation_challenges
            FOR INSERT WITH CHECK (${ch.lookupPredicate});
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'terminal_reactivation_challenges'
            AND policyname = 'terminal_reactivation_challenges_tenant_update'
        ) THEN
          CREATE POLICY terminal_reactivation_challenges_tenant_update
            ON terminal_reactivation_challenges
            FOR UPDATE USING (${ch.lookupPredicate})
            WITH CHECK (${ch.lookupPredicate});
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'terminal_reactivation_challenges'
            AND policyname = 'terminal_reactivation_challenges_tenant_delete'
        ) THEN
          CREATE POLICY terminal_reactivation_challenges_tenant_delete
            ON terminal_reactivation_challenges
            FOR DELETE USING (${ch.predicate});
        END IF;

        -- terminal_recovery_codes: lookup allowed on SELECT/UPDATE; tenant-only on INSERT/DELETE
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'terminal_recovery_codes'
            AND policyname = 'terminal_recovery_codes_tenant_select'
        ) THEN
          CREATE POLICY terminal_recovery_codes_tenant_select
            ON terminal_recovery_codes
            FOR SELECT USING (${rc.lookupPredicate});
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'terminal_recovery_codes'
            AND policyname = 'terminal_recovery_codes_tenant_insert'
        ) THEN
          CREATE POLICY terminal_recovery_codes_tenant_insert
            ON terminal_recovery_codes
            FOR INSERT WITH CHECK (${rc.predicate});
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'terminal_recovery_codes'
            AND policyname = 'terminal_recovery_codes_tenant_update'
        ) THEN
          CREATE POLICY terminal_recovery_codes_tenant_update
            ON terminal_recovery_codes
            FOR UPDATE USING (${rc.lookupPredicate})
            WITH CHECK (${rc.lookupPredicate});
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'terminal_recovery_codes'
            AND policyname = 'terminal_recovery_codes_tenant_delete'
        ) THEN
          CREATE POLICY terminal_recovery_codes_tenant_delete
            ON terminal_recovery_codes
            FOR DELETE USING (${rc.predicate});
        END IF;
      END;
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE device_linking_codes
        DROP COLUMN IF EXISTS replaces_terminal_id;

      DROP INDEX IF EXISTS idx_terminal_recovery_codes_tenant_terminal;
      DROP TABLE IF EXISTS terminal_recovery_codes CASCADE;

      DROP INDEX IF EXISTS idx_terminal_reactivation_challenges_fingerprint_status;
      DROP INDEX IF EXISTS idx_terminal_reactivation_challenges_tenant_status_expires;
      DROP TABLE IF EXISTS terminal_reactivation_challenges CASCADE;

      DROP INDEX IF EXISTS idx_terminal_install_fingerprints_tenant_terminal;
      DROP INDEX IF EXISTS idx_terminal_install_fingerprints_hash;
      DROP TABLE IF EXISTS terminal_install_fingerprints CASCADE;
    `);
  }
}
