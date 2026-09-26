import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #523 T1 — template products carry a real product type.
 *
 * `template_products` rows had no `product_type` at all, so every product
 * created by applying an industry template fell back to the entity default
 * `SIMPLE`. A `SIMPLE` product is structurally incapable of consuming
 * insumos (the POS planner maps simple → noImpact and the cloud recipe
 * branch only admits PREPARED | COMPOUND), so recipe-bearing template
 * products were permanently inert even after their suggestion was published.
 *
 * - The column is a NULLABLE varchar (not a Postgres enum, no DB default):
 *   `template_products` is a global catalog table whose columns are all
 *   varchar, the values match the `ProductType` enum members the `products`
 *   table uses, and "absent" must stay distinguishable from "explicitly
 *   SIMPLE" — a NOT NULL DEFAULT 'SIMPLE' would silently declare SIMPLE on
 *   every row inserted without a type (synchronize-built schemas, future
 *   tooling) and turn "not declared" into an apply-time data error instead
 *   of an honest shape-based resolution.
 * - The backfill resolves every pre-existing NULL by the row's own shape:
 *   recipe items → 'COMPOUND', otherwise → 'SIMPLE'. After it runs, no
 *   migration-era row is left NULL and no explicit author declaration is
 *   ever clobbered, which also makes both UPDATEs idempotent.
 * - No seeded template row is left contradictory: the CAFETERIA and
 *   BAR_RESTAURANTE seed rows (1787000000000-CreateIndustryTemplatesAndDefaults)
 *   all carry recipe items and all come out 'COMPOUND'; the four
 *   RETAIL_MINIMARKET rows carry none and come out 'SIMPLE'.
 */
export class AddProductTypeToTemplateProducts1809500000000 implements MigrationInterface {
  name = 'AddProductTypeToTemplateProducts1809500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE template_products
      ADD COLUMN IF NOT EXISTS product_type varchar
    `);

    await queryRunner.query(`
      UPDATE template_products AS tp
      SET product_type = 'COMPOUND'
      WHERE tp.product_type IS NULL
        AND EXISTS (
          SELECT 1 FROM template_recipe_items AS tri
          WHERE tri.template_product_id = tp.id
        )
    `);

    await queryRunner.query(`
      UPDATE template_products AS tp
      SET product_type = 'SIMPLE'
      WHERE tp.product_type IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM template_recipe_items AS tri
          WHERE tri.template_product_id = tp.id
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // The column only annotates rows; dropping it reverses this migration
    // completely without destroying template or recipe-item data.
    await queryRunner.query(
      'ALTER TABLE template_products DROP COLUMN IF EXISTS product_type',
    );
  }
}
