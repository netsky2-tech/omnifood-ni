import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * R28 — the optional INVENTORY effect of a modifier option.
 *
 * Until R28 a modifier was purely monetary: `price_delta`, a label and a
 * quantity. The owner chose the industry model (RestaurantMate's five
 * effects) so the platform can also serve restaurants, where an extra shot
 * consumes coffee and almond milk REPLACES the recipe's whole milk.
 *
 * The effect lives on `modifier_options` (it is a property of the OPTION, and
 * the option is 1:1 with the effect — the attachment to a product or a
 * category stays untouched). The DEFAULT is 'NONE', so every option that
 * exists today keeps behaving exactly as before: **no migration changes any
 * existing behaviour**, and a tenant that never configures an effect (SOHO)
 * is untouched.
 *
 * The composite tenant FKs (tenant_id, insumo_id) → insumos (tenant_id, id)
 * make a cross-tenant reference impossible; `insumos` already carries
 * uq_insumos_tenant_insumo_id.
 *
 * The CHECK constraints encode the SHAPE rules of each effect (see
 * `modifier-inventory-effect.ts`): an ADD declares the insumo it adds, a
 * REMOVE the component it removes, a SWAP both and never the same one, a
 * SCALE the factor. A half-configured effect can never reach the resolution,
 * which is the failure mode the checks exist to prevent (a modifier that
 * silently deducts nothing).
 */
export class AddModifierInventoryEffects1810050000000 implements MigrationInterface {
  name = 'AddModifierInventoryEffects1810050000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE modifier_options
        ADD COLUMN IF NOT EXISTS inventory_effect varchar(16) NOT NULL DEFAULT 'NONE',
        ADD COLUMN IF NOT EXISTS effect_insumo_id uuid,
        ADD COLUMN IF NOT EXISTS effect_target_insumo_id uuid,
        ADD COLUMN IF NOT EXISTS effect_quantity numeric(14, 4),
        ADD COLUMN IF NOT EXISTS effect_factor numeric(10, 4)
    `);

    // Shape of each effect. `effect_quantity` is positive when present, and
    // the SCALE factor is positive; the "which insumos does this effect
    // need" rule is per-effect and is spelled out below.
    await queryRunner.query(`
      ALTER TABLE modifier_options
        ADD CONSTRAINT chk_modifier_options_inventory_effect
          CHECK (inventory_effect IN ('NONE', 'ADD', 'REMOVE', 'SWAP', 'SCALE')),
        ADD CONSTRAINT chk_modifier_options_effect_quantity_positive
          CHECK (effect_quantity IS NULL OR effect_quantity > 0),
        ADD CONSTRAINT chk_modifier_options_effect_factor_positive
          CHECK (effect_factor IS NULL OR effect_factor > 0),
        ADD CONSTRAINT chk_modifier_options_effect_shape
          CHECK (
            (inventory_effect = 'NONE'
              AND effect_insumo_id IS NULL
              AND effect_target_insumo_id IS NULL
              AND effect_quantity IS NULL
              AND effect_factor IS NULL)
            OR (inventory_effect = 'ADD'
              AND effect_insumo_id IS NOT NULL
              AND effect_factor IS NULL
              AND (effect_target_insumo_id IS NOT NULL OR effect_quantity IS NOT NULL))
            OR (inventory_effect = 'REMOVE'
              AND effect_target_insumo_id IS NOT NULL
              AND effect_insumo_id IS NULL
              AND effect_quantity IS NULL
              AND effect_factor IS NULL)
            OR (inventory_effect = 'SWAP'
              AND effect_target_insumo_id IS NOT NULL
              AND effect_insumo_id IS NOT NULL
              AND effect_insumo_id <> effect_target_insumo_id
              AND effect_factor IS NULL)
            OR (inventory_effect = 'SCALE'
              AND effect_target_insumo_id IS NOT NULL
              AND effect_insumo_id IS NULL
              AND effect_quantity IS NULL
              AND effect_factor IS NOT NULL)
          )
    `);

    await queryRunner.query(`
      ALTER TABLE modifier_options
        ADD CONSTRAINT fk_modifier_options_effect_insumo
          FOREIGN KEY (tenant_id, effect_insumo_id)
          REFERENCES insumos (tenant_id, id),
        ADD CONSTRAINT fk_modifier_options_effect_target_insumo
          FOREIGN KEY (tenant_id, effect_target_insumo_id)
          REFERENCES insumos (tenant_id, id)
    `);

    // The lookups the resolution does on the POS and in the cloud: "which
    // options affect this insumo" and "which options are declared at all".
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_modifier_options_tenant_effect_insumo
        ON modifier_options (tenant_id, effect_insumo_id)
        WHERE effect_insumo_id IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_modifier_options_tenant_effect_target
        ON modifier_options (tenant_id, effect_target_insumo_id)
        WHERE effect_target_insumo_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_modifier_options_tenant_effect_target
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_modifier_options_tenant_effect_insumo
    `);
    await queryRunner.query(`
      ALTER TABLE modifier_options
        DROP CONSTRAINT IF EXISTS fk_modifier_options_effect_target_insumo,
        DROP CONSTRAINT IF EXISTS fk_modifier_options_effect_insumo,
        DROP CONSTRAINT IF EXISTS chk_modifier_options_effect_shape,
        DROP CONSTRAINT IF EXISTS chk_modifier_options_effect_factor_positive,
        DROP CONSTRAINT IF EXISTS chk_modifier_options_effect_quantity_positive,
        DROP CONSTRAINT IF EXISTS chk_modifier_options_inventory_effect
    `);
    await queryRunner.query(`
      ALTER TABLE modifier_options
        DROP COLUMN IF EXISTS effect_factor,
        DROP COLUMN IF EXISTS effect_quantity,
        DROP COLUMN IF EXISTS effect_target_insumo_id,
        DROP COLUMN IF EXISTS effect_insumo_id,
        DROP COLUMN IF EXISTS inventory_effect
    `);
  }
}
