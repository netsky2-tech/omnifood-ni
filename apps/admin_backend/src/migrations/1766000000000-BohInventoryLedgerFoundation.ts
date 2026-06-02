import { MigrationInterface, QueryRunner } from 'typeorm';

export class BohInventoryLedgerFoundation1766000000000 implements MigrationInterface {
  name = 'BohInventoryLedgerFoundation1766000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS inventory_kardex (
        id BIGSERIAL PRIMARY KEY,
        tenant_id varchar NOT NULL,
        insumo_id uuid NOT NULL,
        movement_type varchar NOT NULL,
        quantity NUMERIC(14,4) NOT NULL,
        unit_cost_nio NUMERIC(14,4) NOT NULL,
        total_cost_nio NUMERIC(14,4) NOT NULL,
        stock_before NUMERIC(14,4) NOT NULL,
        stock_after NUMERIC(14,4) NOT NULL,
        source_document_type varchar NOT NULL,
        source_document_id varchar NOT NULL,
        source_device_id varchar,
        source_sequence bigint,
        compensation_for_kardex_id bigint,
        occurred_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_inventory_kardex_tenant_insumo_id
      ON inventory_kardex (tenant_id, insumo_id, id)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_kardex_source_sequence
      ON inventory_kardex (tenant_id, source_device_id, source_sequence)
      WHERE source_device_id IS NOT NULL AND source_sequence IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS inventory_sync_outbox (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id varchar NOT NULL,
        idempotency_key varchar NOT NULL,
        source_device_id varchar NOT NULL,
        source_sequence bigint NOT NULL,
        document_type varchar NOT NULL,
        payload jsonb NOT NULL,
        status varchar NOT NULL DEFAULT 'PENDING',
        last_error varchar,
        sent_at timestamptz,
        acknowledged_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_sync_outbox_idempotency
      ON inventory_sync_outbox (tenant_id, idempotency_key)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_sync_outbox_source_seq
      ON inventory_sync_outbox (tenant_id, source_device_id, source_sequence)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS inventory_sync_receipts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id varchar NOT NULL,
        idempotency_key varchar NOT NULL,
        source_device_id varchar NOT NULL,
        source_sequence bigint NOT NULL,
        received_at timestamptz NOT NULL DEFAULT now(),
        payload_hash varchar NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_sync_receipts_identity
      ON inventory_sync_receipts (tenant_id, source_device_id, source_sequence)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS forensic_alerts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id varchar NOT NULL,
        alert_type varchar NOT NULL,
        severity varchar NOT NULL,
        actor_role varchar,
        message varchar NOT NULL,
        metadata jsonb,
        resolved_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_forensic_alerts_tenant_created_at
      ON forensic_alerts (tenant_id, created_at DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS idx_forensic_alerts_tenant_created_at',
    );
    await queryRunner.query('DROP TABLE IF EXISTS forensic_alerts');

    await queryRunner.query(
      'DROP INDEX IF EXISTS uq_inventory_sync_receipts_identity',
    );
    await queryRunner.query('DROP TABLE IF EXISTS inventory_sync_receipts');

    await queryRunner.query(
      'DROP INDEX IF EXISTS uq_inventory_sync_outbox_source_seq',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS uq_inventory_sync_outbox_idempotency',
    );
    await queryRunner.query('DROP TABLE IF EXISTS inventory_sync_outbox');

    await queryRunner.query(
      'DROP INDEX IF EXISTS uq_inventory_kardex_source_sequence',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS idx_inventory_kardex_tenant_insumo_id',
    );
    await queryRunner.query('DROP TABLE IF EXISTS inventory_kardex');
  }
}
