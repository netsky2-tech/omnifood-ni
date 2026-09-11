export const INVENTORY_READINESS_PORT = 'INVENTORY_READINESS_PORT';

export type InventoryScope = 'NONE' | 'BASIC' | 'ADVANCED';

export interface InventoryReadinessResult {
  inventoryReady: boolean;
  scope: InventoryScope;
  warehouseCount: number;
  trackedProductCount: number;
  trackedInsumoCount: number;
  itemsWithStockCount: number;
  hasDefaultWarehouse: boolean;
  notes: string[];
  inventoryEnrichmentPendingCount?: number;
}

export interface InventoryReadinessPort {
  evaluateInventoryReadiness(
    tenantId: string,
  ): Promise<InventoryReadinessResult>;
}
