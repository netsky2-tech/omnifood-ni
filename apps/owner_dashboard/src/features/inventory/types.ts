export interface ValuationItem {
  id: string;
  name: string;
  consumptionUom: string;
  warehouseId?: string;
  isPerishable: boolean;
  stock: number;
  averageCostNio: number;
  totalValuationNio: number;
  stockMin?: number;
  stockMax?: number;
  parLevel?: number;
  isLowStock: boolean;
  isNegativeStock: boolean;
}

export interface ValuationReport {
  totalValuationNio: number;
  totalItemsCount: number;
  itemsWithStockCount: number;
  itemsLowStockCount: number;
  itemsNegativeStockCount: number;
  generatedAt: string;
  items: ValuationItem[];
}

export interface CogsItem {
  insumoId: string;
  insumoName: string;
  consumptionUom: string;
  salesQuantity: number;
  salesCostNio: number;
  shrinkageQuantity: number;
  shrinkageCostNio: number;
  totalQuantity: number;
  totalCostNio: number;
  costPercentage: number;
}

export interface CogsReport {
  fromDate: string;
  toDate: string;
  totalCogsNio: number;
  salesCogsNio: number;
  shrinkageCogsNio: number;
  generatedAt: string;
  items: CogsItem[];
}

export type MovementType = "ENTRY" | "EXIT" | "ADJUSTMENT" | "TRANSFER" | "SHRINKAGE";

export interface KardexMovement {
  id: string;
  insumoId: string;
  insumoName: string;
  consumptionUom: string;
  type: MovementType;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  unitCostNio?: number;
  totalCostNio?: number;
  averageCostAfterNio?: number;
  reason?: string;
  sourceDocumentType?: string;
  sourceDocumentId?: string;
  createdAt: string;
}

export interface KardexReport {
  totalCount: number;
  filters: {
    from?: string;
    to?: string;
    insumoId?: string;
    type?: MovementType;
    warehouseId?: string;
  };
  generatedAt: string;
  movements: KardexMovement[];
}

export type AlertSeverity = "CRITICAL" | "WARNING" | "NEGATIVE_STOCK";

export interface InventoryAlert {
  insumoId: string;
  insumoName: string;
  consumptionUom: string;
  warehouseId?: string;
  isPerishable: boolean;
  stock: number;
  minStock?: number;
  parLevel?: number;
  severity: AlertSeverity;
  message: string;
  suggestedReorderQuantity: number;
}

export interface AlertsSummary {
  totalAlertsCount: number;
  criticalCount: number;
  warningCount: number;
  negativeCount: number;
  generatedAt: string;
  alerts: InventoryAlert[];
}

export interface KardexFilters {
  from?: string;
  to?: string;
  insumoId?: string;
  type?: MovementType;
  warehouseId?: string;
  limit?: number;
  offset?: number;
}
