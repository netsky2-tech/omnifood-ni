import type { ModifierEffect } from "./effect";

/**
 * Types for the modifier-groups administration screen. Mirrors the shapes
 * returned by the backend modifiers endpoints (active groups with their
 * active options, ordered by sort order then name).
 */
export interface ModifierOption {
  id: string;
  name: string;
  /** Amount added to the product base price; may be negative (discounts). */
  price_delta: number;
  is_default: boolean;
  sort_order: number;
  /**
   * R28 — the option's optional inventory effect. `NONE` is the default and
   * means the option is price-only, exactly as before R28.
   */
  inventory_effect: ModifierEffect;
  effect_insumo_id: string | null;
  effect_target_insumo_id: string | null;
  effect_quantity: number | null;
  effect_factor: number | null;
}

export interface ModifierGroup {
  id: string;
  name: string;
  min_selected: number;
  max_selected: number;
  allow_quantities: boolean;
  sort_order: number;
  is_active: boolean;
  options: ModifierOption[];
}

export interface ModifierGroupInput {
  name: string;
  min_selected: number;
  max_selected: number;
  allow_quantities: boolean;
  sort_order: number;
}

export interface ModifierOptionInput {
  name: string;
  price_delta: number;
  is_default: boolean;
  sort_order: number;
  /** R28 — the optional inventory effect of the option. */
  inventory_effect: ModifierEffect;
  effect_insumo_id: string | null;
  effect_target_insumo_id: string | null;
  effect_quantity: number | null;
  effect_factor: number | null;
}
