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
  /**
   * R28 / M5 — the SECOND figure: what the dish actually cost when it was
   * sold in the period, per unit. It is a FACT read from the kardex (with
   * the extras already inside it), while `unitTheoreticalCostNio` is an
   * ESTIMATE with the components' current CPPs.
   *
   * NULL when the dish was not sold in the period: "not sold" is not "zero
   * cost" (§27, AP-02).
   */
  unitsSold?: number | null;
  unitActualCostNio?: number | null;
  actualCostNio?: number | null;
  /** The gap between the two figures, per unit. */
  costGapNio?: number | null;
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
  /** The period the second figure covers. */
  period?: { from: string | null; to: string | null };
  unitsSold?: number;
  totalActualCostNio?: number;
  totalTheoreticalCostNio?: number;
  /**
   * The headline the industry surfaces ("Modifiers added $1,140 of food
   * cost"): what the period's sales cost MINUS what the recipes said they
   * would cost. It carries BOTH the extras' effect and the CPP drift.
   */
  extrasImpactNio?: number;
  extrasImpactPct?: number | null;
}

export function fetchDishMargins(
  period?: { from?: string; to?: string },
  opts?: ApiClientMethodOptions,
): Promise<DishMarginsResult> {
  // R28 / M5: the period of the second figure travels with the request, so
  // the surface never compares today's recipe with the sales of all time.
  const params = new URLSearchParams();
  if (period?.from) params.set("from", period.from);
  if (period?.to) params.set("to", period.to);
  const qs = params.toString();
  const url = `/inventory/reports/dish-margins${qs ? `?${qs}` : ""}`;
  return opts ? api.get<DishMarginsResult>(url, opts) : api.get<DishMarginsResult>(url);
}
