import { MigrationInterface, QueryRunner } from 'typeorm';

/** Additive, immutable outcome and snapshot columns for invoices, invoice items, and sync receipts. */
export class AddSaleInventoryOutcomeColumns1803000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE invoices
        ADD COLUMN IF NOT EXISTS inventory_policy_version varchar(64),
        ADD COLUMN IF NOT EXISTS inventory_outcome varchar(64),
        ADD COLUMN IF NOT EXISTS inventory_outcome_reason jsonb;

      ALTER TABLE invoice_items
        ADD COLUMN IF NOT EXISTS inventory_snapshot_version varchar(64),
        ADD COLUMN IF NOT EXISTS inventory_snapshot jsonb;

      ALTER TABLE inventory_sync_receipts
        ADD COLUMN IF NOT EXISTS inventory_policy_version varchar(64),
        ADD COLUMN IF NOT EXISTS inventory_outcome varchar(64),
        ADD COLUMN IF NOT EXISTS inventory_outcome_reason jsonb,
        ADD COLUMN IF NOT EXISTS acknowledged_correlation_ids jsonb;
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    throw new Error('down migration forbidden: historical sale outcome fields are append-only');
  }
}
