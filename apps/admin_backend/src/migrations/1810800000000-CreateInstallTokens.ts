import { MigrationInterface, QueryRunner } from 'typeorm';
import { resolveTenantRlsPredicate } from '../core/database/tenant-rls-policy';

/**
 * Creates install_tokens for the POS Install Kit (issue #958):
 * opaque, revocable, tenant-scoped tokens that power stable QR codes and
 * App Links (`/i/:token`) resolving to fresh short-lived R2 presigned APK
 * downloads without exposing tenant identity or credentials.
 *
 * Isolation & RLS
 * ---------------
 * - `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` ensures the
 *   tenant boundary is authoritative for every role, including the table owner.
 * - `INSERT` and `DELETE` use the pure tenant predicate from
 *   `resolveTenantRlsPredicate(queryRunner, 'install_tokens')`, keeping token
 *   creation and removal strictly tenant-bound.
 * - `SELECT` and `UPDATE` carry the narrow transaction-local pre-auth lookup
 *   branch `OR current_setting('app.install_token_lookup', true) = 'on'`
 *   (with `NULLIF(..., '')` on `app.tenant_id` so an unset/empty session
 *   setting never fails `::uuid` casting on pooled connections).
 * - The flag is set exclusively inside a transaction via
 *   `set_config('app.install_token_lookup', 'on', true)` in
 *   `InstallKitService`, never from client input and never session-scoped.
 */
export class CreateInstallTokens1810800000000 implements MigrationInterface {
  name = 'CreateInstallTokens1810800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS install_tokens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        token_hash varchar(64) NOT NULL UNIQUE,
        token_prefix varchar(12) NOT NULL,
        label varchar(80) NULL,
        created_by_user_id uuid NOT NULL,
        revoked_at timestamptz NULL,
        last_used_at timestamptz NULL,
        use_count integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_install_tokens_tenant
          FOREIGN KEY (tenant_id)
          REFERENCES tenants(id)
          ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_install_tokens_tenant_created_at
        ON install_tokens (tenant_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_install_tokens_tenant_active
        ON install_tokens (tenant_id) WHERE revoked_at IS NULL;

      ALTER TABLE install_tokens ENABLE ROW LEVEL SECURITY;
      ALTER TABLE install_tokens FORCE ROW LEVEL SECURITY;
    `);

    const predicate = await resolveTenantRlsPredicate(
      queryRunner,
      'install_tokens',
    );
    const nullSafePredicate = predicate.replace(
      "current_setting('app.tenant_id', true)",
      "NULLIF(current_setting('app.tenant_id', true), '')",
    );
    const lookupPredicate = `(${nullSafePredicate} OR current_setting('app.install_token_lookup', true) = 'on')`;

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'install_tokens'
            AND policyname = 'install_tokens_tenant_select'
        ) THEN
          CREATE POLICY install_tokens_tenant_select ON install_tokens
            FOR SELECT USING (${lookupPredicate});
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'install_tokens'
            AND policyname = 'install_tokens_tenant_insert'
        ) THEN
          CREATE POLICY install_tokens_tenant_insert ON install_tokens
            FOR INSERT WITH CHECK (${predicate});
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'install_tokens'
            AND policyname = 'install_tokens_tenant_update'
        ) THEN
          CREATE POLICY install_tokens_tenant_update ON install_tokens
            FOR UPDATE USING (${lookupPredicate})
            WITH CHECK (${lookupPredicate});
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'install_tokens'
            AND policyname = 'install_tokens_tenant_delete'
        ) THEN
          CREATE POLICY install_tokens_tenant_delete ON install_tokens
            FOR DELETE USING (${predicate});
        END IF;
      END;
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_install_tokens_tenant_active;
      DROP INDEX IF EXISTS idx_install_tokens_tenant_created_at;
      DROP TABLE IF EXISTS install_tokens CASCADE;
    `);
  }
}
