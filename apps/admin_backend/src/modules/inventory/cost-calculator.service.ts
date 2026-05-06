import { Injectable } from '@nestjs/common';

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
}
