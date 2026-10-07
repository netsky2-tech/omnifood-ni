import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Factura con nombre (odd/factura-con-nombre).
 *
 * Adds nullable customer_name and customer_tax_id columns to `invoices`.
 * These fields store the fiscal snapshot as issued on the printed ticket.
 * Nullable because historical rows and anonymous cash sales (Consumidor Final /
 * Cliente Contado) have no customer data.
 *
 * In accordance with DGI Disposición Técnica 09-2007 (invoices are never
 * destroyed), rollback preserves these columns.
 */
export class AddCustomerSnapshotToInvoices1809590000000 implements MigrationInterface {
  name = 'AddCustomerSnapshotToInvoices1809590000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS customer_name varchar,
      ADD COLUMN IF NOT EXISTS customer_tax_id varchar
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Preserve customer_name / customer_tax_id during rollback:
    // dropping them would destroy fiscal issuance evidence (DGI compliance).
    await queryRunner.query('SELECT 1');
  }
}
