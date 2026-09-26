import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #551 U3 — fiscal cloud projection columns.
 *
 * The POS sync payload (SalesMapper.toSyncJson) emits `shiftId` (cashier
 * session UUID, the same value semantics as cash_movements.shift_id) and
 * `localIssueDate` (ISO YYYY-MM-DD, fixed at issuance on-device). Both are
 * nullable: the facts never existed server-side for invoices synced before
 * this change (D-9), so there is deliberately NO backfill.
 *
 * These facts make the D-15 void guard ("own invoice + open current shift +
 * same local calendar date") expressible server-side later; they are fiscal
 * evidence, so `down` preserves them (fiscal facts are never deleted).
 */
export class AddShiftIdAndLocalIssueDateToInvoices1809400000000 implements MigrationInterface {
  name = 'AddShiftIdAndLocalIssueDateToInvoices1809400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS shift_id uuid,
      ADD COLUMN IF NOT EXISTS local_issue_date date
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Preserve shift_id / local_issue_date during rollback: dropping them
    // would destroy fiscal issuance evidence (DGI: invoices are never
    // destroyed) and silently re-widen the cloud mirror divergence.
    await queryRunner.query('SELECT 1');
  }
}
