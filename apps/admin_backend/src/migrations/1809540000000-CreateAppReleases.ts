import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates app_releases for OTA application distribution and update discovery.
 *
 * Why this table is GLOBAL (no tenant_id, no RLS)
 * -----------------------------------------------
 * Software releases are platform-wide binaries published once per channel and
 * target ABI (e.g. arm64-v8a for POS terminals). One build serves all tenants
 * uniformly. Releasing is platform infrastructure, not tenant data.
 *
 * It is classified as `global` in scripts/schema-rls-coverage-manifest.txt:
 * platform infrastructure with no tenant_id column, satisfying the systemic
 * RLS invariant (evaluateTenantRlsCoverage).
 */
export class CreateAppReleases1809540000000 implements MigrationInterface {
  name = 'CreateAppReleases1809540000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE app_releases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        channel VARCHAR(32) NOT NULL,
        abi VARCHAR(32) NOT NULL,
        version_code INTEGER NOT NULL,
        version_name VARCHAR(32) NOT NULL,
        sha256 VARCHAR(64) NOT NULL,
        size_bytes BIGINT NOT NULL,
        storage_key VARCHAR(255) NOT NULL,
        min_from_version_code INTEGER NOT NULL,
        mandatory BOOLEAN NOT NULL DEFAULT FALSE,
        notes TEXT,
        published_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_app_releases_channel_abi_version_code UNIQUE (channel, abi, version_code)
      );

      CREATE INDEX idx_app_releases_lookup ON app_releases (channel, abi, version_code DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS app_releases;
    `);
  }
}
