import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the per-line `recipe_version_id` column to `invoice_items` so that
 * historical sales keep the recipe version used at sale time (PRD UC-05).
 *
 * The column is nullable: legacy rows and non-prepared products do not carry
 * a version binding. When present, the backend prefers this id over the
 * mutable active recipe for BOM explosion and historical recosting.
 */
export class AddRecipeVersionIdToInvoiceItems1769000000000 implements MigrationInterface {
  name = 'AddRecipeVersionIdToInvoiceItems1769000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE invoice_items
      ADD COLUMN IF NOT EXISTS recipe_version_id varchar
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE invoice_items
      DROP COLUMN IF EXISTS recipe_version_id
    `);
  }
}
