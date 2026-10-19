import { QueryResult, type QueryRunner } from 'typeorm';
import { AddModifierInventoryEffects1810030000000 } from './1810030000000-AddModifierInventoryEffects';

/**
 * R28 — the migration that gives a modifier option its optional inventory
 * effect.
 *
 * Two properties are load-bearing and are pinned here:
 *
 *  1. The DEFAULT is 'NONE' and the migration only ADDS columns: an option
 *     that exists today keeps behaving exactly as before, which is what keeps
 *     a tenant that never configured an effect (SOHO) untouched.
 *  2. The CHECK constraint encodes the SHAPE of each effect, so a
 *     half-configured effect can never reach the resolution (a modifier that
 *     silently deducts nothing is the failure mode this prevents).
 */
/** Whitespace-insensitive view of the collected SQL, so the assertions
 * protect the contract without coupling to the migration's indentation. */
const flat = (sql: string): string => sql.replace(/\s+/g, ' ');

describe('AddModifierInventoryEffects1810030000000', () => {
  const migration = new AddModifierInventoryEffects1810030000000();

  const collectSql = async (direction: 'up' | 'down' = 'up') => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn((sql: string): Promise<QueryResult> => {
        queries.push(sql);
        return Promise.resolve(new QueryResult());
      }),
    } as unknown as QueryRunner;
    await migration[direction](queryRunner);
    return { sql: queries.join('\n') };
  };

  describe('the columns', () => {
    it('adds the effect columns to modifier_options', async () => {
      const { sql } = await collectSql('up');

      expect(sql).toContain('ALTER TABLE modifier_options');
      expect(sql).toContain(
        "inventory_effect varchar(16) NOT NULL DEFAULT 'NONE'",
      );
      expect(sql).toContain('effect_insumo_id uuid');
      expect(sql).toContain('effect_target_insumo_id uuid');
      expect(sql).toContain('effect_quantity numeric(14, 4)');
      expect(sql).toContain('effect_factor numeric(10, 4)');
    });

    it('defaults every existing option to NONE (no behaviour change)', async () => {
      const { sql } = await collectSql('up');

      expect(sql).toContain("DEFAULT 'NONE'");
      // The columns are nullable, so an option that never declared an effect
      // reads as price-only.
      expect(sql).toContain('effect_insumo_id uuid');
      expect(sql).not.toContain('effect_insumo_id uuid NOT NULL');
    });
  });

  describe('the shape constraints', () => {
    it('accepts only the five effects', async () => {
      const { sql } = await collectSql('up');

      expect(sql).toContain('chk_modifier_options_inventory_effect');
      expect(sql).toContain(
        "CHECK (inventory_effect IN ('NONE', 'ADD', 'REMOVE', 'SWAP', 'SCALE'))",
      );
    });

    it('encodes the shape of each effect', async () => {
      const { sql } = await collectSql('up');

      expect(sql).toContain('chk_modifier_options_effect_shape');
      // NONE carries nothing.
      expect(sql).toContain("inventory_effect = 'NONE'");
      // ADD names the insumo it adds.
      expect(sql).toContain("inventory_effect = 'ADD'");
      // REMOVE names the component it removes, and no insumo of its own.
      expect(sql).toContain("inventory_effect = 'REMOVE'");
      // SWAP names both and never the same one.
      expect(sql).toContain("inventory_effect = 'SWAP'");
      expect(sql).toContain('effect_insumo_id <> effect_target_insumo_id');
      // SCALE names the component and the factor.
      expect(sql).toContain("inventory_effect = 'SCALE'");
      expect(sql).toContain('effect_factor IS NOT NULL');
    });

    it('keeps the declared quantities and factors positive', async () => {
      const { sql } = await collectSql('up');

      expect(sql).toContain('chk_modifier_options_effect_quantity_positive');
      expect(sql).toContain('CHECK (effect_quantity IS NULL OR effect_quantity > 0)');
      expect(sql).toContain('chk_modifier_options_effect_factor_positive');
      expect(sql).toContain('CHECK (effect_factor IS NULL OR effect_factor > 0)');
    });
  });

  describe('the tenant boundary', () => {
    it('binds both insumo references to the tenant', async () => {
      const { sql } = await collectSql('up');

      expect(sql).toContain('fk_modifier_options_effect_insumo');
      expect(sql).toContain('fk_modifier_options_effect_target_insumo');
      expect(flat(sql)).toContain(
        'FOREIGN KEY (tenant_id, effect_insumo_id) REFERENCES insumos (tenant_id, id)',
      );
      expect(flat(sql)).toContain(
        'FOREIGN KEY (tenant_id, effect_target_insumo_id) REFERENCES insumos (tenant_id, id)',
      );
    });
  });

  describe('the rollback', () => {
    it('drops the columns and the constraints', async () => {
      const { sql } = await collectSql('down');

      expect(sql).toContain('DROP CONSTRAINT IF EXISTS');
      expect(sql).toContain('DROP COLUMN IF EXISTS inventory_effect');
      expect(sql).toContain('DROP COLUMN IF EXISTS effect_insumo_id');
      expect(sql).toContain('DROP COLUMN IF EXISTS effect_target_insumo_id');
      expect(sql).toContain('DROP COLUMN IF EXISTS effect_quantity');
      expect(sql).toContain('DROP COLUMN IF EXISTS effect_factor');
    });
  });
});
