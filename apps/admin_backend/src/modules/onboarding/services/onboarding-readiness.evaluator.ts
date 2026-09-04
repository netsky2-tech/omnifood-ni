import { Injectable, Inject } from '@nestjs/common';
import {
  IDENTITY_READINESS_PORT,
  IdentityReadinessPort,
  IdentityReadinessResult,
} from '../ports/identity-readiness.port';
import {
  FISCAL_READINESS_PORT,
  FiscalReadinessPort,
  FiscalReadinessResult,
} from '../ports/fiscal-readiness.port';
import {
  CATALOG_READINESS_PORT,
  CatalogReadinessPort,
  CatalogReadinessResult,
} from '../ports/catalog-readiness.port';

export interface OnboardingReadinessSnapshot {
  identity: IdentityReadinessResult;
  fiscal: FiscalReadinessResult;
  catalog: CatalogReadinessResult;
  saleReady: boolean;
  inventoryReady: boolean;
  costingReady: boolean;
  operationsReady: boolean;
  blockers: string[];
  warnings: string[];
  evaluatedAt: Date;
}

@Injectable()
export class OnboardingReadinessEvaluator {
  constructor(
    @Inject(IDENTITY_READINESS_PORT)
    private readonly identityPort: IdentityReadinessPort,
    @Inject(FISCAL_READINESS_PORT)
    private readonly fiscalPort: FiscalReadinessPort,
    @Inject(CATALOG_READINESS_PORT)
    private readonly catalogPort: CatalogReadinessPort,
  ) {}

  async evaluate(tenantId: string): Promise<OnboardingReadinessSnapshot> {
    const [identity, fiscal, catalog] = await Promise.all([
      this.identityPort.evaluateIdentityReadiness(tenantId),
      this.fiscalPort.evaluateFiscalReadiness(tenantId),
      this.catalogPort.evaluateCatalogReadiness(tenantId),
    ]);

    const blockers: string[] = [];
    const warnings: string[] = [];

    if (!identity.tenantExists || !identity.tenantContextValid) {
      blockers.push('IDENTITY_TENANT_INVALID');
    }
    if (!identity.initialOwnerExists || !identity.ownerCanAuthenticate) {
      blockers.push('IDENTITY_OWNER_NOT_READY');
    }
    if (!fiscal.minimumConfigurationValid) {
      blockers.push('FISCAL_CONFIGURATION_INCOMPLETE');
    }
    if (catalog.sellableProductCount < 1) {
      blockers.push('CATALOG_NO_SELLABLE_PRODUCTS');
    }

    const saleReady = blockers.length === 0;

    return {
      identity,
      fiscal,
      catalog,
      saleReady,
      inventoryReady: false,
      costingReady: false,
      operationsReady: false,
      blockers,
      warnings,
      evaluatedAt: new Date(),
    };
  }
}
