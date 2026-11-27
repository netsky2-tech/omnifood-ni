import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #539 S4 (DT 09-2007 ordinal SEGUNDO 1.7 & 1.8):
 * Every computerized invoice must persist and display its fiscal payment
 * condition ('CONTADO' or 'CREDITO'), separate from settlement status
 * (`payment_status`). Existing cash-only rows default to 'CONTADO' without
 * mutating `invoice_number`.
 */
export class AddPaymentConditionToInvoices1811000000000 implements MigrationInterface {
  name = 'AddPaymentConditionToInvoices1811000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS payment_condition varchar(16) NOT NULL DEFAULT 'CONTADO'
    `);

    await queryRunner.query(`
      ALTER TABLE invoices
      DROP CONSTRAINT IF EXISTS chk_invoices_payment_condition
    `);

    await queryRunner.query(`
      ALTER TABLE invoices
      ADD CONSTRAINT chk_invoices_payment_condition
      CHECK (payment_condition IN ('CONTADO', 'CREDITO'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE invoices
      DROP CONSTRAINT IF EXISTS chk_invoices_payment_condition
    `);

    await queryRunner.query(`
      ALTER TABLE invoices
      DROP COLUMN IF EXISTS payment_condition
    `);
  }
}
