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
}
