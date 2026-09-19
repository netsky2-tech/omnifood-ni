import { MigrationInterface, QueryRunner } from 'typeorm';
import { resolveTenantRlsPredicate } from '../core/database/tenant-rls-policy';

export class CreateSystemParametersConfig1784000000000 implements MigrationInterface {
  name = 'CreateSystemParametersConfig1784000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sys_parametros_config (
        id BIGSERIAL PRIMARY KEY,
        tenant_id varchar NOT NULL,
        param_key varchar NOT NULL,
        param_value jsonb NOT NULL,
        version integer NOT NULL DEFAULT 1,
        effective_from timestamptz NOT NULL DEFAULT now(),
        effective_to timestamptz,
        is_active boolean NOT NULL DEFAULT true,
        created_by varchar,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_parametros_config_tenant_key_version
        ON sys_parametros_config (tenant_id, param_key, version);
      
      CREATE INDEX IF NOT EXISTS idx_sys_parametros_config_tenant_key_active
        ON sys_parametros_config (tenant_id, param_key, is_active, effective_from DESC);
    `);

    // Append-only enforcement: reject UPDATE and DELETE
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION reject_sys_parametros_config_mutation()
      RETURNS trigger
      AS $$
      BEGIN
        RAISE EXCEPTION 'sys_parametros_config is append-only: UPDATE and DELETE are forbidden';
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_sys_parametros_config_immutable ON sys_parametros_config;
      CREATE TRIGGER trg_sys_parametros_config_immutable
      BEFORE UPDATE OR DELETE ON sys_parametros_config
      FOR EACH ROW
      EXECUTE FUNCTION reject_sys_parametros_config_mutation();
    `);

    // Enable Row-Level Security
    await queryRunner.query(`
      ALTER TABLE sys_parametros_config ENABLE ROW LEVEL SECURITY;
      ALTER TABLE sys_parametros_config FORCE ROW LEVEL SECURITY;
    `);

    // The policy predicate must match the tenant_id column's real type, so it
    // is resolved through the shared type-aware resolver (one resolution for
    // this table, never shared) instead of hardcoding a form. The column is
    // known to exist by now — the table was created earlier in this up() — so
    // the resolution works identically on a first run (varchar) and on a
    // partial-ledger re-run after the column has been rebound (uuid).
    const tenantPredicate = await resolveTenantRlsPredicate(
      queryRunner,
      'sys_parametros_config',
    );

    await queryRunner.query(`
      DROP POLICY IF EXISTS sys_parametros_config_tenant_isolation ON sys_parametros_config;
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'sys_parametros_config'
            AND policyname = 'sys_parametros_config_tenant_isolation'
        ) THEN
          CREATE POLICY sys_parametros_config_tenant_isolation ON sys_parametros_config
            FOR ALL
            USING (${tenantPredicate})
            WITH CHECK (${tenantPredicate});
        END IF;
      END;
      $$;
    `);

    // Active configuration view with security_invoker = true to respect RLS
    await queryRunner.query(`
      CREATE OR REPLACE VIEW v_sys_parametros_config_active
      WITH (security_invoker = true)
      AS
      SELECT DISTINCT ON (tenant_id, param_key)
        id,
        tenant_id,
        param_key,
        param_value,
        version,
        effective_from,
        effective_to,
        is_active,
        created_by,
        created_at
      FROM sys_parametros_config
      WHERE is_active = true
        AND (effective_to IS NULL OR effective_to > now())
      ORDER BY tenant_id, param_key, version DESC, effective_from DESC;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP VIEW IF EXISTS v_sys_parametros_config_active;`,
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS sys_parametros_config_tenant_isolation ON sys_parametros_config;`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_sys_parametros_config_immutable ON sys_parametros_config;`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS reject_sys_parametros_config_mutation();`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS sys_parametros_config;`);
  }
}
