import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner Dashboard V2, architecture spec v0.3 §15.3 — card reconciliation
 * summary indexing.
 *
 * The spec asks for an index equivalent to (tenant_id,
 * reconciliation_status, created_at). invoice_payments is parent-owned (no
 * tenant_id column; isolation flows through the invoices join), so the
 * closest equivalent is (reconciliation_status, created_at): the summary's
 * pending filter (reconciliation_status = 'PENDIENTE') and its oldest-row
 * MIN(created_at) read through it. No adequate index existed (only
 * idx_ip_invoice on invoice_id).
 *
 * Additive and idempotent; `down` removes only the index.
 */
export class AddCardReconciliationStatusIndex1809460000000 implements MigrationInterface {
  name = 'AddCardReconciliationStatusIndex1809460000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ip_reconciliation_status
      ON invoice_payments (reconciliation_status, created_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_ip_reconciliation_status
    `);
  }
}
