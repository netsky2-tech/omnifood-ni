import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * S9 (L33) — the kardex records WHICH valuation reference a writedown used.
 *
 * The writedown itself is a compensating movement (see
 * 1809920000000-AddValuationWritedownMovementType): `quantity = 0` with a
 * negative value, because a lower-of-cost-or-market adjustment changes VALUE,
 * not quantity.
 *
 * The row's `source_document_id` has to stay a PURE identity
 * (`valuation-writedown:<date>:<insumoId>`) so idempotency is an exact-match
 * lookup. That leaves nowhere for the basis to live: the kardex's other text
 * columns all mean something else (`bloqueo_motivo` is why a costing row was
 * blocked), and `reason` is not a column at all — it is a getter/setter over
 * `source_document_id` (inventory-movement.entity.ts:93-99), so writing it
 * would overwrite the identity it is meant to accompany.
 *
 * So the basis gets its own nullable column. Nullable because every existing
 * row predates it and most rows will never have one: a writedown is a
 * period-close act, not a per-movement one.
 *
 * What the basis must carry, because S9.3 requires that no report present an
 * approximation as if it were a market price:
 *   - WHICH variant resolved the reference (`MARKET_PRICE` or the declared
 *     `LAST_PURCHASE_COST_FALLBACK`),
 *   - the reference's own date (a market price carries one; the fallback's is
 *     the purchase movement's date),
 *   - the origin of the reference (the market-price row's id, or the purchase
 *     movement's id), so the approximation is auditable backwards.
 */
export class AddValuationBasisToKardex1809930000000
  implements MigrationInterface
{
  name = 'AddValuationBasisToKardex1809930000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory_kardex
        ADD COLUMN IF NOT EXISTS valuation_basis varchar
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // The kardex is append-only, and this column is the ONLY record of which
    // reference a writedown used. Dropping it while any row carries a basis
    // would erase the evidence of a valuation act, so this refuses instead of
    // dropping silently (house precedent for a destructive down:
    // 1802000000000-CreateProductInventoryMappingVersions).
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM inventory_kardex
          WHERE valuation_basis IS NOT NULL
          LIMIT 1
        ) THEN
          RAISE EXCEPTION 'refusing to drop inventory_kardex.valuation_basis: writedown evidence exists';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE inventory_kardex DROP COLUMN IF EXISTS valuation_basis
    `);
  }
}
