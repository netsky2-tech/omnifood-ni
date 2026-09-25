export const COSTING_READINESS_PORT = 'COSTING_READINESS_PORT';

export type CostStateKind = 'KNOWN' | 'COST_PENDING' | 'NOT_APPLICABLE';

export interface ProductCostItem {
  productId: string;
  productName: string;
  state: CostStateKind;
  value?: number;
  reason?: string;
  provenance?:
    'KARDEX' | 'PURCHASE_DOCUMENT' | 'MANUAL_INITIAL_PROVENANCE' | 'NONE';
}

export interface CostingReadinessResult {
  costingReady: boolean;
  totalProducts: number;
  knownCostCount: number;
  pendingCostCount: number;
  notApplicableCount: number;
  items: ProductCostItem[];
}

export interface CostingReadinessPort {
  evaluateCostingReadiness(tenantId: string): Promise<CostingReadinessResult>;
}
