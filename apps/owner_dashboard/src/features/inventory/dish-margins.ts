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

export interface DishMarginSkip {
  productId: string;
  productName: string;
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
