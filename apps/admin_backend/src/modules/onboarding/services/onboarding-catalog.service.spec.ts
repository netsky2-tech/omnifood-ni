import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { OnboardingCatalogService } from './onboarding-catalog.service';
import { Product, ProductType } from '../../inventory/entities/product.entity';
import { OnboardingSessionService, OnboardingStartSource } from './onboarding-session.service';
import { OnboardingReadinessEvaluator } from './onboarding-readiness.evaluator';
import { OnboardingStateReconciler } from './onboarding-state.reconciler';
import { OnboardingLifecycleState } from '../entities/onboarding-session.entity';
import { CreateManualProductDto } from '../dto/onboarding-catalog.dto';

describe('OnboardingCatalogService (Unit)', () => {
  let service: OnboardingCatalogService;
  let productRepo: jest.Mocked<Repository<Product>>;
  let sessionService: jest.Mocked<OnboardingSessionService>;
  let readinessEvaluator: jest.Mocked<OnboardingReadinessEvaluator>;
  let stateReconciler: jest.Mocked<OnboardingStateReconciler>;

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
    productRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
      createQueryBuilder: jest.fn(),
    } as unknown as jest.Mocked<Repository<Product>>;

    sessionService = {
      ensureOnboardingStarted: jest.fn().mockResolvedValue(mockSession),
      getSession: jest.fn().mockResolvedValue(mockSession),
      saveSession: jest.fn().mockResolvedValue(mockSession),
    } as unknown as jest.Mocked<OnboardingSessionService>;

    readinessEvaluator = {
      evaluate: jest.fn().mockResolvedValue(mockReadiness),
    } as unknown as jest.Mocked<OnboardingReadinessEvaluator>;

    stateReconciler = {
      reconcile: jest.fn().mockResolvedValue(mockSession),
    } as unknown as jest.Mocked<OnboardingStateReconciler>;

    service = new OnboardingCatalogService(
      productRepo,
      sessionService,
      readinessEvaluator,
      stateReconciler,
    );
  });

  describe('createManualProduct', () => {
    it('throws BadRequestException if tenantId is missing', async () => {
      const dto: CreateManualProductDto = { name: 'Latte', sellPrice: 50 };
      await expect(service.createManualProduct('', dto)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if sellPrice <= 0', async () => {
      const dto: CreateManualProductDto = { name: 'Latte', sellPrice: 0 };
      await expect(service.createManualProduct('tenant-test', dto)).rejects.toThrow(BadRequestException);
    });

    it('creates product with stock=0, averageCost=0 and returns costStatus COST_PENDING (AC-06, AC-07, AC-08)', async () => {
      const dto: CreateManualProductDto = {
        name: 'Café Latte',
        sellPrice: 65,
        uom: 'UN',
        category_code: 'BEBIDAS',
      };

      const createdProduct: Product = {
        id: 'prod-uuid-1',
        tenant_id: 'tenant-test',
        name: 'Café Latte',
        sellPrice: 65,
        uom: 'UN',
        category_code: 'BEBIDAS',
        product_type: ProductType.SIMPLE,
        is_active: true,
        stock: 0,
        averageCost: 0,
        is_perishable: false,
        warehouse_id: null,
        created_at: new Date(),
        updated_at: new Date(),
      } as unknown as Product;

      productRepo.create.mockReturnValue(createdProduct);
      productRepo.save.mockResolvedValue(createdProduct);

      const result = await service.createManualProduct('tenant-test', dto, 'owner-user-id');

      expect(productRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'tenant-test',
          name: 'Café Latte',
          sellPrice: 65,
          uom: 'UN',
          product_type: ProductType.SIMPLE,
          is_active: true,
          stock: 0,
          averageCost: 0,
        }),
      );

      expect(sessionService.ensureOnboardingStarted).toHaveBeenCalledWith({
        tenantId: 'tenant-test',
        actorUserId: 'owner-user-id',
        source: OnboardingStartSource.SETUP_CENTER,
      });

      expect(readinessEvaluator.evaluate).toHaveBeenCalledWith('tenant-test');
      expect(stateReconciler.reconcile).toHaveBeenCalledWith('tenant-test', mockReadiness);

      expect(result.product.costStatus).toBe('COST_PENDING');
      expect(result.session).toBe(mockSession);
      expect(result.readiness).toBe(mockReadiness);
    });
  });

  describe('getCatalogSummary', () => {
    it('returns catalog count and reports unknown cost as COST_PENDING', async () => {
      const mockQb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
      };
      productRepo.createQueryBuilder.mockReturnValue(mockQb);

      productRepo.find.mockResolvedValue([
        {
          id: 'prod-1',
          name: 'Café Latte',
          sellPrice: 65,
          uom: 'UN',
          averageCost: 0,
          is_active: true,
        } as unknown as Product,
      ]);

      const summary = await service.getCatalogSummary('tenant-test');
      expect(summary.sellableProductCount).toBe(1);
      expect(summary.hasSellableProduct).toBe(true);
      expect(summary.sampleProducts[0].costStatus).toBe('COST_PENDING');
    });
  });
});
