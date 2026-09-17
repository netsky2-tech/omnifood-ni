import { Injectable } from '@nestjs/common';
import {
  FiscalReadinessPort,
  FiscalReadinessResult,
} from '../ports/fiscal-readiness.port';
import { FiscalSetupService } from '../services/fiscal-setup.service';
import { isValidRuc } from '../utils/nicaragua-fiscal.validator';

@Injectable()
export class FiscalReadinessAdapter implements FiscalReadinessPort {
  constructor(private readonly fiscalSetupService: FiscalSetupService) {}

  async evaluateFiscalReadiness(
    tenantId: string,
  ): Promise<FiscalReadinessResult> {
    try {
      const config = await this.fiscalSetupService.getFiscalSetup(tenantId);
      const minimumConfigurationValid = Boolean(
        config &&
        config.businessName?.trim() &&
        config.regime &&
        isValidRuc(config.ruc),
      );

      return {
        minimumConfigurationValid,
        businessName: config?.businessName,
        fiscalRegime: config?.regime,
        taxRate: config?.taxRateIva,
        pricesIncludeTax: config?.pricesIncludeTax,
      };
    } catch {
      return {
        minimumConfigurationValid: false,
      };
    }
  }
}
