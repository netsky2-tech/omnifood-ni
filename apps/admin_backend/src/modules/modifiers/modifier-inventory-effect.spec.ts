import {
  assertValidModifierInventoryEffect,
  effectRequiresInsumo,
  isModifierInventoryEffect,
  MODIFIER_INVENTORY_EFFECT,
  MODIFIER_INVENTORY_EFFECTS,
  ModifierInventoryEffectError,
  normalizeModifierInventoryEffect,
  type ModifierInventoryEffectSpec,
} from './modifier-inventory-effect';

/**
 * R28 — the inventory effect of a modifier option.
 *
 * The five effects are the industry model (RestaurantMate): NONE (price
 * only), ADD (an extra shot), REMOVE (no onion), SWAP (almond milk instead
 * of whole milk) and SCALE (a double shot). The shape rules exist so a
 * half-configured effect can never reach the resolution: a modifier that
 * silently deducts nothing is exactly the failure mode this prevents.
 */
describe('modifier inventory effect (R28)', () => {
  describe('the five effects', () => {
    it('exposes exactly the five effects of the industry model', () => {
      expect(MODIFIER_INVENTORY_EFFECTS).toEqual([
        'NONE',
        'ADD',
        'REMOVE',
        'SWAP',
        'SCALE',
      ]);
      expect(isModifierInventoryEffect('ADD')).toBe(true);
      expect(isModifierInventoryEffect('REMOVES')).toBe(false);
      expect(isModifierInventoryEffect(undefined)).toBe(false);
    });

    it('normalizes an option without a declared effect to NONE', () => {
      expect(normalizeModifierInventoryEffect(null)).toEqual({
        effect: 'NONE',
        effect_insumo_id: null,
        effect_target_insumo_id: null,
        effect_quantity: null,
        effect_factor: null,
      });
    });
  });

  describe('NONE — price only', () => {
    it('accepts a bare NONE', () => {
      expect(() =>
        assertValidModifierInventoryEffect({ effect: 'NONE' }),
      ).not.toThrow();
    });

    it('rejects a NONE that carries insumo, quantity or factor', () => {
      expect(() =>
        assertValidModifierInventoryEffect({
          effect: 'NONE',
          effect_insumo_id: 'ins-1',
        }),
      ).toThrow(/no puede declarar insumo/);
      expect(() =>
        assertValidModifierInventoryEffect({
          effect: 'NONE',
          effect_quantity: 2,
        }),
      ).toThrow(ModifierInventoryEffectError);
    });
  });

  describe('ADD — an extra shot contributes an insumo', () => {
    it('accepts the insumo it adds with an explicit quantity', () => {
      expect(() =>
        assertValidModifierInventoryEffect({
          effect: 'ADD',
          effect_insumo_id: 'ins-cafe',
          effect_quantity: 18,
        }),
      ).not.toThrow();
    });

    it('accepts an ADD that inherits the quantity of a target component', () => {
      // The extra shot of the capuccino: the recipe already declares 18 g
      // of coffee, so the extra inherits it.
      expect(() =>
        assertValidModifierInventoryEffect({
          effect: 'ADD',
          effect_insumo_id: 'ins-cafe',
          effect_target_insumo_id: 'ins-cafe',
        }),
      ).not.toThrow();
    });

    it('requires the insumo it adds', () => {
      expect(() =>
        assertValidModifierInventoryEffect({ effect: 'ADD' }),
      ).toThrow(/necesita el insumo que aporta/);
    });

    it('requires a quantity when there is no component to inherit from', () => {
      expect(() =>
        assertValidModifierInventoryEffect({
          effect: 'ADD',
          effect_insumo_id: 'ins-cafe',
        }),
      ).toThrow(/necesita una cantidad/);
    });

    it('rejects a factor (that is SCALE)', () => {
      expect(() =>
        assertValidModifierInventoryEffect({
          effect: 'ADD',
          effect_insumo_id: 'ins-cafe',
          effect_quantity: 1,
          effect_factor: 2,
        }),
      ).toThrow(/use SCALE/);
    });

    it('rejects a non-positive quantity', () => {
      expect(() =>
        assertValidModifierInventoryEffect({
          effect: 'ADD',
          effect_insumo_id: 'ins-cafe',
          effect_quantity: 0,
        }),
      ).toThrow(/mayor que 0/);
    });
  });

  describe('REMOVE — a component of the recipe leaves the stock', () => {
    it('accepts the component it removes', () => {
      expect(() =>
        assertValidModifierInventoryEffect({
          effect: 'REMOVE',
          effect_target_insumo_id: 'ins-cebolla',
        }),
      ).not.toThrow();
    });

    it('requires the component it removes', () => {
      expect(() =>
        assertValidModifierInventoryEffect({ effect: 'REMOVE' }),
      ).toThrow(/necesita el insumo del componente/);
    });

    it('forbids an insumo, a quantity and a factor', () => {
      expect(() =>
        assertValidModifierInventoryEffect({
          effect: 'REMOVE',
          effect_target_insumo_id: 'ins-cebolla',
          effect_insumo_id: 'ins-otro',
        }),
      ).toThrow(/no declara insumo/);
      expect(() =>
        assertValidModifierInventoryEffect({
          effect: 'REMOVE',
          effect_target_insumo_id: 'ins-cebolla',
          effect_quantity: 2,
        }),
      ).toThrow(/no admite cantidad ni factor/);
    });
  });

  describe('SWAP — a component is replaced by another insumo', () => {
    it('accepts the replaced component and the substitute', () => {
      expect(() =>
        assertValidModifierInventoryEffect({
          effect: 'SWAP',
          effect_target_insumo_id: 'ins-leche-entera',
          effect_insumo_id: 'ins-leche-almendras',
        }),
      ).not.toThrow();
    });

    it('accepts an explicit quantity for the substitute', () => {
      expect(() =>
        assertValidModifierInventoryEffect({
          effect: 'SWAP',
          effect_target_insumo_id: 'ins-leche-entera',
          effect_insumo_id: 'ins-leche-almendras',
          effect_quantity: 0.15,
        }),
      ).not.toThrow();
    });

    it('requires both the component and the substitute', () => {
      expect(() =>
        assertValidModifierInventoryEffect({
          effect: 'SWAP',
          effect_insumo_id: 'ins-leche-almendras',
        }),
      ).toThrow(/necesita el insumo del componente/);
      expect(() =>
        assertValidModifierInventoryEffect({
          effect: 'SWAP',
          effect_target_insumo_id: 'ins-leche-entera',
        }),
      ).toThrow(/necesita el insumo que entra/);
    });

    it('refuses to replace an insumo by itself', () => {
      expect(() =>
        assertValidModifierInventoryEffect({
          effect: 'SWAP',
          effect_target_insumo_id: 'ins-leche',
          effect_insumo_id: 'ins-leche',
        }),
      ).toThrow(/no puede reemplazar un insumo por sí mismo/);
    });
  });

  describe('SCALE — a component is multiplied', () => {
    it('accepts the component and the factor', () => {
      expect(() =>
        assertValidModifierInventoryEffect({
          effect: 'SCALE',
          effect_target_insumo_id: 'ins-cafe',
          effect_factor: 2,
        }),
      ).not.toThrow();
    });

    it('requires the component and the factor', () => {
      expect(() =>
        assertValidModifierInventoryEffect({ effect: 'SCALE' }),
      ).toThrow(/necesita el insumo del componente/);
      expect(() =>
        assertValidModifierInventoryEffect({
          effect: 'SCALE',
          effect_target_insumo_id: 'ins-cafe',
        }),
      ).toThrow(/necesita el factor/);
    });

    it('forbids an insumo and a quantity', () => {
      expect(() =>
        assertValidModifierInventoryEffect({
          effect: 'SCALE',
          effect_target_insumo_id: 'ins-cafe',
          effect_factor: 2,
          effect_insumo_id: 'ins-cafe',
        }),
      ).toThrow(/no declara insumo/);
      expect(() =>
        assertValidModifierInventoryEffect({
          effect: 'SCALE',
          effect_target_insumo_id: 'ins-cafe',
          effect_factor: 2,
          effect_quantity: 36,
        }),
      ).toThrow(/no admite cantidad/);
    });
  });

  describe('the SOHO guarantee (D6)', () => {
    it('knows which effects need an insumo the tenant must have', () => {
      // ADD and SWAP name an insumo that the stock has to know. A tenant
      // that does not have it registered resolves the effect to NO_IMPACT
      // (the sale goes through); REMOVE and SCALE act on the recipe's own
      // component, so they need no extra insumo.
      expect(
        effectRequiresInsumo({
          effect: 'ADD',
          effect_insumo_id: 'ins-cafe',
        }),
      ).toBe(true);
      expect(
        effectRequiresInsumo({
          effect: 'SWAP',
          effect_target_insumo_id: 'ins-leche',
          effect_insumo_id: 'ins-almendras',
        }),
      ).toBe(true);
      expect(
        effectRequiresInsumo({
          effect: 'REMOVE',
          effect_target_insumo_id: 'ins-cebolla',
        }),
      ).toBe(false);
      expect(
        effectRequiresInsumo({ effect: MODIFIER_INVENTORY_EFFECT.NONE }),
      ).toBe(false);
    });
  });

  describe('an unknown effect is never accepted', () => {
    it('rejects an effect outside the five', () => {
      const spec = {
        effect: 'REPLACE' as unknown as ModifierInventoryEffectSpec['effect'],
      };
      expect(() => assertValidModifierInventoryEffect(spec)).toThrow(
        /Efecto de inventario desconocido/,
      );
    });
  });
});
