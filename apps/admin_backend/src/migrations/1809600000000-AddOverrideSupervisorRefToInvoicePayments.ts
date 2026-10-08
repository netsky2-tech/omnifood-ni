import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Manual voucher override — supervisor credential separation (odd/
 * soho-voucher-reconciliation-identity).
 *
 * Adds a single nullable text column `override_supervisor_ref` to
 * `invoice_payments`: the supervisor credential the operator TYPED at
 * override time, stored verbatim and unvalidated. It is declared evidence,
 * deliberately NOT a foreign key to `users` — no constraint, no join.
 *
 * `reconciled_by_user_id` keeps recording the real OPERATOR user; the POS
 * previously abused that column to carry the typed supervisor string. This
 * column gives that string its own home so both identities coexist:
 * operator in `reconciled_by_user_id`, typed supervisor credential here,
 * null for normal (non-override) reconciliations and for legacy payloads
 * that do not send it.
 *
 * Nullable, additive and idempotent (`IF NOT EXISTS`); `down` removes only
 * this column. Nothing auto-creates it (`synchronize: false`), so this
 * migration is mandatory.
 */
export class AddOverrideSupervisorRefToInvoicePayments1809600000000 implements MigrationInterface {
  name = 'AddOverrideSupervisorRefToInvoicePayments1809600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE invoice_payments
      ADD COLUMN IF NOT EXISTS override_supervisor_ref text DEFAULT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE invoice_payments
      DROP COLUMN IF EXISTS override_supervisor_ref
    `);
  }
}
