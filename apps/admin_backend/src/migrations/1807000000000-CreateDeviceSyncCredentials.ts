import { MigrationInterface, QueryRunner } from 'typeorm';
import { resolveTenantRlsPredicate } from '../core/database/tenant-rls-policy';

export class CreateDeviceSyncCredentials1807000000000 implements MigrationInterface {
  name = 'CreateDeviceSyncCredentials1807000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS device_sync_credentials (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id varchar(128) NOT NULL,
        activation_attempt_id uuid NOT NULL,
        renewal_secret_hash varchar(255) NOT NULL,
        scopes jsonb NOT NULL DEFAULT '["sync:push", "sync:pull"]'::jsonb,
        version integer NOT NULL DEFAULT 1,
        status varchar(64) NOT NULL DEFAULT 'PENDING',
        expires_at timestamptz NOT NULL,
        issued_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        rotated_at timestamptz NULL,
        revoked_at timestamptz NULL,
        revocation_reason varchar(255) NULL,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_device_sync_credentials_activation_attempt
          FOREIGN KEY (activation_attempt_id)
          REFERENCES onboarding_activation_attempts(id)
          ON DELETE RESTRICT
      );

      CREATE UNIQUE INDEX IF NOT EXISTS uq_device_sync_credentials_attempt_version
        ON device_sync_credentials (activation_attempt_id, version);

      CREATE INDEX IF NOT EXISTS idx_device_sync_credentials_tenant
        ON device_sync_credentials (tenant_id);
      CREATE INDEX IF NOT EXISTS idx_device_sync_credentials_attempt
        ON device_sync_credentials (activation_attempt_id);
      CREATE INDEX IF NOT EXISTS idx_device_sync_credentials_status
        ON device_sync_credentials (status);

      -- FORCE ROW LEVEL SECURITY ensures application and table roles cannot bypass tenant isolation.
      -- Token renewal uses transaction-local tenant selector (declarative tenant) as a lookup partition,
      -- followed by secret verification and authoritative binding checks.
      -- If an app role bypasses non-forced RLS, FORCE RLS eliminates that risk without unsafe bypasses.
      ALTER TABLE device_sync_credentials ENABLE ROW LEVEL SECURITY;
      ALTER TABLE device_sync_credentials FORCE ROW LEVEL SECURITY;
    `);

    // Each table resolves its OWN predicate from the catalog: the two
    // tenant_id columns can be of different types mid-slice (a partial-ledger
    // re-run lands after later slices converted only some columns to uuid),
    // so a single shared resolution would give one table the other's answer.
    const credentialsPredicate = await resolveTenantRlsPredicate(
      queryRunner,
      'device_sync_credentials',
    );

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'device_sync_credentials'
            AND policyname = 'device_sync_credentials_tenant_select'
        ) THEN
          CREATE POLICY device_sync_credentials_tenant_select ON device_sync_credentials
            FOR SELECT USING (${credentialsPredicate});
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'device_sync_credentials'
            AND policyname = 'device_sync_credentials_tenant_insert'
        ) THEN
          CREATE POLICY device_sync_credentials_tenant_insert ON device_sync_credentials
            FOR INSERT WITH CHECK (${credentialsPredicate});
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'device_sync_credentials'
            AND policyname = 'device_sync_credentials_tenant_update'
        ) THEN
          CREATE POLICY device_sync_credentials_tenant_update ON device_sync_credentials
            FOR UPDATE USING (${credentialsPredicate})
            WITH CHECK (${credentialsPredicate});
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'device_sync_credentials'
            AND policyname = 'device_sync_credentials_tenant_delete'
        ) THEN
          CREATE POLICY device_sync_credentials_tenant_delete ON device_sync_credentials
            FOR DELETE USING (${credentialsPredicate});
        END IF;
      END;
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS device_sync_credential_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id varchar(128) NOT NULL,
        credential_id uuid NOT NULL,
        event_type varchar(64) NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        occurred_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_device_sync_credential_events_credential
          FOREIGN KEY (credential_id)
          REFERENCES device_sync_credentials(id)
          ON DELETE RESTRICT
      );

      CREATE INDEX IF NOT EXISTS idx_device_sync_cred_events_tenant
        ON device_sync_credential_events (tenant_id);
      CREATE INDEX IF NOT EXISTS idx_device_sync_cred_events_credential
        ON device_sync_credential_events (credential_id);

      ALTER TABLE device_sync_credential_events ENABLE ROW LEVEL SECURITY;
      ALTER TABLE device_sync_credential_events FORCE ROW LEVEL SECURITY;
    `);

    const eventsPredicate = await resolveTenantRlsPredicate(
      queryRunner,
      'device_sync_credential_events',
    );

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'device_sync_credential_events'
            AND policyname = 'device_sync_cred_events_tenant_select'
        ) THEN
          CREATE POLICY device_sync_cred_events_tenant_select ON device_sync_credential_events
            FOR SELECT USING (${eventsPredicate});
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'device_sync_credential_events'
            AND policyname = 'device_sync_cred_events_tenant_insert'
        ) THEN
          CREATE POLICY device_sync_cred_events_tenant_insert ON device_sync_credential_events
            FOR INSERT WITH CHECK (${eventsPredicate});
        END IF;
      END;
      $$;

      CREATE OR REPLACE FUNCTION guard_device_sync_credential_events_immutability() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
          RAISE EXCEPTION 'device_sync_credential_events is append-only';
        END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_guard_device_sync_credential_events_immutability ON device_sync_credential_events;
      CREATE TRIGGER trg_guard_device_sync_credential_events_immutability
        BEFORE UPDATE OR DELETE ON device_sync_credential_events
        FOR EACH ROW
        EXECUTE FUNCTION guard_device_sync_credential_events_immutability();

      DROP TRIGGER IF EXISTS trg_guard_device_sync_credential_events_immutability_stmt ON device_sync_credential_events;
      CREATE TRIGGER trg_guard_device_sync_credential_events_immutability_stmt
        BEFORE UPDATE OR DELETE ON device_sync_credential_events
        FOR EACH STATEMENT
        EXECUTE FUNCTION guard_device_sync_credential_events_immutability();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_guard_device_sync_credential_events_immutability_stmt ON device_sync_credential_events;
      DROP TRIGGER IF EXISTS trg_guard_device_sync_credential_events_immutability ON device_sync_credential_events;
      DROP FUNCTION IF EXISTS guard_device_sync_credential_events_immutability();
      DROP TABLE IF EXISTS device_sync_credential_events CASCADE;
      DROP TABLE IF EXISTS device_sync_credentials CASCADE;
    `);
  }
}
