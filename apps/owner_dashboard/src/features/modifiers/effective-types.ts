/**
 * Shape returned by the effective-groups endpoint: the groups a product
 * resolves at order time, split by source (category inheritance vs the
 * product's own exceptions). Position in each list is the order.
 */
export interface EffectiveModifierOption {
  id: string;
  name: string;
  price_delta: number;
  is_default: boolean;
  sort_order: number;
}

export interface EffectiveModifierGroup {
  group_id: string;
  name: string;
  min_selected: number;
  max_selected: number;
  allow_quantities: boolean;
  source: "category" | "product";
  options: EffectiveModifierOption[];
}
