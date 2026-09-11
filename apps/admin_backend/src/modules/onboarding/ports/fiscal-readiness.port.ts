export const FISCAL_READINESS_PORT = 'FISCAL_READINESS_PORT';

export interface FiscalReadinessResult {
  minimumConfigurationValid: boolean;
  businessName?: string;
  fiscalRegime?: string;
  taxRate?: number;
  pricesIncludeTax?: boolean;
}

export interface FiscalReadinessPort {
  evaluateFiscalReadiness(tenantId: string): Promise<FiscalReadinessResult>;
}
