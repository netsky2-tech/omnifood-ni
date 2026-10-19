import { describe, it, expect } from "vitest";
import {
  effectBadgeLabel,
  EMPTY_EFFECT,
  filterInsumos,
  foldText,
  MODIFIER_EFFECT,
  MODIFIER_EFFECT_OPTIONS,
  validateModifierEffect,
  type ModifierEffectSpec,
} from "./effect";
import type { Insumo } from "@/features/recipes/types";

/**
 * R28 — the dashboard's mirror of the modifier inventory effect.
 *
 * The backend owns the rules; this mirror exists so the operator gets the
 * answer without a round trip (§18.1) while the server stays the authority
 * (§18.4). The mirror therefore has to carry the SAME rules, in the
 * operator's language.
 */
describe("modifier effect (dashboard mirror)", () => {
  const spec = (overrides: Partial<ModifierEffectSpec>): ModifierEffectSpec => ({
    ...EMPTY_EFFECT,
    ...overrides,
  });

  describe("the five effects", () => {
    it("offers exactly the five effects with their operator copy", () => {
      expect(MODIFIER_EFFECT_OPTIONS.map((o) => o.value)).toEqual([
        "NONE",
        "ADD",
        "REMOVE",
        "SWAP",
        "SCALE",
      ]);
      for (const option of MODIFIER_EFFECT_OPTIONS) {
        expect(option.label.trim().length).toBeGreaterThan(0);
        expect(option.description.trim().length).toBeGreaterThan(0);
        expect(option.badge.trim().length).toBeGreaterThan(0);
      }
    });

    it("names the consequence of each effect, not only its name", () => {
      const byValue = (value: string): string =>
        MODIFIER_EFFECT_OPTIONS.find((o) => o.value === value)?.description ??
        "";
      expect(byValue("ADD")).toMatch(/suma un insumo/i);
      expect(byValue("REMOVE")).toMatch(/no se descuenta/i);
      expect(byValue("SWAP")).toMatch(/devuelve el componente/i);
      expect(byValue("SCALE")).toMatch(/multiplica/i);
      expect(byValue("NONE")).toMatch(/no toca el inventario/i);
    });

    it("has a short badge for every effect", () => {
      expect(effectBadgeLabel(MODIFIER_EFFECT.NONE)).toBe("Solo precio");
      expect(effectBadgeLabel(MODIFIER_EFFECT.ADD)).toBe("Aporta insumo");
    });
  });

  describe("the shape rules", () => {
    it("accepts a price-only effect", () => {
      expect(validateModifierEffect(spec({ effect: "NONE" }))).toBeNull();
    });

    it("requires the insumo an ADD contributes", () => {
      expect(
        validateModifierEffect(spec({ effect: "ADD" })),
      ).toMatch(/insumo que aporta/i);
    });

    it("requires a quantity or a component to inherit from", () => {
      expect(
        validateModifierEffect(
          spec({ effect: "ADD", effect_insumo_id: "ins-1" }),
        ),
      ).toMatch(/cantidad a aplicar/i);
      expect(
        validateModifierEffect(
          spec({
            effect: "ADD",
            effect_insumo_id: "ins-1",
            effect_target_insumo_id: "ins-1",
          }),
        ),
      ).toBeNull();
    });

    it("requires the component a REMOVE takes out", () => {
      expect(
        validateModifierEffect(spec({ effect: "REMOVE" })),
      ).toMatch(/componente de la receta que quita/i);
      expect(
        validateModifierEffect(
          spec({ effect: "REMOVE", effect_target_insumo_id: "ins-1" }),
        ),
      ).toBeNull();
    });

    it("requires both sides of a SWAP and refuses the same insumo twice", () => {
      expect(
        validateModifierEffect(spec({ effect: "SWAP" })),
      ).toMatch(/componente de la receta que reemplaza/i);
      expect(
        validateModifierEffect(
          spec({ effect: "SWAP", effect_target_insumo_id: "ins-1" }),
        ),
      ).toMatch(/insumo que entra en su lugar/i);
      expect(
        validateModifierEffect(
          spec({
            effect: "SWAP",
            effect_target_insumo_id: "ins-1",
            effect_insumo_id: "ins-1",
          }),
        ),
      ).toMatch(/distintos/i);
    });

    it("requires the component and the factor of a SCALE", () => {
      expect(validateModifierEffect(spec({ effect: "SCALE" }))).toMatch(
        /componente de la receta que multiplica/i,
      );
      expect(
        validateModifierEffect(
          spec({ effect: "SCALE", effect_target_insumo_id: "ins-1" }),
        ),
      ).toMatch(/factor/i);
      expect(
        validateModifierEffect(
          spec({
            effect: "SCALE",
            effect_target_insumo_id: "ins-1",
            effect_factor: 2,
          }),
        ),
      ).toBeNull();
    });

    it("rejects a non-positive quantity or factor", () => {
      expect(
        validateModifierEffect(
          spec({
            effect: "ADD",
            effect_insumo_id: "ins-1",
            effect_quantity: 0,
          }),
        ),
      ).toMatch(/mayor que 0/i);
      expect(
        validateModifierEffect(
          spec({
            effect: "SCALE",
            effect_target_insumo_id: "ins-1",
            effect_factor: 0,
          }),
        ),
      ).toMatch(/mayor que 0/i);
    });
  });

  describe("the governed insumo search (§17.6)", () => {
    const insumo = (overrides: Partial<Insumo>): Insumo => ({
      id: "ins-1",
      tenant_id: "t1",
      name: "Leche de almendras",
      purchaseUom: "L",
      consumptionUom: "ML",
      stock: 0,
      averageCost: 0,
      is_active: true,
      ...overrides,
    });

    it("folds accents and case", () => {
      expect(foldText("  Almendras ")).toBe("almendras");
      expect(foldText("ALMENDRAS")).toBe("almendras");
    });

    it("matches partially, over the name AND the unit of measure", () => {
      const list = [
        insumo({ id: "i1", name: "Leche de almendras" }),
        insumo({ id: "i2", name: "Café en grano", consumptionUom: "G" }),
      ];
      expect(filterInsumos(list, "almendra").map((i) => i.id)).toEqual(["i1"]);
      expect(filterInsumos(list, "almendras").map((i) => i.id)).toEqual(["i1"]);
      // The unit is part of what the operator knows.
      expect(filterInsumos(list, "g").map((i) => i.id)).toEqual(["i2"]);
    });

    it("returns everything for an empty term", () => {
      const list = [insumo({ id: "i1" }), insumo({ id: "i2", name: "Café" })];
      expect(filterInsumos(list, "   ")).toHaveLength(2);
    });

    it("returns nothing when nothing matches (the empty-filtered state)", () => {
      const list = [insumo({ id: "i1" })];
      expect(filterInsumos(list, "zzz")).toHaveLength(0);
    });
  });
});
