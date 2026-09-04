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
import {
  INVENTORY_READINESS_PORT,
  InventoryReadinessPort,
  InventoryReadinessResult,
} from '../ports/inventory-readiness.port';
import {
  COSTING_READINESS_PORT,
  CostingReadinessPort,
  CostingReadinessResult,
} from '../ports/costing-readiness.port';
import {
  OPERATIONS_READINESS_PORT,
  OperationsReadinessPort,
  OperationsReadinessResult,
} from '../ports/operations-readiness.port';

export interface OnboardingReadinessSnapshot {
  identity: IdentityReadinessResult;
  fiscal: FiscalReadinessResult;
  catalog: CatalogReadinessResult;
  inventory?: InventoryReadinessResult;
  costing?: CostingReadinessResult;
  operations?: OperationsReadinessResult;
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
    @Inject(INVENTORY_READINESS_PORT)
    private readonly inventoryPort: InventoryReadinessPort,
    @Inject(COSTING_READINESS_PORT)
    private readonly costingPort: CostingReadinessPort,
    @Inject(OPERATIONS_READINESS_PORT)
    private readonly operationsPort: OperationsReadinessPort,
  ) {}

  async evaluate(tenantId: string): Promise<OnboardingReadinessSnapshot> {
    const [identity, fiscal, catalog, inventory, costing, operations] =
      await Promise.all([
        this.identityPort.evaluateIdentityReadiness(tenantId),
        this.fiscalPort.evaluateFiscalReadiness(tenantId),
        this.catalogPort.evaluateCatalogReadiness(tenantId),
        this.inventoryPort.evaluateInventoryReadiness(tenantId),
        this.costingPort.evaluateCostingReadiness(tenantId),
        this.operationsPort.evaluateOperationsReadiness(tenantId),
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

    // AC-07, AC-08, AC-40, AC-41: BOH deficiencies produce non-blocking warnings, NEVER blockers
    if (costing.pendingCostCount > 0) {
      warnings.push('COSTING_PENDING_PROVENANCE');
    }
    if (!inventory.inventoryReady) {
      warnings.push('INVENTORY_NOT_INITIALIZED_OPTIONAL');
    }

    const saleReady = blockers.length === 0;

    return {
      identity,
      fiscal,
      catalog,
      inventory,
      costing,
      operations,
      saleReady,
      inventoryReady: inventory.inventoryReady,
      costingReady: costing.costingReady,
      operationsReady: operations.operationsReady,
      blockers,
      warnings,
      evaluatedAt: new Date(),
    };
  }
}
