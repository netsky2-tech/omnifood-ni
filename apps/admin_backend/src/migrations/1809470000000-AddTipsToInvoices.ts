import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Batch 7 Slice 1 — tip capture columns (PRD §21, Architecture Spec
 * §25.2 / §33.4, AD-10).
 *
 * Adds four nullable numeric columns to `invoices` for POS-captured tips:
 * `tip_amount_nio`, `tip_amount_usd`, `tip_percentage`, and
 * `tip_eligible_base_nio`.
 *
 * DGI / AD-10 rule: historical invoices are NEVER backfilled to 0. The
 * columns stay NULL for every pre-remediation row, representing "unknown /
 * not captured" rather than an explicit zero tip. There is deliberately NO
 * backfill and no column default.
 */
export class AddTipsToInvoices1809470000000 implements MigrationInterface {
  name = 'AddTipsToInvoices1809470000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS tip_amount_nio numeric(12, 2),
      ADD COLUMN IF NOT EXISTS tip_amount_usd numeric(12, 2),
      ADD COLUMN IF NOT EXISTS tip_percentage numeric(5, 2),
      ADD COLUMN IF NOT EXISTS tip_eligible_base_nio numeric(12, 2)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE invoices
      DROP COLUMN IF EXISTS tip_amount_nio,
      DROP COLUMN IF EXISTS tip_amount_usd,
      DROP COLUMN IF EXISTS tip_percentage,
      DROP COLUMN IF EXISTS tip_eligible_base_nio
    `);
  }
}
