import type { MigrationInterface, QueryRunner } from 'typeorm';
import { resolveTenantRlsPredicate } from '../core/database/tenant-rls-policy';

/**
 * Company identity parity P3, slice 1
 * (odd/tasks/identidad-empresa-paridad.md, S5) — the cloud becomes the owner
 * of the company logo's ORIGINAL.
 *
 * Why a dedicated tenant-scoped asset table and NOT a column on `tenants`:
 * the fiscal snapshot builder (fiscal-config-version.service.ts) reads the
 * tenant row on EVERY snapshot construction; a blob column there would drag
 * the whole logo into every one of those reads. It is also not a jsonb
 * parameter: base64 in a jsonb param inflates the payload by a third and
 * invites the versioned fiscal payload to carry copies of the logo — the
 * snapshot travels a REFERENCE (the sha256), never the bytes (S5).
 *
 * One row per tenant (uq_tenant_brand_assets_tenant): the table holds THE
 * original, not a history. An upload REPLACES the row in place — a rejected
 * upload never touches it, so the previous logo survives intact.
 *
 * `bytes` is the FIRST bytea column in the repo (verified: 0 matches before
 * this migration); there is no multer and no server-side staging, so the
 * upload arrives as base64 JSON and is decoded and validated (content type,
 * magic bytes, decodability, size ceiling) BEFORE this row is written.
 *
 * RLS: the table carries its own uuid tenant_id, so it is classified
 * `direct:SIU` in scripts/schema-rls-coverage-manifest.txt — the row is
 * selected, inserted once and replaced by update; there is no delete path
 * (removing a logo is not part of this slice, and the absence of a DELETE
 * policy is the contract, same school as the append-only ledgers). The
 * entry MUST be added to the manifest with this table: the gate that fails
 * without it is scripts/verify-schema-build.sh.
 */
export class CreateTenantBrandAssets1809980000000 implements MigrationInterface {
  name = 'CreateTenantBrandAssets1809980000000';

  private static readonly TABLE = 'tenant_brand_assets';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = CreateTenantBrandAssets1809980000000.TABLE;

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ${table} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        content_type varchar NOT NULL,
        byte_length integer NOT NULL,
        sha256 varchar(64) NOT NULL,
        bytes bytea NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_tenant_brand_assets_byte_length_positive
          CHECK (byte_length > 0),
        CONSTRAINT uq_tenant_brand_assets_tenant
          UNIQUE (tenant_id),
        CONSTRAINT uq_tenant_brand_assets_tenant_id
          UNIQUE (tenant_id, id),
        CONSTRAINT fk_tenant_brand_assets_tenant
          FOREIGN KEY (tenant_id) REFERENCES tenants (id)
      )
    `);

    // RLS: own tenant_id -> `direct` with a per-command policy set. SIU —
    // the logo is replaced in place, never deleted; no DELETE policy exists
    // and the manifest declares exactly that set.
    await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);

    const tenantPredicate = await resolveTenantRlsPredicate(queryRunner, table);

    const policies = [
      ['select', `FOR SELECT USING (${tenantPredicate})`],
      ['insert', `FOR INSERT WITH CHECK (${tenantPredicate})`],
      [
        'update',
        `FOR UPDATE USING (${tenantPredicate}) WITH CHECK (${tenantPredicate})`,
      ],
    ] as const;

    for (const [operation, clause] of policies) {
      await queryRunner.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = current_schema()
              AND tablename = '${table}'
              AND policyname = '${table}_tenant_${operation}'
          ) THEN
            CREATE POLICY ${table}_tenant_${operation} ON ${table}
            ${clause};
          END IF;
        END;
        $$
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = CreateTenantBrandAssets1809980000000.TABLE;

    // The stored bytes are the tenant's brand original, so a populated table
    // is refused rather than dropped silently — the same guard the house
    // uses for its evidence tables (1809960000000-CreateCountSessions).
    // FORCE RLS would hide the rows from this count, so RLS is lifted
    // locally to inspect the true row count and restored before refusing.
    await queryRunner.query(`
      ALTER TABLE ${table} NO FORCE ROW LEVEL SECURITY;
      ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY;
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM ${table} LIMIT 1) THEN
          ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
          ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
          RAISE EXCEPTION 'refusing to remove tenant_brand_assets: brand asset rows exist';
        END IF;
      END $$;
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS ${table}`);
  }
}
