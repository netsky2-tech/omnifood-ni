import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  FulfillmentRolloutService,
  DiscrepancyType,
  RollbackToggleDto,
} from './fulfillment-rollout.service';
import { Product } from '../../inventory/entities/product.entity';
import { Insumo } from '../../inventory/entities/insumo.entity';
import { Recipe } from '../../inventory/entities/recipe.entity';
import { TenantFulfillmentRecord } from '../entities/tenant-fulfillment-record.entity';
import { TenantTopologyRevision } from '../entities/tenant-topology-revision.entity';

describe('FulfillmentRolloutService (Unit & Triangulation)', () => {
  let service: FulfillmentRolloutService;
  let productRepo: jest.Mocked<Repository<Product>>;
  let insumoRepo: jest.Mocked<Repository<Insumo>>;
  let recipeRepo: jest.Mocked<Repository<Recipe>>;
  let fulfillmentRepo: jest.Mocked<Repository<TenantFulfillmentRecord>>;
  let revisionRepo: jest.Mocked<Repository<TenantTopologyRevision>>;

  const mockQueryRunner = {
    query: jest.fn(),
  };

  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    transaction: jest
      .fn()
      .mockImplementation(
        (
          isolationOrFn: unknown,
          fnOrUndefined?: (manager: unknown) => Promise<unknown>,
        ) => {
          const callback =
            typeof isolationOrFn === 'function'
              ? (isolationOrFn as (m: unknown) => Promise<unknown>)
              : fnOrUndefined;
          if (!callback) throw new Error('Callback required');
          const manager = {
            query: jest.fn().mockResolvedValue([]),
            getRepository: (entity: unknown) => {
              if (entity === Product) return productRepo;
              if (entity === Insumo) return insumoRepo;
              if (entity === Recipe) return recipeRepo;
              if (entity === TenantFulfillmentRecord) return fulfillmentRepo;
              if (entity === TenantTopologyRevision) return revisionRepo;
              return {} as unknown;
            },
          };
          return callback(manager);
        },
      ),
  };

  beforeEach(async () => {
    productRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<Product>>;

    insumoRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<Insumo>>;

    recipeRepo = {
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<Recipe>>;

    fulfillmentRepo = {
      find: jest.fn(),
      count: jest.fn(),
    } as unknown as jest.Mocked<Repository<TenantFulfillmentRecord>>;

    revisionRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<TenantTopologyRevision>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FulfillmentRolloutService,
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: getRepositoryToken(Product),
          useValue: productRepo,
        },
        {
          provide: getRepositoryToken(Insumo),
          useValue: insumoRepo,
        },
        {
          provide: getRepositoryToken(Recipe),
          useValue: recipeRepo,
        },
        {
          provide: getRepositoryToken(TenantFulfillmentRecord),
          useValue: fulfillmentRepo,
        },
        {
          provide: getRepositoryToken(TenantTopologyRevision),
          useValue: revisionRepo,
        },
      ],
    }).compile();

    service = module.get<FulfillmentRolloutService>(FulfillmentRolloutService);
  });

  describe('scanBackfillDiscrepancies (Triangulation)', () => {
    it('detects MISSING_RECIPE_BOM when product is marked perishable/recipe but has zero recipe rows', async () => {
      const tenantId = 'tenant-test-1';
      productRepo.find.mockResolvedValue([
        {
          id: 'prod-1',
          tenant_id: tenantId,
          name: 'Hamburguesa Especial',
          is_perishable: true,
          is_active: true,
        } as Product,
      ]);
      recipeRepo.find.mockResolvedValue([]); // No recipes!
      insumoRepo.find.mockResolvedValue([]);

      const result = await service.scanBackfillDiscrepancies(tenantId);

      expect(result.tenantId).toBe(tenantId);
      expect(result.discrepancies).toHaveLength(1);
      expect(result.discrepancies[0]).toEqual({
        productId: 'prod-1',
        productName: 'Hamburguesa Especial',
        type: DiscrepancyType.MISSING_RECIPE_BOM,
        message:
          'Product is configured for recipe consumption but has no recipe components registered.',
        severity: 'HIGH',
      });
      expect(result.clean).toBe(false);
    });

    it('validates product with valid recipe components as clean', async () => {
      const tenantId = 'tenant-test-1';
      productRepo.find.mockResolvedValue([
        {
          id: 'prod-1',
          tenant_id: tenantId,
          name: 'Hamburguesa Especial',
          is_perishable: true,
          is_active: true,
        } as Product,
      ]);
      recipeRepo.find.mockResolvedValue([
        {
          id: 'rec-1',
          tenant_id: tenantId,
          productId: 'prod-1',
          ingredientId: 'ins-1',
          quantity: 1,
        } as Recipe,
      ]);
      insumoRepo.find.mockResolvedValue([]);

      const result = await service.scanBackfillDiscrepancies(tenantId);

      expect(result.discrepancies).toHaveLength(0);
      expect(result.clean).toBe(true);
    });

    it('detects UNROUTED_PRODUCT_FALLBACK for products lacking explicit routing station', async () => {
      const tenantId = 'tenant-test-1';
      productRepo.find.mockResolvedValue([
        {
          id: 'prod-legacy',
          tenant_id: tenantId,
          name: 'Gaseosa en Lata',
          is_perishable: false,
          is_active: true,
        } as Product,
      ]);
      recipeRepo.find.mockResolvedValue([]);
      insumoRepo.find.mockResolvedValue([]);

      const result = await service.scanBackfillDiscrepancies(tenantId);

      // Non-perishable product without recipe is clean or flagged with safe fallback recommendation
      expect(result.unroutedProducts).toHaveLength(1);
      expect(result.unroutedProducts[0].productId).toBe('prod-legacy');
      expect(result.unroutedProducts[0].fallbackAction).toBe('DIRECT_HANDOFF');
      expect(result.unroutedProducts[0].fallbackStation).toBe(
        'general-dispatch',
      );
    });

    it('flags CROSS_TENANT_INSUMO_LEAK if an ingredient belongs to a different tenant', async () => {
      const tenantId = 'tenant-target';
      productRepo.find.mockResolvedValue([
        {
          id: 'prod-2',
          tenant_id: tenantId,
          name: 'Tacos Mixtos',
          is_perishable: true,
          is_active: true,
        } as Product,
      ]);
      recipeRepo.find.mockResolvedValue([
        {
          id: 'rec-2',
          tenant_id: tenantId,
          productId: 'prod-2',
          ingredientId: 'ins-foreign',
          quantity: 2,
        } as Recipe,
      ]);
      // Insumo belongs to different tenant!
      insumoRepo.find.mockResolvedValue([
        {
          id: 'ins-foreign',
          tenant_id: 'tenant-OTHER',
          name: 'Carne Molida',
        } as Insumo,
      ]);

      const result = await service.scanBackfillDiscrepancies(tenantId);

      expect(result.discrepancies).toContainEqual(
        expect.objectContaining({
          type: DiscrepancyType.CROSS_TENANT_INSUMO_LEAK,
          productId: 'prod-2',
        }),
      );
    });
  });

  describe('Rollback and Compatibility Gate (Triangulation)', () => {
    it('returns default active enforcement when no rollback is configured', async () => {
      const tenantId = 'tenant-1';
      const status = await service.getRollbackStatus(tenantId);

      expect(status.enforcementEnabled).toBe(true);
      expect(status.isRolledBack).toBe(false);
    });

    it('toggles rollback, setting enforcementEnabled: false while recording audit trail', async () => {
      const tenantId = 'tenant-1';
      const toggleDto: RollbackToggleDto = {
        rollback: true,
        reason: 'Emergency printer network failure at Central Food Park',
        authorizedBy: 'admin@omnifood.ni',
      };

      const result = await service.toggleRollback(tenantId, toggleDto);

      expect(result.enforcementEnabled).toBe(false);
      expect(result.isRolledBack).toBe(true);
      expect(result.reason).toBe(toggleDto.reason);
      expect(result.authorizedBy).toBe(toggleDto.authorizedBy);
      expect(result.timestamp).toBeDefined();

      const status = await service.getRollbackStatus(tenantId);
      expect(status.enforcementEnabled).toBe(false);
      expect(status.isRolledBack).toBe(true);
    });

    it('restores enforcement when rollback is toggled off', async () => {
      const tenantId = 'tenant-1';
      await service.toggleRollback(tenantId, {
        rollback: true,
        reason: 'Temporary pause',
        authorizedBy: 'supervisor@omnifood.ni',
      });

      const restored = await service.toggleRollback(tenantId, {
        rollback: false,
        reason: 'Network resolved, resuming enforcement',
        authorizedBy: 'supervisor@omnifood.ni',
      });

      expect(restored.enforcementEnabled).toBe(true);
      expect(restored.isRolledBack).toBe(false);
    });
  });

  describe('Observability Dashboard Telemetry Aggregator', () => {
    it('aggregates fulfillment metrics across channels and operations', async () => {
      const tenantId = 'tenant-metrics';
      revisionRepo.findOne.mockResolvedValue({
        tenant_id: tenantId,
        revision: 4,
        topology: { operationMode: 'FOOD_PARK' },
      } as unknown as TenantTopologyRevision);

      fulfillmentRepo.count.mockResolvedValueOnce(25); // total fulfillments
      fulfillmentRepo.find.mockResolvedValue([
        { id: 'f-1', channel: 'PRINT_ONLY', route_state: 'PRINTED' },
        { id: 'f-2', channel: 'KDS_ONLY', route_state: 'ROUTED' },
        { id: 'f-3', channel: 'KDS_AND_PRINT', route_state: 'PRINTED' },
      ] as TenantFulfillmentRecord[]);

      const dashboard = await service.getObservabilityDashboard(tenantId);

      expect(dashboard.tenantId).toBe(tenantId);
      expect(dashboard.currentRevision).toBe(4);
      expect(dashboard.operationMode).toBe('FOOD_PARK');
      expect(dashboard.totalFulfillments).toBe(25);
      expect(dashboard.channelsBreakdown).toEqual({
        PRINT_ONLY: 1,
        KDS_ONLY: 1,
        KDS_AND_PRINT: 1,
      });
      expect(dashboard.enforcementStatus).toBe('ACTIVE');
    });
  });
});
