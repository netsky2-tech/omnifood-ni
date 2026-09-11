import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInventoryRemediationReceipts1806000000000 implements MigrationInterface {
  name = 'CreateInventoryRemediationReceipts1806000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS inventory_remediation_receipts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id varchar(128) NOT NULL,
        idempotency_key varchar(255) NOT NULL,
        command_type varchar(64) NOT NULL DEFAULT 'SALE_INVENTORY_REMEDIATION',
        request_hash varchar(64) NOT NULL,
        source_invoice_id uuid NOT NULL,
        source_inventory_receipt_id uuid NOT NULL,
        recipe_version_id uuid NOT NULL,
        actor_user_id varchar(128) NOT NULL,
        actor_role varchar(64) NOT NULL,
        reason text NOT NULL,
        status varchar(32) NOT NULL DEFAULT 'APPLIED',
        result jsonb NOT NULL DEFAULT '{}',
        audit_event_id uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_inventory_remediation_receipts_idempotency UNIQUE (tenant_id, idempotency_key),
        CONSTRAINT uq_inventory_remediation_receipts_source_command UNIQUE (tenant_id, source_invoice_id, command_type)
      );

      CREATE INDEX IF NOT EXISTS idx_inventory_remediation_receipts_tenant_created
        ON inventory_remediation_receipts (tenant_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_inventory_remediation_receipts_source_receipt
        ON inventory_remediation_receipts (tenant_id, source_inventory_receipt_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_remediation_receipts_recipe_version
        ON inventory_remediation_receipts (tenant_id, recipe_version_id);

      ALTER TABLE inventory_remediation_receipts ENABLE ROW LEVEL SECURITY;
      ALTER TABLE inventory_remediation_receipts FORCE ROW LEVEL SECURITY;

      CREATE POLICY remediation_receipts_select ON inventory_remediation_receipts
        FOR SELECT USING (tenant_id = current_setting('app.tenant_id', true));

      CREATE POLICY remediation_receipts_insert ON inventory_remediation_receipts
        FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      CREATE OR REPLACE FUNCTION guard_remediation_receipt_immutability() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
          RAISE EXCEPTION 'inventory_remediation_receipts is append-only';
        END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_guard_remediation_receipt_immutability ON inventory_remediation_receipts;
      CREATE TRIGGER trg_guard_remediation_receipt_immutability
        BEFORE UPDATE OR DELETE ON inventory_remediation_receipts
        FOR EACH ROW
        EXECUTE FUNCTION guard_remediation_receipt_immutability();

      DROP TRIGGER IF EXISTS trg_guard_remediation_receipt_immutability_stmt ON inventory_remediation_receipts;
      CREATE TRIGGER trg_guard_remediation_receipt_immutability_stmt
        BEFORE UPDATE OR DELETE ON inventory_remediation_receipts
        FOR EACH STATEMENT
        EXECUTE FUNCTION guard_remediation_receipt_immutability();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM inventory_remediation_receipts LIMIT 1) THEN
          RAISE EXCEPTION 'down migration forbidden: historical remediation receipts exist';
        END IF;
      END $$;

      DROP TRIGGER IF EXISTS trg_guard_remediation_receipt_immutability_stmt ON inventory_remediation_receipts;
      DROP TRIGGER IF EXISTS trg_guard_remediation_receipt_immutability ON inventory_remediation_receipts;
      DROP FUNCTION IF EXISTS guard_remediation_receipt_immutability();
      DROP TABLE IF EXISTS inventory_remediation_receipts CASCADE;
    `);
  }
}
