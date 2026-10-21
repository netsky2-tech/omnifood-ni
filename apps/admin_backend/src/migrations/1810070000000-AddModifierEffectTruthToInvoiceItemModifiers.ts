import type { QueryRunner } from 'typeorm';

/**
 * ME-04 (Unidad 3) — the TRUTH of a modifier's effect travels with the
 * sale line.
 *
 * A line whose effect did not touch the stock is a SALE THAT HAPPENED WITH
 * A MISSING INVENTORY MOVEMENT. Until this migration the cloud could not
 * tell that case from a line that never declared an effect, so the pending
 * sale was invisible until somebody reconciled the stock by hand.
 *
 * Every column is NULLABLE and additive: a line written by a terminal that
 * predates ME-04 (and a price-only line) keeps its exact shape, and no
 * historical fact is rewritten.
 *
 * WHY NO BACKFILL: the terminal never said what happened to the effect, so
 * there is nothing to reconstruct. Fabricating "APPLIED" would put an
 * invented inventory truth into a fiscal record.
 *
 * RLS posture is UNCHANGED: this is a column addition only, no
 * grant/policy/statement-level change.
 */
export class AddModifierEffectTruthToInvoiceItemModifiers1810070000000 {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE invoice_item_modifiers ' +
        'ADD COLUMN IF NOT EXISTS effect_status varchar(16), ' +
        'ADD COLUMN IF NOT EXISTS effect_skip_reason varchar(32), ' +
        'ADD COLUMN IF NOT EXISTS effect_quantity_source varchar(16), ' +
        'ADD COLUMN IF NOT EXISTS effect_authorized_by uuid, ' +
        'ADD COLUMN IF NOT EXISTS effect_authorization_method varchar(16), ' +
        'ADD COLUMN IF NOT EXISTS effect_authorization_reason varchar(240)',
    );

    // The lookup the reconciliation will use: "which sold lines have an
    // effect that never touched the stock".
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_iim_effect_status ' +
        'ON invoice_item_modifiers (effect_status) ' +
        'WHERE effect_status IS NOT NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_iim_effect_status');
    await queryRunner.query(
      'ALTER TABLE invoice_item_modifiers ' +
        'DROP COLUMN IF EXISTS effect_authorization_reason, ' +
        'DROP COLUMN IF EXISTS effect_authorization_method, ' +
        'DROP COLUMN IF EXISTS effect_authorized_by, ' +
        'DROP COLUMN IF EXISTS effect_quantity_source, ' +
        'DROP COLUMN IF EXISTS effect_skip_reason, ' +
        'DROP COLUMN IF EXISTS effect_status',
    );
  }
}
