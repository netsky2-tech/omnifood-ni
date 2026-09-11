export const CATALOG_READINESS_PORT = 'CATALOG_READINESS_PORT';

export interface CatalogReadinessResult {
  sellableProductCount: number;
  hasSellableProduct: boolean;
}

export interface CatalogReadinessPort {
  evaluateCatalogReadiness(tenantId: string): Promise<CatalogReadinessResult>;
}
