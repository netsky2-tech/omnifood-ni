import { BadRequestException, Injectable } from '@nestjs/common';

const PURCHASE_CURRENCY = {
  NIO: 'NIO',
  USD: 'USD',
} as const;

type PurchaseCurrency =
  (typeof PURCHASE_CURRENCY)[keyof typeof PURCHASE_CURRENCY];

const PURCHASE_CPP_SCALE = 4;
const PURCHASE_CPP_ROUNDING_FACTOR = 10 ** PURCHASE_CPP_SCALE;

const roundPurchaseCpp = (value: number): number =>
  Number(
    (
      Math.round((value + Number.EPSILON) * PURCHASE_CPP_ROUNDING_FACTOR) /
      PURCHASE_CPP_ROUNDING_FACTOR
    ).toFixed(PURCHASE_CPP_SCALE),
  );

export interface PurchaseCppInput {
  currentStock: number;
  currentCppNio: number;
  entryQuantity: number;
  entryUnitCost: number;
  currency: PurchaseCurrency;
  bcnRateNio?: number;
}

export interface PurchaseCppResult {
  previousStock: number;
  previousCppNio: number;
  projectedStock: number;
  unitCostNio: number;
  projectedCppNio: number;
}

export interface RecipeTheoreticalCostComponent {
  ingredientId: string;
  ingredientName?: string;
  ingredientType: string;
  grossQuantity: number;
  technicalShrinkPct: number;
  unitCostNio: number;
  totalCostNio: number;
  costPercentage: number;
}

export interface RecipeTheoreticalCostResult {
  totalBatchCostNio: number;
  unitTheoreticalCostNio: number;
  yieldQuantity: number;
  components: RecipeTheoreticalCostComponent[];
  grossMarginNio?: number;
  grossMarginPct?: number;
}

export interface CalculateRecipeTheoreticalCostInput {
  yieldQuantity: number;
  sellingPriceNio?: number;
  components: {
    ingredientId: string;
    ingredientName?: string;
    ingredientType: string;
    grossQuantity: number;
    technicalShrinkPct: number;
    unitCostNio: number;
  }[];
}

@Injectable()
export class CostCalculatorService {
  /**
   * Calculates the new weighted average cost of an item.
   * Formula: (Current Total Cost + New Batch Cost) / (Current Stock + New Quantity)
   */
  calculateAverageCost(
    currentStock: number,
    currentAverageCost: number,
    purchaseQuantity: number,
    purchaseUnitCost: number,
  ): number {
    const currentTotalCost = Number(currentStock) * Number(currentAverageCost);
    const newBatchCost = Number(purchaseQuantity) * Number(purchaseUnitCost);
    const totalQuantity = Number(currentStock) + Number(purchaseQuantity);

    if (totalQuantity === 0) {
      return 0;
    }

    const newAverageCost = (currentTotalCost + newBatchCost) / totalQuantity;
    return Number(newAverageCost.toFixed(8));
  }

  /**
   * Calculates purchase CPP in NIO using the official Batch 3b formula.
   * Formula: (Stock_Actual * CPP_Actual + Cantidad_Entrada * Costo_Entrada_NIO)
   * / (Stock_Actual + Cantidad_Entrada).
   */
  calculatePurchaseCpp(input: PurchaseCppInput): PurchaseCppResult {
    const previousStock = roundPurchaseCpp(Number(input.currentStock));
    const previousCppNio = roundPurchaseCpp(Number(input.currentCppNio));
    const entryQuantity = Number(input.entryQuantity);
    const unitCostNio = this.calculatePurchaseUnitCostNio(input);
    const projectedStock = roundPurchaseCpp(previousStock + entryQuantity);

    const projectedCppNio =
      projectedStock === 0
        ? 0
        : roundPurchaseCpp(
            (previousStock * previousCppNio + entryQuantity * unitCostNio) /
              projectedStock,
          );

    return {
      previousStock,
      previousCppNio,
      projectedStock,
      unitCostNio,
      projectedCppNio,
    };
  }

  /**
   * Calculates theoretical cost and margin of a recipe based on component gross quantities and CPPs.
   */
  calculateRecipeTheoreticalCost(
    input: CalculateRecipeTheoreticalCostInput,
  ): RecipeTheoreticalCostResult {
    const yieldQuantity = input.yieldQuantity > 0 ? input.yieldQuantity : 1;
    let totalBatchCostNio = 0;

    const rawComponents = input.components.map((c) => {
      const lineCost = roundPurchaseCpp(
        Number(c.grossQuantity) * Number(c.unitCostNio),
      );
      totalBatchCostNio = roundPurchaseCpp(totalBatchCostNio + lineCost);
      return {
        ingredientId: c.ingredientId,
        ingredientName: c.ingredientName,
        ingredientType: c.ingredientType,
        grossQuantity: roundPurchaseCpp(Number(c.grossQuantity)),
        technicalShrinkPct: roundPurchaseCpp(Number(c.technicalShrinkPct)),
        unitCostNio: roundPurchaseCpp(Number(c.unitCostNio)),
        totalCostNio: lineCost,
      };
    });

    const components: RecipeTheoreticalCostComponent[] = rawComponents.map(
      (c) => ({
        ...c,
        costPercentage:
          totalBatchCostNio > 0
            ? roundPurchaseCpp((c.totalCostNio / totalBatchCostNio) * 100)
            : 0,
      }),
    );

    const unitTheoreticalCostNio = roundPurchaseCpp(
      totalBatchCostNio / yieldQuantity,
    );

    let grossMarginNio: number | undefined;
    let grossMarginPct: number | undefined;

    if (input.sellingPriceNio != null && input.sellingPriceNio > 0) {
      grossMarginNio = roundPurchaseCpp(
        input.sellingPriceNio - unitTheoreticalCostNio,
      );
      grossMarginPct = roundPurchaseCpp(
        (grossMarginNio / input.sellingPriceNio) * 100,
      );
    }

    return {
      totalBatchCostNio,
      unitTheoreticalCostNio,
      yieldQuantity,
      components,
      grossMarginNio,
      grossMarginPct,
    };
  }

  private calculatePurchaseUnitCostNio(input: PurchaseCppInput): number {
    if (input.currency === PURCHASE_CURRENCY.NIO) {
      return roundPurchaseCpp(Number(input.entryUnitCost));
    }

    if (input.bcnRateNio == null || input.bcnRateNio <= 0) {
      throw new BadRequestException(
        'USD purchase CPP requires a positive BCN exchange rate',
      );
    }

    return roundPurchaseCpp(
      Number(input.entryUnitCost) * Number(input.bcnRateNio),
    );
  }
}
