import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * R9 (S11, owner decision 2026-10-15): the purchase cost is loaded NET and
 * the system guarantees it. The declaration is per-insumo: `iva_rate_pct`
 * states the IVA rate the insumo carries (NULL = exempt / no IVA declared —
 * no guard applies). The purchase load then requires an explicit
 * net/gross declaration and REJECTS a gross cost: a gross cost would
 * overvalue the inventory (NIC 2 §23-25 excludes recoverable taxes).
 *
 * Nullable numeric, no backfill: existing insumos keep `NULL` until the
 * operator declares their rate, and the purchase guard is inert until then —
 * declaring a rate is exactly the act that switches the guard on.
 */
export class AddIvaRatePctToInsumos1810020000000 implements MigrationInterface {
  name = 'AddIvaRatePctToInsumos1810020000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE insumos
        ADD COLUMN IF NOT EXISTS iva_rate_pct numeric(7,4)
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN insumos.iva_rate_pct IS
        'R9: declared IVA rate for this insumo (percent, 0..100). NULL = no IVA declared, the net-cost guard is inert.'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE insumos DROP COLUMN IF EXISTS iva_rate_pct
    `);
  }
}
