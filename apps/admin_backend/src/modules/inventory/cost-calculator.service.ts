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
