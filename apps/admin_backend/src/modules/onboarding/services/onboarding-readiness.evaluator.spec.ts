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

describe('OnboardingReadinessEvaluator (Unit)', () => {
  let evaluator: OnboardingReadinessEvaluator;
  let identityPort: jest.Mocked<IdentityReadinessPort>;
  let fiscalPort: jest.Mocked<FiscalReadinessPort>;
  let catalogPort: jest.Mocked<CatalogReadinessPort>;

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingReadinessEvaluator,
        { provide: IDENTITY_READINESS_PORT, useValue: identityPort },
        { provide: FISCAL_READINESS_PORT, useValue: fiscalPort },
        { provide: CATALOG_READINESS_PORT, useValue: catalogPort },
      ],
    }).compile();

    evaluator = module.get<OnboardingReadinessEvaluator>(
      OnboardingReadinessEvaluator,
    );
  });

  it('returns saleReady = true when identity, fiscal and at least 1 sellable product exist', async () => {
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

    const snapshot = await evaluator.evaluate('tenant-123');

    expect(snapshot.saleReady).toBe(true);
    expect(snapshot.blockers).toEqual([]);
    expect(snapshot.identity.tenantContextValid).toBe(true);
    expect(snapshot.fiscal.minimumConfigurationValid).toBe(true);
    expect(snapshot.catalog.sellableProductCount).toBe(2);
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

    const snapshot = await evaluator.evaluate('tenant-123');

    expect(snapshot.saleReady).toBe(false);
    expect(snapshot.blockers).toContain('FISCAL_CONFIGURATION_INCOMPLETE');
  });
});
