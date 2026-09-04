export const OPERATIONS_READINESS_PORT = 'OPERATIONS_READINESS_PORT';

export interface OperationsReadinessDetails {
  hasAdditionalStaff: boolean;
  hasPublishedRecipes: boolean;
  hasSuppliers: boolean;
  hasCategories: boolean;
}

export interface OperationsReadinessResult {
  operationsReady: boolean;
  staffCount: number;
  additionalStaffCount: number;
  publishedRecipeCount: number;
  supplierCount: number;
  categoryCount: number;
  details: OperationsReadinessDetails;
  notes: string[];
}

export interface OperationsReadinessPort {
  evaluateOperationsReadiness(
    tenantId: string,
  ): Promise<OperationsReadinessResult>;
}
