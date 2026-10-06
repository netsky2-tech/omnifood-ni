import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backlog #68 slice S2 — the shift close carries the voucher state.
 *
 * Adds three nullable integer columns to `cash_shift_sessions`: the
 * counts of card payments attached to the shift's invoices by
 * reconciliation status (card_vouchers_pending / card_vouchers_reconciled
 * / card_vouchers_overridden). The POS pushes them in the closed
 * shift-session sync payload (`cardVouchersPending` etc.), so the cloud
 * and the owner dashboard can see a shift that closed with pending
 * vouchers or overrides instead of only the terminal's pre-close guard.
 *
 * Nullable with default NULL and deliberately NO backfill: shifts closed
 * before this change never reported a voucher snapshot (D-9), and an
 * open session pushes no counts at all. NULL means "not reported",
 * never zero — consumers must not treat it as a genuine zero count.
 *
 * Additive and idempotent (`IF NOT EXISTS`); `down` removes only these
 * columns.
 */
export class AddCardVoucherCountsToCashShiftSessions1809580000000 implements MigrationInterface {
  name = 'AddCardVoucherCountsToCashShiftSessions1809580000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE cash_shift_sessions
      ADD COLUMN IF NOT EXISTS card_vouchers_pending integer DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS card_vouchers_reconciled integer DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS card_vouchers_overridden integer DEFAULT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE cash_shift_sessions
      DROP COLUMN IF EXISTS card_vouchers_pending,
      DROP COLUMN IF EXISTS card_vouchers_reconciled,
      DROP COLUMN IF EXISTS card_vouchers_overridden
    `);
  }
}
