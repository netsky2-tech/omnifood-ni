import type { QueryRunner } from 'typeorm';

/**
 * SOHO P3 (modifier quantity): adds `quantity integer NOT NULL DEFAULT 1`
 * to invoice_item_modifiers so the cloud can store HOW MANY units of a
 * modifier option a sale line includes — the POS's wire map already carries
 * it ({name, extraPrice, quantity}, apps/pos_app/lib/data/mappers/
 * sales_mapper.dart:713-718).
 *
 * WHY DEFAULT 1 IS FACTUAL, NOT INVENTED: the cloud only ever accepted
 * `name` and `extra_price` (table created by migration 1759000000002), so
 * every existing row came from a single-unit modifier — exactly what the
 * POS's local default writes (invoice_item_modifier_entity.dart:30,
 * `this.quantity = 1`). No backfill fabrication: 1 is what those rows mean.
 *
 * WHY ADD COLUMN IF NOT EXISTS: the column is harmless to re-apply and the
 * migration runs inside the standard runner; idempotence keeps replay
 * tooling safe. RLS posture is UNCHANGED — this is a column addition only,
 * no grant/policy/statement-level change.
 */
export class AddQuantityToInvoiceItemModifiers1809640000000 {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE invoice_item_modifiers ' +
        'ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE invoice_item_modifiers DROP COLUMN IF EXISTS quantity',
    );
  }
}
