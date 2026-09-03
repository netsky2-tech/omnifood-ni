export interface CostQueryResult {
  status: 'AVAILABLE' | 'NOT_AVAILABLE';
  estimatedCppNio?: number;
  canonicalBasePriceNio?: number;
  reason?: string;
}

export const INVENTORY_COST_QUERY_PORT = Symbol('InventoryCostQueryPort');

export interface InventoryCostQueryPort {
  /**
   * Retrieves the current estimated CPP and canonical base retail price.
   * Strictly read-only: MUST NOT perform stock movements, Kardex writes, or state mutations.
   */
  getCurrentEstimatedCostAndPrice(
    tenantId: string,
    productId: string,
    variantId?: string,
    branchId?: string,
  ): Promise<CostQueryResult>;
}
