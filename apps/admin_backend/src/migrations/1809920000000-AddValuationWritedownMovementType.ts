import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * R-01 (Ley 822 de Nicaragua, art. 44) — the valuation writedown movement type.
 *
 * The law requires inventory to be valued **at the lower of acquisition cost or
 * market price**. The system's declared approximation (see
 * docs/inventario_marco_normativo.md §5) uses the **last purchase cost** as the
 * reference, read from the ledger's most recent `ENTRADA_COMPRA` row.
 *
 * When the weighted average cost (`CPP`) exceeds that reference, the inventory
 * is over-valued and the difference has to be written down. The kardex is
 * append-only, so the writedown is a **compensating movement** — and because it
 * changes VALUE and not quantity, that movement carries `quantity = 0` with a
 * negative `total_cost_nio`. The running-balance trigger accepts it
 * (`stock_after = stock_before + 0`) and the table's only CHECK constraint
 * concerns credit-note provenance, so nothing else objects.
 *
 * Why this has to exist at all: without a distinct type, a valuation act would
 * have to be recorded as an `ADJUSTMENT`, which means a QUANTITY adjustment,
 * and the whole point of the writedown is that quantities did not move.
 *
 * This migration only adds the type. The value is deliberately not USED here:
 * PostgreSQL cannot use a value added in the same transaction (TypeORM runs
 * migrations inside one), so the write path is application code.
 */
export class AddValuationWritedownMovementType1809920000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF to_regtype('inventory_kardex_movement_type_enum') IS NOT NULL THEN
          EXECUTE 'ALTER TYPE inventory_kardex_movement_type_enum ADD VALUE IF NOT EXISTS ''VALUATION_WRITEDOWN''';
        END IF;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END;
      $$;
    `);
  }

  public async down(): Promise<void> {
    // PostgreSQL cannot remove a value from an enum type: it would require
    // recreating the type and rewriting every column that uses it. On top of
    // that, the kardex is append-only, so a VALUATION_WRITEDOWN row that exists
    // must remain readable — an enum without the value would make those rows
    // unreadable rather than undone.
    //
    // A no-op `down` is therefore the honest choice, and it is written down
    // here instead of being left silent. The schema-build gate does not pin
    // enum values, so the extra label is inert for every other check.
  }
}
