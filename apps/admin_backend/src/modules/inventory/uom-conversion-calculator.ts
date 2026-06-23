import { Injectable } from '@nestjs/common';

/**
 * UOM conversion governance (Batch 1, NFR Decimal 4dp).
 *
 * SINGLE RULE — documented and tested:
 *
 *   inventoryBaseQuantity = purchaseQuantity * factorToInventoryBase
 *
 * The stock is ALWAYS stored in the insumo's base inventory unit. The factor
 * expresses how many base-inventory units one purchase unit equals.
 *
 * Example (lb -> kg):
 *   purchaseQuantity = 50 (lb)
 *   factorToInventoryBase = 0.453592 (kg per lb)
 *   inventoryBaseQuantity = 50 * 0.453592 = 22.6796 kg
 *
 * Results are rounded to 4 decimal places (NUMERIC(14,4)) so the inventory
 * source of truth is deterministic and never accumulates float drift.
 */
@Injectable()
export class UomConversionCalculator {
  /** Fixed scale for all inventory cost/stock quantities. */
  static readonly INVENTORY_SCALE = 4;

  /**
   * Convert a purchase-unit quantity into the base inventory unit.
   * @param purchaseQuantity  quantity expressed in the purchase UOM
   * @param factorToInventoryBase  base-inventory units per one purchase unit
   * @returns quantity in the base inventory unit, rounded to 4 decimals
   */
  toInventoryBaseQuantity(
    purchaseQuantity: number,
    factorToInventoryBase: number,
  ): number {
    if (factorToInventoryBase <= 0) {
      throw new Error(
        'factorToInventoryBase must be > 0 (one purchase unit must equal a positive amount of base inventory unit)',
      );
    }
    return roundToScale(
      purchaseQuantity * factorToInventoryBase,
      UomConversionCalculator.INVENTORY_SCALE,
    );
  }

  /**
   * Inverse conversion: how many purchase units are needed to deliver a target
   * base-inventory quantity. Rounded to 4 decimals.
   */
  fromInventoryBaseQuantity(
    inventoryBaseQuantity: number,
    factorToInventoryBase: number,
  ): number {
    if (factorToInventoryBase <= 0) {
      throw new Error(
        'factorToInventoryBase must be > 0',
      );
    }
    return roundToScale(
      inventoryBaseQuantity / factorToInventoryBase,
      UomConversionCalculator.INVENTORY_SCALE,
    );
  }
}

/** Round half-away-from-zero to a fixed decimal scale (matches NUMERIC(14,4)). */
export function roundToScale(value: number, scale: number): number {
  const factor = Math.pow(10, scale);
  const rounded = Math.round(Math.abs(value) * factor) / factor;
  return value < 0 ? -rounded : rounded;
}
