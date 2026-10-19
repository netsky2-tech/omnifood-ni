import type { QueryRunner } from 'typeorm';

/**
 * R28 — the DEVIATION RECORD of a sale line: which modifier option it
 * carries and what that option did to the stock.
 *
 * Until this migration, `invoice_item_modifiers` carried only the
 * modifier's NAME (free text, and the POS built it as "Grupo: Opción") plus
 * its price and quantity. That made two things impossible:
 *
 *  1. **Which option was sold** could not be reconstructed: neither the
 *     cloud nor the audit could tell a "Leche: Almendras" line from any
 *     other line with the same text.
 *  2. **A deviation from the recipe was invisible**: an almond milk instead
 *     of the recipe's whole milk, or an extra shot of coffee, left no trace
 *     in the fiscal record. R-06 (registros disponibles para la DGI) and R-01
 *     (el costo real del plato) both need that trace.
 *
 * Every column is NULLABLE and every existing row stays exactly as it is: a
 * line whose option is price-only carries no deviation, and a line written
 * by a terminal that predates R28 carries neither identity nor effect. The
 * table therefore grows without rewriting a single historical fact.
 *
 * WHY NO BACKFILL: the identity of the sold option was never stored, so
 * there is nothing to reconstruct. Fabricating it would put an invented
 * identifier into a fiscal record.
 *
 * RLS posture is UNCHANGED: this is a column addition only, no
 * grant/policy/statement-level change.
 */
export class AddModifierDeviationToInvoiceItemModifiers1810060000000 {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE invoice_item_modifiers ' +
        'ADD COLUMN IF NOT EXISTS option_id uuid, ' +
        'ADD COLUMN IF NOT EXISTS group_id uuid, ' +
        'ADD COLUMN IF NOT EXISTS inventory_effect varchar(16), ' +
        'ADD COLUMN IF NOT EXISTS effect_insumo_id uuid, ' +
        'ADD COLUMN IF NOT EXISTS effect_target_insumo_id uuid, ' +
        'ADD COLUMN IF NOT EXISTS effect_quantity numeric(14, 4), ' +
        'ADD COLUMN IF NOT EXISTS effect_factor numeric(10, 4)',
    );

    // The lookup the audit and the margin report will use: "which sales
    // lines carried a deviation, and of which kind".
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_iim_option ' +
        'ON invoice_item_modifiers (option_id) ' +
        'WHERE option_id IS NOT NULL',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_iim_effect ' +
        'ON invoice_item_modifiers (inventory_effect) ' +
        'WHERE inventory_effect IS NOT NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_iim_effect');
    await queryRunner.query('DROP INDEX IF EXISTS idx_iim_option');
    await queryRunner.query(
      'ALTER TABLE invoice_item_modifiers ' +
        'DROP COLUMN IF EXISTS effect_factor, ' +
        'DROP COLUMN IF EXISTS effect_quantity, ' +
        'DROP COLUMN IF EXISTS effect_target_insumo_id, ' +
        'DROP COLUMN IF EXISTS effect_insumo_id, ' +
        'DROP COLUMN IF EXISTS inventory_effect, ' +
        'DROP COLUMN IF EXISTS group_id, ' +
        'DROP COLUMN IF EXISTS option_id',
    );
  }
}
