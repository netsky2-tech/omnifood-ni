import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T10/F2a — canonicalize the UOM codes on the industry template SOURCE rows.
 *
 * The seed migration (1787000000000-CreateIndustryTemplatesAndDefaults) wrote
 * uppercase non-canonical spellings ('UN', 'KG', 'G', 'L', 'ML') into
 * template_products.uom and template_insumos.purchase_uom/consumption_uom,
 * while the platform UOM catalog (src/modules/inventory/uom-catalog.ts) is
 * anchored on lowercase singular codes ('unidad', 'kg', 'g', 'l', 'ml'). Every
 * tenant that applied a template inherited the non-canonical spellings, so
 * their UOM master data drifted from the catalog the S3 conversion invariant
 * resolves against (resolveUom normalizes to lowercase; 'UN' now resolves
 * through the 'un' alias heal, but the source data must be canonical itself).
 *
 * - Only EXACT uppercase matches are rewritten: rows already carrying a
   canonical value ('unidad', 'kg', ...) are left untouched, which makes every
   UPDATE idempotent.
 * - This repairs DATA only: no column is added or altered, so down() simply
   restores the original seed spellings.
 */
export class CanonicalizeTemplateUomCodes1809610000000 implements MigrationInterface {
  name = 'CanonicalizeTemplateUomCodes1809610000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE template_products
      SET uom = 'unidad'
      WHERE uom = 'UN'
    `);

    for (const [canonical, uppercase] of [
      ['kg', 'KG'],
      ['g', 'G'],
      ['l', 'L'],
      ['ml', 'ML'],
      ['unidad', 'UN'],
    ] as const) {
      await queryRunner.query(
        `
        UPDATE template_insumos
        SET purchase_uom = '${canonical}'
        WHERE purchase_uom = '${uppercase}'
      `,
      );
      await queryRunner.query(
        `
        UPDATE template_insumos
        SET consumption_uom = '${canonical}'
        WHERE consumption_uom = '${uppercase}'
      `,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE template_products
      SET uom = 'UN'
      WHERE uom = 'unidad'
    `);

    for (const [canonical, uppercase] of [
      ['kg', 'KG'],
      ['g', 'G'],
      ['l', 'L'],
      ['ml', 'ML'],
      ['unidad', 'UN'],
    ] as const) {
      await queryRunner.query(
        `
        UPDATE template_insumos
        SET purchase_uom = '${uppercase}'
        WHERE purchase_uom = '${canonical}'
      `,
      );
      await queryRunner.query(
        `
        UPDATE template_insumos
        SET consumption_uom = '${uppercase}'
        WHERE consumption_uom = '${canonical}'
      `,
      );
    }
  }
}
