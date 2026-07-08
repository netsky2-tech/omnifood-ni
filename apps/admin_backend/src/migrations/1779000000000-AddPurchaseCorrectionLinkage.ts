import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPurchaseCorrectionLinkage1779000000000 implements MigrationInterface {
  name = 'AddPurchaseCorrectionLinkage1779000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory_purchase_documents
      ADD COLUMN IF NOT EXISTS document_type varchar NOT NULL DEFAULT 'PURCHASE'
    `);

    await queryRunner.query(`
      ALTER TABLE inventory_purchase_documents
      ADD COLUMN IF NOT EXISTS correction_reason varchar
    `);

    await queryRunner.query(`
      ALTER TABLE inventory_purchase_documents
      ADD COLUMN IF NOT EXISTS correction_for_purchase_document_id varchar
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_inventory_purchase_documents_correction_origin
      ON inventory_purchase_documents (tenant_id, correction_for_purchase_document_id)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_purchase_documents_one_correction_per_origin
      ON inventory_purchase_documents (tenant_id, correction_for_purchase_document_id)
      WHERE correction_for_purchase_document_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Preserve append-only fiscal/audit correction metadata during rollback.
    await queryRunner.query('SELECT 1');
  }
}
