import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeterministicSyncSequencing1780000000000 implements MigrationInterface {
  name = 'AddDeterministicSyncSequencing1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory_sync_receipts
      ADD COLUMN IF NOT EXISTS flow_type varchar NOT NULL DEFAULT 'inventory'
    `);
    await queryRunner.query(`
      ALTER TABLE inventory_sync_receipts
      ADD COLUMN IF NOT EXISTS result_status varchar NOT NULL DEFAULT 'ACCEPTED'
    `);
    await queryRunner.query(`
      ALTER TABLE inventory_sync_receipts
      ADD COLUMN IF NOT EXISTS result_code varchar
    `);

    await queryRunner.query(`
      ALTER TABLE inventory_sync_outbox
      ADD COLUMN IF NOT EXISTS flow_type varchar NOT NULL DEFAULT 'inventory'
    `);
    await queryRunner.query(`
      ALTER TABLE inventory_sync_outbox
      ADD COLUMN IF NOT EXISTS payload_hash varchar NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      ALTER TABLE inventory_sync_outbox
      ADD COLUMN IF NOT EXISTS result_code varchar
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS uq_inventory_sync_receipts_identity
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_sync_receipts_stream_sequence
      ON inventory_sync_receipts (tenant_id, source_device_id, flow_type, source_sequence)
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS uq_inventory_sync_outbox_source_seq
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_sync_outbox_stream_sequence
      ON inventory_sync_outbox (tenant_id, source_device_id, flow_type, source_sequence)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Preserve append-only sync metadata during rollback.
    await queryRunner.query('SELECT 1');
  }
}
