import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds recipe-version ingestion columns so the backend can consume POS
 * recipe-version documents posted to `POST /inventory/recipes/versions`
 * (pre-Batch 3 cleanup slice).
 *
 * Columns are nullable/defaulted so existing rows keep working and no prior
 * recipe version or detail is deleted (DGI/audit invariants).
 *
 * Adds:
 * - recipe_versions.pos_document_id   : idempotency key (tenant + pos doc id)
 * - recipe_versions.product_name      : product name snapshot
 * - recipe_versions.yield_quantity     : batch yield (default 1)
 * - recipe_versions.technical_shrink_pct : version-level shrink snapshot
 * - recipe_versions.version_note       : publisher note
 * - recipe_versions.published_at       : POS publish timestamp
 * - recipe_versions.pos_created_at     : POS document createdAt
 * - recipe_details.ingredient_name    : ingredient name snapshot
 * - recipe_details.ingredient_type    : 'INSUMO' | 'SUB_RECIPE'
 * - recipe_details.component_uom      : per-component UOM from POS
 * - recipe_details.reference_version_id : SUB_RECIPE reference (future use)
 *
 * Plus a unique partial index for idempotent ingestion by
 * (tenant_id, pos_document_id).
 */
export class AddRecipeVersionIngestionColumns1771000000000
  implements MigrationInterface
{
  name = 'AddRecipeVersionIngestionColumns1771000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE recipe_versions
        ADD COLUMN IF NOT EXISTS pos_document_id varchar,
        ADD COLUMN IF NOT EXISTS product_name varchar,
        ADD COLUMN IF NOT EXISTS yield_quantity NUMERIC(14,4) NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS technical_shrink_pct NUMERIC(14,4) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS version_note varchar,
        ADD COLUMN IF NOT EXISTS published_at timestamptz,
        ADD COLUMN IF NOT EXISTS pos_created_at timestamptz
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_recipe_versions_tenant_pos_doc
      ON recipe_versions (tenant_id, pos_document_id)
      WHERE pos_document_id IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE recipe_details
        ADD COLUMN IF NOT EXISTS ingredient_name varchar,
        ADD COLUMN IF NOT EXISTS ingredient_type varchar NOT NULL DEFAULT 'INSUMO',
        ADD COLUMN IF NOT EXISTS component_uom varchar,
        ADD COLUMN IF NOT EXISTS reference_version_id varchar
    `);

    // Existing rows predate the gross/yield refactor; backfill gross_quantity
    // and technical_shrink_pct from quantity so the snapshot is not empty.
    await queryRunner.query(`
      UPDATE recipe_details
        SET gross_quantity = quantity
        WHERE gross_quantity = 0 AND quantity <> 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE recipe_details
        DROP COLUMN IF EXISTS reference_version_id,
        DROP COLUMN IF EXISTS component_uom,
        DROP COLUMN IF EXISTS ingredient_type,
        DROP COLUMN IF EXISTS ingredient_name
    `);

    await queryRunner.query(
      'DROP INDEX IF EXISTS idx_recipe_versions_tenant_pos_doc',
    );

    await queryRunner.query(`
      ALTER TABLE recipe_versions
        DROP COLUMN IF EXISTS pos_created_at,
        DROP COLUMN IF EXISTS published_at,
        DROP COLUMN IF EXISTS version_note,
        DROP COLUMN IF EXISTS technical_shrink_pct,
        DROP COLUMN IF EXISTS yield_quantity,
        DROP COLUMN IF EXISTS product_name,
        DROP COLUMN IF EXISTS pos_document_id
    `);
  }
}
