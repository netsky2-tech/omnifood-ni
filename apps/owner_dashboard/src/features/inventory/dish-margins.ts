import { api, type ApiClientMethodOptions } from "@/lib/api";

/**
 * R8 (H8): the per-dish theoretical cost and gross margin surface.
 *
 * `GET /inventory/reports/dish-margins` prices every COMPOUND/PREPARED
 * product with an active published recipe from its components' current CPPs.
 * A product the backend could not price is returned in `skipped` WITH its
 * reason, never silently dropped.
 */
export interface DishMarginComponent {
  ingredientId: string;
  ingredientName?: string;
  ingredientType: string;
  grossQuantity: number;
  technicalShrinkPct: number;
  unitCostNio: number;
  totalCostNio: number;
  costPercentage: number;
}

export interface DishMargin {
  productId: string;
  productName: string;
  recipeVersionId: string;
  yieldQuantity: number;
  sellingPriceNio: number | null;
  unitTheoreticalCostNio: number;
  grossMarginNio: number | null;
  grossMarginPct: number | null;
  components: DishMarginComponent[];
}

/**
 * Machine code of a dish the backend could not price. The copy the surface
 * shows arrives in `reason` (operator Spanish, never a raw id or wire error:
 * Nhilos standard AP-10, §39.4, §30.3); the code is the contract.
 */
export type DishMarginSkipCode =
  | "NO_ACTIVE_RECIPE"
  | "SUB_RECIPE_NO_ACTIVE_RECIPE"
  | "MISSING_COMPONENT"
  | "CIRCULAR_SUB_RECIPE"
  | "NESTING_TOO_DEEP"
  | "UNEXPECTED";

export interface DishMarginSkip {
  productId: string;
  productName: string;
  reasonCode: DishMarginSkipCode;
  reason: string;
}

export interface DishMarginsResult {
  dishes: DishMargin[];
  skipped: DishMarginSkip[];
}

export function fetchDishMargins(
  opts?: ApiClientMethodOptions,
): Promise<DishMarginsResult> {
  return opts
    ? api.get<DishMarginsResult>("/inventory/reports/dish-margins", opts)
    : api.get<DishMarginsResult>("/inventory/reports/dish-margins");
}
