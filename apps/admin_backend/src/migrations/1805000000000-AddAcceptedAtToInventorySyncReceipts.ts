import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAcceptedAtToInventorySyncReceipts1805000000000 implements MigrationInterface {
  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE inventory_sync_receipts ADD COLUMN IF NOT EXISTS accepted_at timestamptz;`);
  }
  public async down(qr: QueryRunner): Promise<void> {
    const res = await qr.query(`SELECT 1 FROM inventory_sync_receipts WHERE accepted_at IS NOT NULL LIMIT 1;`);
    if (res?.length) throw new Error('down migration forbidden: historical accepted_at evidence exists');
    await qr.query(`ALTER TABLE inventory_sync_receipts DROP COLUMN IF EXISTS accepted_at;`);
  }
}
