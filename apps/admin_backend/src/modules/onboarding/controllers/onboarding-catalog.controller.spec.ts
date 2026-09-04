import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { OnboardingCatalogController } from './onboarding-catalog.controller';
import { OnboardingCatalogService } from '../services/onboarding-catalog.service';
import { OnboardingLifecycleState } from '../entities/onboarding-session.entity';
import { CreateManualProductDto } from '../dto/onboarding-catalog.dto';

describe('OnboardingCatalogController (Unit)', () => {
  let controller: OnboardingCatalogController;
  let service: jest.Mocked<OnboardingCatalogService>;

  const mockSession = {
    id: 'session-123',
    tenantId: 'tenant-test',
    lifecycleState: OnboardingLifecycleState.SALE_READY,
    onboardingStartedAt: new Date(),
    saleReadyFirstAt: new Date(),
    activationStartedAt: null,
    activatedAt: null,
    firstSuccessfulSaleAt: null,
    firstCustomerSaleAt: null,
    lastActivityAt: new Date(),
    currentActivationAttemptId: null,
    measurementEligible: true,
    legacyBaseline: false,
    optimisticVersion: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockReadiness = {
    identity: { tenantExists: true, initialOwnerExists: true, ownerCanAuthenticate: true, tenantContextValid: true },
    fiscal: { minimumConfigurationValid: true, businessName: 'Café Test' },
    catalog: { sellableProductCount: 1, hasSellableProduct: true },
    saleReady: true,
    inventoryReady: false,
    costingReady: false,
    operationsReady: false,
    blockers: [],
    warnings: [],
    evaluatedAt: new Date(),
  };

  beforeEach(() => {
    service = {
      createManualProduct: jest.fn(),
      getCatalogSummary: jest.fn(),
    } as unknown as jest.Mocked<OnboardingCatalogService>;

    controller = new OnboardingCatalogController(service);
  });

  describe('createManualProduct', () => {
    it('throws UnauthorizedException when tenantId is missing', async () => {
      const req: any = { user: { sub: 'user-1' } };
      const dto: CreateManualProductDto = {
        name: 'Café Americano',
        sellPrice: 45.0,
      };

      await expect(controller.createManualProduct(dto, req, undefined)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('creates manual product and returns product, session, and readiness', async () => {
      const req: any = { user: { sub: 'user-1', tenant_id: 'tenant-test' } };
      const dto: CreateManualProductDto = {
        name: 'Café Americano',
        sellPrice: 45.0,
        uom: 'UN',
      };

      const expectedResponse = {
        product: {
          id: 'prod-1',
          name: 'Café Americano',
          sellPrice: 45.0,
          uom: 'UN',
          category_code: undefined,
          costStatus: 'COST_PENDING' as const,
          is_active: true,
        },
        session: mockSession,
        readiness: mockReadiness,
      };

      service.createManualProduct.mockResolvedValueOnce(expectedResponse);

      const result = await controller.createManualProduct(dto, req, 'tenant-test');
      expect(result).toEqual(expectedResponse);
      expect(service.createManualProduct).toHaveBeenCalledWith('tenant-test', dto, 'user-1');
    });
  });

  describe('getCatalogSummary', () => {
    it('throws UnauthorizedException when tenantId is missing', async () => {
      const req: any = { user: {} };
      await expect(controller.getCatalogSummary(req, undefined)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('returns catalog summary for tenant', async () => {
      const req: any = { user: { tenant_id: 'tenant-test' } };
      const expectedSummary = {
        sellableProductCount: 1,
        hasSellableProduct: true,
        sampleProducts: [
          {
            id: 'prod-1',
            name: 'Café Americano',
            sellPrice: 45.0,
            uom: 'UN',
            category_code: null,
            costStatus: 'COST_PENDING' as const,
            is_active: true,
          },
        ],
      };

      service.getCatalogSummary.mockResolvedValueOnce(expectedSummary);

      const result = await controller.getCatalogSummary(req, 'tenant-test');
      expect(result).toEqual(expectedSummary);
      expect(service.getCatalogSummary).toHaveBeenCalledWith('tenant-test');
    });
  });

  describe('getVerificationProductCandidate (ONB1.6D)', () => {
    it('throws UnauthorizedException when tenantId is missing', async () => {
      const req: any = { user: { sub: 'user-1' } };
      await expect(
        controller.getVerificationProductCandidate(req, undefined, undefined),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('delegates to catalogService.getVerificationProductCandidate with tenant and optional productId', async () => {
      const req: any = { user: { sub: 'user-1', tenant_id: 'tenant-test' } };
      const expectedCandidate = {
        verificationProductId: 'prod-123',
        name: 'Café Latte',
        sellPrice: 55,
        uom: 'UN',
        tenantId: 'tenant-test',
        isActive: true,
        verificationProductRevision: 1,
        verificationProductFingerprint: 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234',
      };

      service.getVerificationProductCandidate = jest.fn().mockResolvedValueOnce(expectedCandidate);

      const result = await controller.getVerificationProductCandidate(req, 'prod-123', 'tenant-test');
      expect(result).toEqual(expectedCandidate);
      expect(service.getVerificationProductCandidate).toHaveBeenCalledWith('tenant-test', 'prod-123');
    });
  });
});
