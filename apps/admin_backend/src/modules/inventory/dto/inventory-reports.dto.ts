import { MovementType } from '../entities/inventory-movement.entity';

export interface InventoryValuationItemDto {
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

export interface InventoryValuationReportDto {
  totalValuationNio: number;
  totalItemsCount: number;
  itemsWithStockCount: number;
  itemsLowStockCount: number;
  itemsNegativeStockCount: number;
  generatedAt: string;
  items: InventoryValuationItemDto[];
}

export interface CogsReportItemDto {
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

export interface CogsReportDto {
  fromDate: string;
  toDate: string;
  totalCogsNio: number;
  salesCogsNio: number;
  shrinkageCogsNio: number;
  generatedAt: string;
  items: CogsReportItemDto[];
}

export interface KardexFilterQueryDto {
  from?: string;
  to?: string;
  insumoId?: string;
  type?: MovementType;
  warehouseId?: string;
  limit?: number;
  offset?: number;
}

export interface KardexReportItemDto {
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

export interface KardexReportDto {
  totalCount: number;
  filters: {
    from?: string;
    to?: string;
    insumoId?: string;
    type?: MovementType;
    warehouseId?: string;
  };
  generatedAt: string;
  movements: KardexReportItemDto[];
}

export type InventoryAlertSeverity = 'CRITICAL' | 'WARNING' | 'NEGATIVE_STOCK';

export interface InventoryAlertItemDto {
  insumoId: string;
  insumoName: string;
  consumptionUom: string;
  warehouseId?: string;
  isPerishable: boolean;
  stock: number;
  minStock?: number;
  parLevel?: number;
  severity: InventoryAlertSeverity;
  message: string;
  suggestedReorderQuantity: number;
}

export interface InventoryAlertsSummaryDto {
  totalAlertsCount: number;
  criticalCount: number;
  warningCount: number;
  negativeCount: number;
  generatedAt: string;
  alerts: InventoryAlertItemDto[];
}
