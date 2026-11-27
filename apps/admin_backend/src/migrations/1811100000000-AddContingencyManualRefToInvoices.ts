import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #539 S3 (DT 09-2007 Ordinal TERCERO 3.3.a / 3.3.b):
 * Manual contingency invoice back-entry reference columns, completeness CHECK,
 * anti-collision CHECK against computerized invoice_number, and unique partial
 * index preventing duplicate back-entry of the same active manual ticket per tenant.
 */
export class AddContingencyManualRefToInvoices1811100000000 implements MigrationInterface {
  name = 'AddContingencyManualRefToInvoices1811100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS contingency_manual_series varchar(32) NULL,
      ADD COLUMN IF NOT EXISTS contingency_manual_number varchar(32) NULL,
      ADD COLUMN IF NOT EXISTS contingency_manual_issued_at date NULL
    `);

    await queryRunner.query(`
      ALTER TABLE invoices
      DROP CONSTRAINT IF EXISTS chk_invoices_contingency_manual_ref_complete
    `);

    await queryRunner.query(`
      ALTER TABLE invoices
      ADD CONSTRAINT chk_invoices_contingency_manual_ref_complete
      CHECK (
        (
          contingency_manual_series IS NULL
          AND contingency_manual_number IS NULL
          AND contingency_manual_issued_at IS NULL
        )
        OR (
          contingency_manual_series IS NOT NULL
          AND contingency_manual_number IS NOT NULL
          AND contingency_manual_issued_at IS NOT NULL
          AND btrim(contingency_manual_series) <> ''
          AND btrim(contingency_manual_number) <> ''
        )
      )
    `);

    await queryRunner.query(`
      ALTER TABLE invoices
      DROP CONSTRAINT IF EXISTS chk_invoices_contingency_not_same_as_system_number
    `);

    await queryRunner.query(`
      ALTER TABLE invoices
      ADD CONSTRAINT chk_invoices_contingency_not_same_as_system_number
      CHECK (
        contingency_manual_series IS NULL
        OR (
          upper(btrim(contingency_manual_series || '-' || contingency_manual_number)) <> upper(btrim(invoice_number))
          AND upper(btrim(contingency_manual_number)) <> upper(btrim(invoice_number))
        )
      )
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS uq_invoices_tenant_contingency_manual_ref
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_invoices_tenant_contingency_manual_ref
      ON invoices (
        tenant_id,
        upper(btrim(contingency_manual_series)),
        upper(btrim(contingency_manual_number))
      )
      WHERE contingency_manual_series IS NOT NULL AND is_canceled = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS uq_invoices_tenant_contingency_manual_ref
    `);

    await queryRunner.query(`
      ALTER TABLE invoices
      DROP CONSTRAINT IF EXISTS chk_invoices_contingency_not_same_as_system_number
    `);

    await queryRunner.query(`
      ALTER TABLE invoices
      DROP CONSTRAINT IF EXISTS chk_invoices_contingency_manual_ref_complete
    `);

    await queryRunner.query(`
      ALTER TABLE invoices
      DROP COLUMN IF EXISTS contingency_manual_issued_at,
      DROP COLUMN IF EXISTS contingency_manual_number,
      DROP COLUMN IF EXISTS contingency_manual_series
    `);
  }
}
