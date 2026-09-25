import { MigrationInterface, QueryRunner } from 'typeorm';

import {
  assignUniqueTenantSlug,
  normalizeTenantSlug,
} from '../modules/tenant/tenant-slug';

/**
 * Adds the stable tenant slug (issue #556 slice 11, OD-03 founder design).
 *
 * Why this exists
 * ---------------
 * Cloud login gains an optional `tenantSlug` that the server resolves to a
 * tenant id BEFORE binding the transaction context and looking up the user.
 * The slug is pre-auth CONTEXT, never authority: post-login authority stays
 * the JWT `tenant_id`, and the legacy no-slug login path keeps working
 * unchanged during the migration window.
 *
 * Contract
 * --------
 * - `tenants.slug` is varchar, NOT NULL, globally unique via the
 *   `uq_tenants_slug` index. The entity deliberately carries no `unique`
 *   decorator: the index below is the single source of uniqueness.
 * - Values are backfilled from `name` through the canonical normalization
 *   rule (src/modules/tenant/tenant-slug.ts): lowercase, whitespace runs ->
 *   '-', strip to [a-z0-9-], trim leading/trailing '-', cap at 50 chars on a
 *   dash boundary. Collisions resolve deterministically with -2, -3, ...
 *   suffixes, processed in (created_at, id) order.
 * - Idempotent for the partial-ledger scenario (verify-schema-build.sh
 *   re-runs this migration against an existing schema): ADD COLUMN IF NOT
 *   EXISTS, backfill only slug IS NULL rows (existing slugs are never
 *   rewritten), CREATE UNIQUE INDEX IF NOT EXISTS, SET NOT NULL.
 * - Reversible as DERIVED DATA (documented decision): down() drops exactly
 *   the index and the column. Nothing else in the schema or in application
 *   behavior depends on the stored values, and up() re-derives identical
 *   slugs from the unchanged `name` column, so a down/up cycle loses no
 *   information.
 */
export class AddTenantSlug1809350000000 implements MigrationInterface {
  name = 'AddTenantSlug1809350000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slug varchar`,
    );

    // Deterministic backfill: read the not-yet-derived rows in stable order,
    // resolve collisions in memory against every slug that already exists,
    // and write each value back as a bound parameter.
    const pendingRows = (await queryRunner.query(
      `SELECT id, name FROM tenants WHERE slug IS NULL ORDER BY created_at, id`,
    )) as Array<{ id: string; name: string }>;

    if (pendingRows.length > 0) {
      const takenRows = (await queryRunner.query(
        `SELECT slug FROM tenants WHERE slug IS NOT NULL`,
      )) as Array<{ slug: string }>;
      const taken = new Set(takenRows.map((row) => row.slug));

      for (const { id, name } of pendingRows) {
        const slug = assignUniqueTenantSlug(normalizeTenantSlug(name), taken);
        taken.add(slug);
        await queryRunner.query(`UPDATE tenants SET slug = $1 WHERE id = $2`, [
          slug,
          id,
        ]);
      }
    }

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_tenants_slug ON tenants (slug)`,
    );
    await queryRunner.query(
      `ALTER TABLE tenants ALTER COLUMN slug SET NOT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_tenants_slug`);
    await queryRunner.query(`ALTER TABLE tenants DROP COLUMN IF EXISTS slug`);
  }
}
