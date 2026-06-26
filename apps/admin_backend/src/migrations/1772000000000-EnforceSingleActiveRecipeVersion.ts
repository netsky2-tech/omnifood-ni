import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnforceSingleActiveRecipeVersion1772000000000 implements MigrationInterface {
  name = 'EnforceSingleActiveRecipeVersion1772000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH ranked_versions AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY tenant_id, product_id
            ORDER BY version_number DESC, created_at DESC, id DESC
          ) AS row_number
        FROM recipe_versions
        WHERE is_active = true
      )
      UPDATE recipe_versions AS recipe_version
      SET
        is_active = false,
        fecha_fin_vigencia = COALESCE(
          recipe_version.fecha_fin_vigencia,
          recipe_version.published_at,
          recipe_version.fecha_inicio_vigencia,
          recipe_version.created_at,
          NOW()
        )
      FROM ranked_versions
      WHERE recipe_version.id = ranked_versions.id
        AND ranked_versions.row_number > 1
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_recipe_versions_active_product
      ON recipe_versions (tenant_id, product_id)
      WHERE is_active = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS idx_recipe_versions_active_product',
    );
  }
}
