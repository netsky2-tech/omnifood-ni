import type { Insumo } from "@/features/recipes/types";

/**
 * The inventory effect of a modifier option — the dashboard's mirror of the
 * backend model (R28).
 *
 * The backend owns the rules (`apps/admin_backend/src/modules/modifiers/
 * modifier-inventory-effect.ts`); this file mirrors them for the form, so
 * the operator gets the answer without a round trip (§18.1) while the
 * server stays the authority (§18.4).
 *
 * The five effects (the industry model the owner chose):
 * NONE   — price only ("included, not costed"). The default.
 * ADD    — contributes an insumo (an extra shot of coffee).
 * REMOVE — takes a component of the recipe out ("no onion").
 * SWAP   — replaces a component of the recipe with another insumo (almond
 *          milk instead of whole milk).
 * SCALE  — multiplies a component (a double shot).
 */
export const MODIFIER_EFFECT = {
  NONE: "NONE",
  ADD: "ADD",
  REMOVE: "REMOVE",
  SWAP: "SWAP",
  SCALE: "SCALE",
} as const;

export type ModifierEffect =
  (typeof MODIFIER_EFFECT)[keyof typeof MODIFIER_EFFECT];

export interface ModifierEffectSpec {
  effect: ModifierEffect;
  /** The insumo the effect acts ON: added (ADD) or substituted in (SWAP). */
  effect_insumo_id: string | null;
  /** The insumo of the recipe component the effect affects. */
  effect_target_insumo_id: string | null;
  /** NULL = inherit the target component's quantity. */
  effect_quantity: number | null;
  /** The multiplier of a SCALE. */
  effect_factor: number | null;
}

export const EMPTY_EFFECT: ModifierEffectSpec = {
  effect: MODIFIER_EFFECT.NONE,
  effect_insumo_id: null,
  effect_target_insumo_id: null,
  effect_quantity: null,
  effect_factor: null,
};

/**
 * The five effects with their operator copy. The label is what the operator
 * reads; the description says what it DOES to the stock, because that is the
 * decision they are actually making (§39.3: state the consequence).
 */
export const MODIFIER_EFFECT_OPTIONS: Array<{
  value: ModifierEffect;
  label: string;
  description: string;
  /** The short form shown on the option row's badge. */
  badge: string;
}> = [
  {
    value: MODIFIER_EFFECT.NONE,
    label: "Solo precio",
    description:
      "La opción cambia el precio de la venta, pero no toca el inventario.",
    badge: "Solo precio",
  },
  {
    value: MODIFIER_EFFECT.ADD,
    label: "Aporta un insumo",
    description:
      "La opción suma un insumo al consumo de la receta (ej: un shot extra de café).",
    badge: "Aporta insumo",
  },
  {
    value: MODIFIER_EFFECT.REMOVE,
    label: "Quita un componente",
    description:
      "La opción saca un componente de la receta, y ese componente no se descuenta (ej: sin cebolla).",
    badge: "Quita componente",
  },
  {
    value: MODIFIER_EFFECT.SWAP,
    label: "Reemplaza un componente",
    description:
      "La opción devuelve el componente de la receta al inventario y descuenta el insumo que entra en su lugar (ej: leche de almendras en vez de leche entera).",
    badge: "Reemplaza insumo",
  },
  {
    value: MODIFIER_EFFECT.SCALE,
    label: "Multiplica un componente",
    description:
      "La opción multiplica por un factor el consumo de un componente de la receta (ej: café x2).",
    badge: "Multiplica componente",
  },
];

export function effectBadgeLabel(effect: ModifierEffect): string {
  return (
    MODIFIER_EFFECT_OPTIONS.find((o) => o.value === effect)?.badge ??
    MODIFIER_EFFECT_OPTIONS[0]?.badge ??
    "Solo precio"
  );
}

/**
 * The shape rules, mirrored from the backend. A half-configured effect is
 * refused here so the operator is told what is missing instead of getting a
 * 400 after a round trip.
 *
 * @returns the Spanish message, or null when the effect is complete.
 */
export function validateModifierEffect(
  spec: ModifierEffectSpec,
): string | null {
  const hasInsumo = !!spec.effect_insumo_id;
  const hasTarget = !!spec.effect_target_insumo_id;
  const hasQuantity = spec.effect_quantity !== null;
  const hasFactor = spec.effect_factor !== null;

  if (spec.effect === MODIFIER_EFFECT.NONE) return null;

  if (spec.effect === MODIFIER_EFFECT.ADD) {
    if (!hasInsumo) {
      return "Elija el insumo que aporta la opción (ej: el café de un shot extra).";
    }
    if (!hasTarget && !hasQuantity) {
      return "Indique la cantidad a aplicar, o el componente de la receta de la que hereda la cantidad.";
    }
    if (hasQuantity && (spec.effect_quantity ?? 0) <= 0) {
      return "La cantidad a aplicar debe ser mayor que 0.";
    }
    return null;
  }

  if (spec.effect === MODIFIER_EFFECT.REMOVE) {
    if (!hasTarget) {
      return "Elija el componente de la receta que quita (ej: la cebolla).";
    }
    return null;
  }

  if (spec.effect === MODIFIER_EFFECT.SWAP) {
    if (!hasTarget) {
      return "Elija el componente de la receta que reemplaza (ej: la leche entera).";
    }
    if (!hasInsumo) {
      return "Elija el insumo que entra en su lugar (ej: la leche de almendras).";
    }
    if (spec.effect_insumo_id === spec.effect_target_insumo_id) {
      return "El componente que se reemplaza y el que entra en su lugar deben ser distintos.";
    }
    if (hasQuantity && (spec.effect_quantity ?? 0) <= 0) {
      return "La cantidad a aplicar debe ser mayor que 0.";
    }
    return null;
  }

  // SCALE
  if (!hasTarget) {
    return "Elija el componente de la receta que multiplica.";
  }
  if (!hasFactor) {
    return "Indique por qué factor se multiplica (ej: 2 para el doble).";
  }
  if ((spec.effect_factor ?? 0) <= 0) {
    return "El factor debe ser mayor que 0.";
  }
  return null;
}

/**
 * Accent-folded lowercase, so "leche de almendras" is found by "almendras"
 * and "Almendras" alike (§17.6: tolerant of case, accents and partials).
 */
export function foldText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * The flexible textual search of the governed insumo selector (§17.6): a
 * partial match over the insumo's name AND its unit of measure, tolerant of
 * case and accents. The insumo list is the tenant's active catalog, so an
 * insumo the tenant deactivated is not offered (the effect then resolves to
 * NO_IMPACT, per the SOHO guarantee).
 */
export function filterInsumos(
  insumos: Insumo[],
  term: string,
): Insumo[] {
  const needle = foldText(term);
  if (!needle) return insumos;
  return insumos.filter((insumo) => {
    const name = foldText(insumo.name);
    const uom = foldText(
      `${insumo.purchaseUom ?? ""} ${insumo.consumptionUom ?? ""}`,
    );
    return name.includes(needle) || uom.includes(needle);
  });
}
