import { Test, TestingModule } from '@nestjs/testing';
import { OnboardingReadinessEvaluator } from './onboarding-readiness.evaluator';
import {
  IDENTITY_READINESS_PORT,
  IdentityReadinessPort,
} from '../ports/identity-readiness.port';
import {
  FISCAL_READINESS_PORT,
  FiscalReadinessPort,
} from '../ports/fiscal-readiness.port';
import {
  CATALOG_READINESS_PORT,
  CatalogReadinessPort,
} from '../ports/catalog-readiness.port';
import {
  INVENTORY_READINESS_PORT,
  InventoryReadinessPort,
} from '../ports/inventory-readiness.port';
import {
  COSTING_READINESS_PORT,
  CostingReadinessPort,
} from '../ports/costing-readiness.port';
import {
  OPERATIONS_READINESS_PORT,
  OperationsReadinessPort,
} from '../ports/operations-readiness.port';

describe('OnboardingReadinessEvaluator (Unit)', () => {
  let evaluator: OnboardingReadinessEvaluator;
  let identityPort: jest.Mocked<IdentityReadinessPort>;
  let fiscalPort: jest.Mocked<FiscalReadinessPort>;
  let catalogPort: jest.Mocked<CatalogReadinessPort>;
  let inventoryPort: jest.Mocked<InventoryReadinessPort>;
  let costingPort: jest.Mocked<CostingReadinessPort>;
  let operationsPort: jest.Mocked<OperationsReadinessPort>;

  beforeEach(async () => {
    identityPort = {
      evaluateIdentityReadiness: jest.fn(),
    };
    fiscalPort = {
      evaluateFiscalReadiness: jest.fn(),
    };
    catalogPort = {
      evaluateCatalogReadiness: jest.fn(),
    };
    inventoryPort = {
      evaluateInventoryReadiness: jest.fn(),
    };
    costingPort = {
      evaluateCostingReadiness: jest.fn(),
    };
    operationsPort = {
      evaluateOperationsReadiness: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingReadinessEvaluator,
        { provide: IDENTITY_READINESS_PORT, useValue: identityPort },
        { provide: FISCAL_READINESS_PORT, useValue: fiscalPort },
        { provide: CATALOG_READINESS_PORT, useValue: catalogPort },
        { provide: INVENTORY_READINESS_PORT, useValue: inventoryPort },
        { provide: COSTING_READINESS_PORT, useValue: costingPort },
        { provide: OPERATIONS_READINESS_PORT, useValue: operationsPort },
      ],
    }).compile();

    evaluator = module.get<OnboardingReadinessEvaluator>(
      OnboardingReadinessEvaluator,
    );
  });

  it('returns saleReady = true when identity, fiscal and at least 1 sellable product exist, even if BOH has pending cost and no physical stock (AC-07, AC-08)', async () => {
    identityPort.evaluateIdentityReadiness.mockResolvedValue({
      tenantExists: true,
      initialOwnerExists: true,
      ownerCanAuthenticate: true,
      tenantContextValid: true,
    });
    fiscalPort.evaluateFiscalReadiness.mockResolvedValue({
      minimumConfigurationValid: true,
      businessName: 'Comedor Central',
      fiscalRegime: 'GENERAL',
      taxRate: 15,
    });
    catalogPort.evaluateCatalogReadiness.mockResolvedValue({
      sellableProductCount: 2,
      hasSellableProduct: true,
    });
    inventoryPort.evaluateInventoryReadiness.mockResolvedValue({
      inventoryReady: true,
      scope: 'BASIC',
      warehouseCount: 1,
      trackedProductCount: 2,
      trackedInsumoCount: 0,
      itemsWithStockCount: 0,
      hasDefaultWarehouse: true,
      notes: ['INITIAL_STOCK_NOT_LOADED_OPTIONAL'],
    });
    costingPort.evaluateCostingReadiness.mockResolvedValue({
      costingReady: false,
      totalProducts: 2,
      knownCostCount: 0,
      pendingCostCount: 2,
      notApplicableCount: 0,
      items: [
        {
          productId: 'prod-1',
          productName: 'Plato del Día',
          state: 'COST_PENDING',
          reason: 'ZERO_COST_WITHOUT_INVENTORY_PROVENANCE',
          provenance: 'NONE',
        },
      ],
    });
    operationsPort.evaluateOperationsReadiness.mockResolvedValue({
      operationsReady: false,
      staffCount: 1,
      additionalStaffCount: 0,
      publishedRecipeCount: 0,
      supplierCount: 0,
      categoryCount: 0,
      details: {
        hasAdditionalStaff: false,
        hasPublishedRecipes: false,
        hasSuppliers: false,
        hasCategories: false,
      },
      notes: [],
    });

    const snapshot = await evaluator.evaluate('tenant-123');

    expect(snapshot.saleReady).toBe(true);
    expect(snapshot.blockers).toEqual([]);
    expect(snapshot.inventoryReady).toBe(true);
    expect(snapshot.costingReady).toBe(false);
    expect(snapshot.operationsReady).toBe(false);
    expect(snapshot.warnings).toContain('COSTING_PENDING_PROVENANCE');
    expect(snapshot.identity.tenantContextValid).toBe(true);
    expect(snapshot.fiscal.minimumConfigurationValid).toBe(true);
    expect(snapshot.catalog.sellableProductCount).toBe(2);
  });

  it('includes INVENTORY_ENRICHMENT_PENDING warning without blocking saleReady when enrichment is pending', async () => {
    identityPort.evaluateIdentityReadiness.mockResolvedValue({
      tenantExists: true,
      initialOwnerExists: true,
      ownerCanAuthenticate: true,
      tenantContextValid: true,
    });
    fiscalPort.evaluateFiscalReadiness.mockResolvedValue({
      minimumConfigurationValid: true,
      businessName: 'Comedor Central',
      fiscalRegime: 'GENERAL',
      taxRate: 15,
    });
    catalogPort.evaluateCatalogReadiness.mockResolvedValue({
      sellableProductCount: 2,
      hasSellableProduct: true,
    });
    inventoryPort.evaluateInventoryReadiness.mockResolvedValue({
      inventoryReady: true,
      scope: 'BASIC',
      warehouseCount: 1,
      trackedProductCount: 5,
      trackedInsumoCount: 0,
      itemsWithStockCount: 0,
      hasDefaultWarehouse: true,
      inventoryEnrichmentPendingCount: 3,
      notes: ['INVENTORY_ENRICHMENT_PENDING'],
    });
    costingPort.evaluateCostingReadiness.mockResolvedValue({
      costingReady: true,
      totalProducts: 2,
      knownCostCount: 2,
      pendingCostCount: 0,
      notApplicableCount: 0,
      items: [],
    });
    operationsPort.evaluateOperationsReadiness.mockResolvedValue({
      operationsReady: true,
      staffCount: 1,
      additionalStaffCount: 0,
      publishedRecipeCount: 0,
      supplierCount: 0,
      categoryCount: 1,
      details: {
        hasAdditionalStaff: false,
        hasPublishedRecipes: false,
        hasSuppliers: false,
        hasCategories: true,
      },
      notes: [],
    });

    const snapshot = await evaluator.evaluate('tenant-warning');

    expect(snapshot.saleReady).toBe(true);
    expect(snapshot.blockers).toEqual([]);
    expect(snapshot.warnings).toContain('INVENTORY_ENRICHMENT_PENDING');
  });

  it('returns saleReady = false with blocker when catalog has 0 sellable products', async () => {
    identityPort.evaluateIdentityReadiness.mockResolvedValue({
      tenantExists: true,
      initialOwnerExists: true,
      ownerCanAuthenticate: true,
      tenantContextValid: true,
    });
    fiscalPort.evaluateFiscalReadiness.mockResolvedValue({
      minimumConfigurationValid: true,
    });
    catalogPort.evaluateCatalogReadiness.mockResolvedValue({
      sellableProductCount: 0,
      hasSellableProduct: false,
    });
    inventoryPort.evaluateInventoryReadiness.mockResolvedValue({
      inventoryReady: false,
      scope: 'NONE',
      warehouseCount: 0,
      trackedProductCount: 0,
      trackedInsumoCount: 0,
      itemsWithStockCount: 0,
      hasDefaultWarehouse: false,
      notes: [],
    });
    costingPort.evaluateCostingReadiness.mockResolvedValue({
      costingReady: false,
      totalProducts: 0,
      knownCostCount: 0,
      pendingCostCount: 0,
      notApplicableCount: 0,
      items: [],
    });
    operationsPort.evaluateOperationsReadiness.mockResolvedValue({
      operationsReady: false,
      staffCount: 1,
      additionalStaffCount: 0,
      publishedRecipeCount: 0,
      supplierCount: 0,
      categoryCount: 0,
      details: {
        hasAdditionalStaff: false,
        hasPublishedRecipes: false,
        hasSuppliers: false,
        hasCategories: false,
      },
      notes: [],
    });

    const snapshot = await evaluator.evaluate('tenant-123');

    expect(snapshot.saleReady).toBe(false);
    expect(snapshot.blockers).toContain('CATALOG_NO_SELLABLE_PRODUCTS');
  });

  it('returns saleReady = false with blocker when fiscal minimum configuration is invalid', async () => {
    identityPort.evaluateIdentityReadiness.mockResolvedValue({
      tenantExists: true,
      initialOwnerExists: true,
      ownerCanAuthenticate: true,
      tenantContextValid: true,
    });
    fiscalPort.evaluateFiscalReadiness.mockResolvedValue({
      minimumConfigurationValid: false,
    });
    catalogPort.evaluateCatalogReadiness.mockResolvedValue({
      sellableProductCount: 5,
      hasSellableProduct: true,
    });
    inventoryPort.evaluateInventoryReadiness.mockResolvedValue({
      inventoryReady: true,
      scope: 'BASIC',
      warehouseCount: 1,
      trackedProductCount: 5,
      trackedInsumoCount: 0,
      itemsWithStockCount: 0,
      hasDefaultWarehouse: true,
      notes: [],
    });
    costingPort.evaluateCostingReadiness.mockResolvedValue({
      costingReady: true,
      totalProducts: 5,
      knownCostCount: 5,
      pendingCostCount: 0,
      notApplicableCount: 0,
      items: [],
    });
    operationsPort.evaluateOperationsReadiness.mockResolvedValue({
      operationsReady: true,
      staffCount: 2,
      additionalStaffCount: 1,
      publishedRecipeCount: 0,
      supplierCount: 1,
      categoryCount: 2,
      details: {
        hasAdditionalStaff: true,
        hasPublishedRecipes: false,
        hasSuppliers: true,
        hasCategories: true,
      },
      notes: [],
    });

    const snapshot = await evaluator.evaluate('tenant-123');

    expect(snapshot.saleReady).toBe(false);
    expect(snapshot.blockers).toContain('FISCAL_CONFIGURATION_INCOMPLETE');
  });
});
