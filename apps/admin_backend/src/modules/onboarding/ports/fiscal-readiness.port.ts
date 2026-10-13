export const FISCAL_READINESS_PORT = 'FISCAL_READINESS_PORT';

export interface FiscalReadinessResult {
  minimumConfigurationValid: boolean;
  businessName?: string;
  fiscalRegime?: string;
  taxRate?: number;
  pricesIncludeTax?: boolean;
  /**
   * Hard activation gate (T4/S7): null/undefined = the tenant never
   * configured its operation mode (restaurante/foodpark) — a blocker.
   */
  operationMode: string | null;
  /**
   * Hard activation gate (T4/S7): false = the tenant never configured its
   * commercial FX rate — a blocker. Absent on the fail-closed error path.
   */
  commercialFxSpreadConfigured?: boolean;
}

export interface FiscalReadinessPort {
  evaluateFiscalReadiness(tenantId: string): Promise<FiscalReadinessResult>;
}
