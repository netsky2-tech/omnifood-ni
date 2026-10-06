import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InboundSyncService } from './inbound-sync.service';
import { Product, ProductType } from '../../inventory/entities/product.entity';
import { CatalogValue } from '../../catalog/entities/catalog-value.entity';
import { Insumo } from '../../inventory/entities/insumo.entity';
import { Recipe } from '../../inventory/entities/recipe.entity';
import { RecipeVersion } from '../../inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../../inventory/entities/recipe-detail.entity';
import { ProductInventoryMappingVersion } from '../../inventory/entities/product-inventory-mapping-version.entity';
import { ForensicAlert } from '../../inventory/entities/forensic-alert.entity';
import { User, UserRole } from '../../identity/entities/user.entity';
import { LoyaltyProgram } from '../../loyalty/entities/loyalty-program.entity';
import { RewardDefinition } from '../../loyalty/entities/reward-definition.entity';
import { Promotion } from '../../promotions/entities/promotion.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { FiscalConfigVersionService } from '../../onboarding/services/fiscal-config-version.service';
import { StaffPolicyEpochDeliveryService } from '../../identity/human-authorization/services/staff-policy-epoch-delivery.service';
import { StaffPolicyEpochAcknowledgementService } from '../../identity/human-authorization/services/staff-policy-epoch-acknowledgement.service';
import { RecoveryTokenService } from '../../identity/human-authorization/services/recovery-token.service';
import { OHAC_ERROR_HTTP_STATUS } from '../../identity/human-authorization/contracts/error-codes';
import type { DeviceSyncPrincipal } from '../../identity/security/device-sync-principal';
import { CatalogType } from '../../catalog/catalog-type';

interface MockQueryBuilder<T> {
  where: jest.Mock;
  andWhere: jest.Mock;
  leftJoinAndSelect: jest.Mock;
  addSelect: jest.Mock;
  getMany: jest.Mock<Promise<T[]>, []>;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
}

function createMockQueryBuilder<T>(items: T[] = []): MockQueryBuilder<T> {
  const qb: MockQueryBuilder<T> = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    getMany: jest.fn<Promise<T[]>, []>().mockResolvedValue(items),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
  };
  return qb;
}

describe('InboundSyncService', () => {
  let service: InboundSyncService;
  const deliveryMock = { negotiate: jest.fn() };
  const acknowledgementMock = { acknowledge: jest.fn() };
  const recoveryTokenMock = { redeem: jest.fn() };
  const devicePrincipal = {
    principalType: 'DEVICE_SYNC',
    credentialId: 'cred-1',
    tenantId: 'tenant-1',
    deviceId: 'pos-terminal-01',
    scopes: ['sync:pull'],
    credentialVersion: 1,
  } as unknown as DeviceSyncPrincipal;

  let fiscalService: {
    getFiscalConfigSnapshot: jest.Mock;
    validateIntegrity: jest.Mock;
  };

  let productQb: MockQueryBuilder<Product>;
  let catalogQb: MockQueryBuilder<CatalogValue>;
  let insumoQb: MockQueryBuilder<Insumo>;
  let recipeQb: MockQueryBuilder<Recipe>;
  let recipeVersionQb: MockQueryBuilder<RecipeVersion>;
  let recipeDetailQb: MockQueryBuilder<RecipeDetail>;
  let mappingVersionQb: MockQueryBuilder<ProductInventoryMappingVersion>;
  let userQb: MockQueryBuilder<User>;
  let loyaltyProgramQb: MockQueryBuilder<LoyaltyProgram>;
  let loyaltyRewardQb: MockQueryBuilder<RewardDefinition>;
  let promotionQb: MockQueryBuilder<Promotion>;
  let customerQb: MockQueryBuilder<Customer>;

  let mockProductRepo: { createQueryBuilder: jest.Mock };
  let mockCatalogRepo: { createQueryBuilder: jest.Mock };
  let mockInsumoRepo: { createQueryBuilder: jest.Mock };
  let mockRecipeRepo: { createQueryBuilder: jest.Mock };
  let mockRecipeVersionRepo: { createQueryBuilder: jest.Mock };
  let mockRecipeDetailRepo: { createQueryBuilder: jest.Mock };
  let mockMappingVersionRepo: {
    createQueryBuilder: jest.Mock;
    manager: { query: jest.Mock };
  };
  let mockUserRepo: { createQueryBuilder: jest.Mock };
  let mockLoyaltyProgramRepo: { createQueryBuilder: jest.Mock };
  let mockLoyaltyRewardRepo: { createQueryBuilder: jest.Mock };
  let mockPromotionRepo: { createQueryBuilder: jest.Mock };
  let mockCustomerRepo: { createQueryBuilder: jest.Mock };

  beforeEach(async () => {
    productQb = createMockQueryBuilder<Product>([]);
    catalogQb = createMockQueryBuilder<CatalogValue>([]);
    insumoQb = createMockQueryBuilder<Insumo>([]);
    recipeQb = createMockQueryBuilder<Recipe>([]);
    recipeVersionQb = createMockQueryBuilder<RecipeVersion>([]);
    recipeDetailQb = createMockQueryBuilder<RecipeDetail>([]);
    mappingVersionQb = createMockQueryBuilder<ProductInventoryMappingVersion>(
      [],
    );
    userQb = createMockQueryBuilder<User>([]);
    loyaltyProgramQb = createMockQueryBuilder<LoyaltyProgram>([]);
    loyaltyRewardQb = createMockQueryBuilder<RewardDefinition>([]);
    promotionQb = createMockQueryBuilder<Promotion>([]);
    customerQb = createMockQueryBuilder<Customer>([]);

    mockProductRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(productQb),
    };
    mockCatalogRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(catalogQb),
    };
    mockInsumoRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(insumoQb),
    };
    mockRecipeRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(recipeQb),
    };
    mockRecipeVersionRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(recipeVersionQb),
    };
    mockRecipeDetailRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(recipeDetailQb),
    };
    mockMappingVersionRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(mappingVersionQb),
      manager: { query: jest.fn().mockResolvedValue(undefined) },
    };
    mockUserRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(userQb),
    };
    mockLoyaltyProgramRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(loyaltyProgramQb),
    };
    mockLoyaltyRewardRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(loyaltyRewardQb),
    };
    mockPromotionRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(promotionQb),
    };
    mockCustomerRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(customerQb),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InboundSyncService,
        {
          provide: FiscalConfigVersionService,
          useValue: {
            getFiscalConfigSnapshot: jest.fn().mockResolvedValue(null),
            validateIntegrity: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: getRepositoryToken(Product),
          useValue: mockProductRepo,
        },
        {
          provide: getRepositoryToken(CatalogValue),
          useValue: mockCatalogRepo,
        },
        {
          provide: getRepositoryToken(Insumo),
          useValue: mockInsumoRepo,
        },
        {
          provide: getRepositoryToken(Recipe),
          useValue: mockRecipeRepo,
        },
        {
          provide: getRepositoryToken(RecipeVersion),
          useValue: mockRecipeVersionRepo,
        },
        {
          provide: getRepositoryToken(RecipeDetail),
          useValue: mockRecipeDetailRepo,
        },
        {
          provide: getRepositoryToken(ProductInventoryMappingVersion),
          useValue: mockMappingVersionRepo,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepo,
        },
        {
          provide: StaffPolicyEpochDeliveryService,
          useValue: deliveryMock,
        },
        {
          provide: StaffPolicyEpochAcknowledgementService,
          useValue: acknowledgementMock,
        },
        {
          provide: RecoveryTokenService,
          useValue: recoveryTokenMock,
        },
      ],
    }).compile();

    service = module.get<InboundSyncService>(InboundSyncService);
    fiscalService = module.get(FiscalConfigVersionService);
    jest.clearAllMocks();
  });

  // Issue #512 slice 1 part A: `products` and `insumos` reads are
  // tenant-protected and require a bound transaction manager. This stand-in
  // maps every entity onto the existing repository mocks so generic tests
  // keep exercising the same query builders through the bound path.
  function buildDefaultBoundManager(
    overrides: Map<unknown, unknown> = new Map(),
  ) {
    return {
      getRepository: jest.fn((entity: unknown) => {
        if (overrides.has(entity)) return overrides.get(entity);
        if (entity === Product) return mockProductRepo;
        if (entity === CatalogValue) return mockCatalogRepo;
        if (entity === Insumo) return mockInsumoRepo;
        if (entity === Recipe) return mockRecipeRepo;
        if (entity === RecipeVersion) return mockRecipeVersionRepo;
        if (entity === RecipeDetail) return mockRecipeDetailRepo;
        if (entity === ProductInventoryMappingVersion)
          return mockMappingVersionRepo;
        if (entity === User) return mockUserRepo;
        if (entity === LoyaltyProgram) return mockLoyaltyProgramRepo;
        if (entity === RewardDefinition) return mockLoyaltyRewardRepo;
        if (entity === Promotion) return mockPromotionRepo;
        if (entity === Customer) return mockCustomerRepo;
        if (entity === ForensicAlert)
          return {
            createQueryBuilder: jest
              .fn()
              .mockReturnValue(createMockQueryBuilder([])),
          };
        return undefined;
      }),
    } as never;
  }

  it('throws UnauthorizedException if tenantId is missing or empty', async () => {
    await expect(service.getInboundDeltas('', {})).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(service.getInboundDeltas('   ', {})).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('performs full hydration when sinceVersion and since are not provided', async () => {
    const mockProducts = [
      {
        id: 'prod-1',
        name: 'Café Americano',
        uom: 'CUP',
        stock: 10.5,
        averageCost: 15.0,
        sellPrice: 45.0,
        is_active: true,
        is_perishable: true,
        warehouse_id: 'wh-1',
        product_type: ProductType.SIMPLE,
        tenant_id: 'tenant-abc',
        tax_rate: 0.15,
        is_tax_exempt: false,
        created_at: new Date('2026-08-01T00:00:00Z'),
        updated_at: new Date('2026-08-02T00:00:00Z'),
      } as unknown as Product,
    ];

    const mockCatalogValues = [
      {
        id: 'cat-1',
        catalog_type: 'CATEGORY' as CatalogType,
        code: 'BEVERAGE',
        name: 'Bebidas Calientes',
        description: 'Cafés y tés',
        is_active: true,
        sort_order: 1,
        created_at: new Date('2026-08-01T00:00:00Z'),
        updated_at: new Date('2026-08-02T00:00:00Z'),
      } as unknown as CatalogValue,
    ];

    const mockUsers = [
      {
        id: 'user-1',
        name: 'Cajero 1',
        email: 'cajero@omnifood.ni',
        role: UserRole.CASHIER,
        tenant_id: 'tenant-abc',
        is_active: true,
        created_at: new Date('2026-08-01T00:00:00Z'),
        updated_at: new Date('2026-08-02T00:00:00Z'),
        security_profile: {
          is_pin_enabled: true,
          is_totp_enabled: false,
          pin_hash: '$2b$10$hashedpinvalue',
        },
      } as unknown as User,
    ];

    productQb.getMany.mockResolvedValue(mockProducts);
    catalogQb.getMany.mockResolvedValue(mockCatalogValues);
    userQb.getMany.mockResolvedValue(mockUsers);

    const response = await service.getInboundDeltas(
      'tenant-abc',
      {},
      undefined,
      buildDefaultBoundManager(),
    );

    expect(response.status).toBe('success');
    expect(response.deltas.products).toHaveLength(1);
    expect(response.deltas.products[0]).toEqual({
      id: 'prod-1',
      name: 'Café Americano',
      uom: 'CUP',
      stock: 10.5,
      averageCost: 15,
      sellPrice: 45,
      taxRate: 0.15,
      isTaxExempt: false,
      isActive: true,
      isPerishable: true,
      warehouseId: 'wh-1',
      productType: ProductType.SIMPLE,
      mappingVersionId: null,
      insumoId: null,
      tenantId: 'tenant-abc',
      createdAt: expect.any(Date) as Date,
      updatedAt: expect.any(Date) as Date,
    });

    expect(response.deltas.catalogValues).toHaveLength(1);
    expect(response.deltas.catalogValues[0]).toEqual({
      id: 'cat-1',
      catalogType: 'CATEGORY',
      code: 'BEVERAGE',
      name: 'Bebidas Calientes',
      description: 'Cafés y tés',
      isActive: true,
      sortOrder: 1,
      createdAt: expect.any(Date) as Date,
      updatedAt: expect.any(Date) as Date,
    });

    expect(response.deltas.users).toHaveLength(1);
    expect(response.deltas.users[0]).toEqual({
      id: 'user-1',
      name: 'Cajero 1',
      email: 'cajero@omnifood.ni',
      role: UserRole.CASHIER,
      // User deltas carry the row's own tenant binding so the POS never
      // persists a tenant-less user via conflict-replace upserts.
      tenantId: 'tenant-abc',
      isActive: true,
      createdAt: expect.any(Date) as Date,
      updatedAt: expect.any(Date) as Date,
      securityProfile: {
        isPinEnabled: true,
        isTotpEnabled: false,
        pinHash: '$2b$10$hashedpinvalue',
      },
    });

    // Verify tenant filtering
    expect(productQb.where).toHaveBeenCalledWith(
      'product.tenant_id = :tenantId',
      { tenantId: 'tenant-abc' },
    );
    expect(catalogQb.where).toHaveBeenCalledWith(
      'catalog.tenant_id = :tenantId',
      { tenantId: 'tenant-abc' },
    );
    expect(userQb.where).toHaveBeenCalledWith('user.tenant_id = :tenantId', {
      tenantId: 'tenant-abc',
    });

    // No sinceDate filtering
    expect(productQb.andWhere).not.toHaveBeenCalled();
    expect(catalogQb.andWhere).not.toHaveBeenCalled();
  });

  it('emits taxRate and isTaxExempt from the product entity columns in the inbound product contract', async () => {
    // The POS reads `taxRate` / `isTaxExempt` from the inbound product delta
    // (sync_service.dart) and its invoice fiscal calculator trusts them as
    // the rate's source of truth. A Régimen General tenant whose products
    // arrive with taxRate 0.0 files every sale as IVA-exempt, so the fields
    // are part of the inbound contract and must be read from the entity
    // columns, never from a hardcoded constant.
    const mockProducts = [
      {
        id: 'prod-taxable',
        name: 'Café Americano',
        uom: 'CUP',
        stock: 10.5,
        averageCost: 15.0,
        sellPrice: 45.0,
        is_active: true,
        is_perishable: true,
        warehouse_id: 'wh-1',
        tax_rate: 0.15,
        is_tax_exempt: false,
        created_at: new Date('2026-08-01T00:00:00Z'),
        updated_at: new Date('2026-08-02T00:00:00Z'),
      } as unknown as Product,
      {
        id: 'prod-exempt',
        name: 'Pan Casero',
        uom: 'UN',
        stock: 50.0,
        averageCost: 8.0,
        sellPrice: 25.0,
        is_active: true,
        is_perishable: false,
        warehouse_id: null,
        tax_rate: 0.0,
        is_tax_exempt: true,
        created_at: new Date('2026-08-01T00:00:00Z'),
        updated_at: new Date('2026-08-03T00:00:00Z'),
      } as unknown as Product,
      {
        // A product at its column defaults (tax_rate default 0.15,
        // is_tax_exempt default false) must still emit usable values.
        id: 'prod-defaults',
        name: 'Refresco',
        uom: 'UN',
        stock: 20.0,
        averageCost: 10.0,
        sellPrice: 30.0,
        is_active: true,
        is_perishable: false,
        warehouse_id: null,
        tax_rate: 0.15,
        is_tax_exempt: false,
        created_at: new Date('2026-08-01T00:00:00Z'),
        updated_at: new Date('2026-08-04T00:00:00Z'),
      } as unknown as Product,
    ];

    productQb.getMany.mockResolvedValue(mockProducts);

    const response = await service.getInboundDeltas(
      'tenant-abc',
      {},
      undefined,
      buildDefaultBoundManager(),
    );

    expect(response.deltas.products).toHaveLength(3);

    const taxable = response.deltas.products.find(
      (p) => p.id === 'prod-taxable',
    );
    const exempt = response.deltas.products.find((p) => p.id === 'prod-exempt');
    const atDefaults = response.deltas.products.find(
      (p) => p.id === 'prod-defaults',
    );

    // Values must come from the entity columns: the fixture's two different
    // pairs prove the mapper is not emitting constants.
    expect(taxable?.taxRate).toBe(0.15);
    expect(taxable?.isTaxExempt).toBe(false);
    expect(exempt?.taxRate).toBe(0);
    expect(exempt?.isTaxExempt).toBe(true);
    // A row at its column defaults still emits defined, usable values.
    expect(atDefaults?.taxRate).toBeDefined();
    expect(atDefaults?.isTaxExempt).toBeDefined();
    expect(atDefaults?.taxRate).toBe(0.15);
    expect(atDefaults?.isTaxExempt).toBe(false);
  });

  it('includes par level and stock thresholds in the insumo delta (issue #521 S1)', async () => {
    // Issue #521 S1: stock alert thresholds configured in the backoffice
    // must reach the POS through the incremental `insumos` delta, including
    // the null case (insumo without thresholds configured).
    insumoQb.getMany.mockResolvedValue([
      {
        id: 'ins-521a',
        tenant_id: 'tenant-abc',
        name: 'Leche',
        purchaseUom: 'L',
        consumptionUom: 'ml',
        conversionFactor: 1000,
        stock: 12.5,
        averageCost: 3.25,
        is_active: true,
        is_perishable: true,
        negativeStockPolicy: 'BLOCK',
        parLevel: 20,
        minStock: 5,
        maxStock: 40,
        created_at: new Date('2026-08-01T00:00:00Z'),
        updated_at: new Date('2026-08-02T00:00:00Z'),
      } as unknown as Insumo,
      {
        id: 'ins-521b',
        tenant_id: 'tenant-abc',
        name: 'Café',
        purchaseUom: 'KG',
        consumptionUom: 'G',
        conversionFactor: 1000,
        stock: 1.5,
        averageCost: 12.0,
        is_active: true,
        is_perishable: false,
        negativeStockPolicy: 'WARN',
        parLevel: null,
        minStock: null,
        maxStock: null,
        created_at: new Date('2026-08-01T00:00:00Z'),
        updated_at: new Date('2026-08-02T00:00:00Z'),
      } as unknown as Insumo,
    ]);

    const response = await service.getInboundDeltas(
      'tenant-abc',
      { types: 'insumos' },
      undefined,
      buildDefaultBoundManager(),
    );

    expect(response.deltas.insumos).toHaveLength(2);
    expect(response.deltas.insumos[0]).toMatchObject({
      id: 'ins-521a',
      parLevel: 20,
      minStock: 5,
      maxStock: 40,
    });
    expect(response.deltas.insumos[1]).toMatchObject({
      id: 'ins-521b',
      parLevel: null,
      minStock: null,
      maxStock: null,
    });
  });

  it('filters deltas by ISO timestamp since string', async () => {
    const sinceIso = '2026-08-20T00:00:00.000Z';
    await service.getInboundDeltas(
      'tenant-abc',
      { since: sinceIso },
      undefined,
      buildDefaultBoundManager(),
    );

    expect(productQb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('mapping_cursor'),
      { sinceDate: new Date(sinceIso) },
    );
    expect(catalogQb.andWhere).toHaveBeenCalledWith(
      'catalog.updated_at > :sinceDate',
      { sinceDate: new Date(sinceIso) },
    );
    expect(insumoQb.andWhere).toHaveBeenCalledWith(
      'insumo.updated_at > :sinceDate',
      { sinceDate: new Date(sinceIso) },
    );
    expect(recipeQb.andWhere).toHaveBeenCalledWith(
      'recipe.updated_at > :sinceDate',
      { sinceDate: new Date(sinceIso) },
    );
    expect(recipeVersionQb.andWhere).toHaveBeenCalledWith(
      '(rv.created_at > :sinceDate OR rv.published_at > :sinceDate OR rv.fecha_inicio_vigencia > :sinceDate)',
      { sinceDate: new Date(sinceIso) },
    );
    expect(userQb.andWhere).toHaveBeenCalledWith(
      '(user.updated_at > :sinceDate OR security_profile.updated_at > :sinceDate)',
      { sinceDate: new Date(sinceIso) },
    );
  });

  it('filters deltas by numeric timestamp sinceVersion', async () => {
    const sinceTimestamp = '1787745600000';
    await service.getInboundDeltas(
      'tenant-abc',
      { sinceVersion: sinceTimestamp },
      undefined,
      buildDefaultBoundManager(),
    );

    expect(productQb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('mapping_cursor'),
      { sinceDate: new Date(1787745600000) },
    );
  });

  it('filters by entity types when requested', async () => {
    const response = await service.getInboundDeltas(
      'tenant-abc',
      { types: 'products,users' },
      undefined,
      buildDefaultBoundManager(),
    );

    expect(mockProductRepo.createQueryBuilder).toHaveBeenCalled();
    expect(mockUserRepo.createQueryBuilder).toHaveBeenCalled();
    expect(mockCatalogRepo.createQueryBuilder).not.toHaveBeenCalled();
    expect(mockInsumoRepo.createQueryBuilder).not.toHaveBeenCalled();
    expect(mockRecipeRepo.createQueryBuilder).not.toHaveBeenCalled();
    expect(mockRecipeVersionRepo.createQueryBuilder).not.toHaveBeenCalled();

    expect(response.deltas.catalogValues).toEqual([]);
    expect(response.deltas.insumos).toEqual([]);
    expect(response.deltas.recipes).toEqual([]);
    expect(response.deltas.recipeVersions).toEqual([]);
  });

  describe('Fiscal paths tenant binding (RLS pre-hardening)', () => {
    it('reaches fiscal_config_revisions only through FiscalConfigVersionService, which owns the tenant-bound transaction', async () => {
      const response = await service.getInboundDeltas('tenant-abc', {
        types: 'fiscal',
      });

      expect(fiscalService.getFiscalConfigSnapshot).toHaveBeenCalledTimes(1);
      expect(fiscalService.getFiscalConfigSnapshot).toHaveBeenCalledWith(
        'tenant-abc',
      );
      expect(response.deltas.fiscalConfig).toBeNull();
      expect(response.fiscalConfig).toBeNull();
    });

    it('reaches the fiscal ack path only through FiscalConfigVersionService.validateIntegrity, which binds tenant context', async () => {
      const result = await service.recordFiscalAck('tenant-abc', {
        tenantId: 'tenant-abc',
        terminalId: 'term-1',
        revision: 2,
        fingerprint: 'fp-2',
        appliedAt: '2026-01-01T00:00:00Z',
      });

      expect(fiscalService.validateIntegrity).toHaveBeenCalledTimes(1);
      expect(fiscalService.validateIntegrity).toHaveBeenCalledWith(
        'tenant-abc',
        2,
        'fp-2',
      );
      expect(result).toEqual({
        status: 'success',
        acknowledgedRevision: 2,
        acknowledgedFingerprint: 'fp-2',
      });
    });
  });

  describe('mapping version tenant binding guard (Unit 0b-3)', () => {
    it('rejects a blank tenant id (Unit 0b-3) and issues no set_config SQL', async () => {
      for (const blankTenantId of ['', '   ']) {
        await expect(
          service.getInboundDeltas(blankTenantId, {}),
        ).rejects.toThrow(UnauthorizedException);

        // Absence of SQL, not just the rejection: a blank tenant id must
        // never reach set_config on the mapping version manager.
        expect(mockMappingVersionRepo.manager.query).not.toHaveBeenCalled();
      }
    });

    it('reads mapping versions through the bound manager without session-scoped SQL (issue #512)', async () => {
      await service.getInboundDeltas(
        'tenant-abc',
        { types: 'products' },
        undefined,
        buildDefaultBoundManager(),
      );

      // The mapping read rides the bound manager's own connection; the old
      // session-scoped set_config against the pooled manager must never run.
      expect(mockMappingVersionRepo.createQueryBuilder).toHaveBeenCalled();
      expect(mockMappingVersionRepo.manager.query).not.toHaveBeenCalled();
    });
  });

  describe('transaction-bound manager reads (L1-10a)', () => {
    // A stand-in for the EntityManager `runInTenantTransaction` hands to the
    // caller: it resolves repositories from its own transaction connection.
    function buildBoundManager(repos: Map<unknown, unknown>) {
      return {
        getRepository: jest.fn((entity: unknown) => repos.get(entity)),
      };
    }

    const boundProduct = {
      id: 'prod-bound-1',
      name: 'Café en grano',
      uom: 'LBS',
      stock: 5,
      averageCost: 20,
      sellPrice: 50,
      is_active: true,
      is_perishable: false,
      warehouse_id: null,
      product_type: ProductType.SIMPLE,
      tenant_id: 'tenant-abc',
      created_at: new Date('2026-08-01T00:00:00Z'),
      updated_at: new Date('2026-08-02T00:00:00Z'),
    } as unknown as Product;
    const boundMapping = {
      id: 'map-bound-1',
      product_id: 'prod-bound-1',
      insumo_id: 'insumo-bound-1',
    } as unknown as ProductInventoryMappingVersion;
    const boundCatalogValue = {
      id: 'cat-bound-1',
      catalog_type: 'CATEGORY' as CatalogType,
      code: 'BEVERAGE',
      name: 'Bebidas',
      description: null,
      is_active: true,
      sort_order: 1,
      created_at: new Date('2026-08-01T00:00:00Z'),
      updated_at: new Date('2026-08-02T00:00:00Z'),
    } as unknown as CatalogValue;

    it('routes the product, catalog and mapping reads through the supplied bound manager', async () => {
      const managerRepos = new Map<unknown, unknown>([
        [
          Product,
          {
            createQueryBuilder: jest
              .fn()
              .mockReturnValue(createMockQueryBuilder([boundProduct])),
          },
        ],
        [
          CatalogValue,
          {
            createQueryBuilder: jest
              .fn()
              .mockReturnValue(createMockQueryBuilder([boundCatalogValue])),
          },
        ],
        [
          ProductInventoryMappingVersion,
          {
            createQueryBuilder: jest
              .fn()
              .mockReturnValue(createMockQueryBuilder([boundMapping])),
          },
        ],
      ]);
      const manager = buildBoundManager(managerRepos);

      const response = await service.getInboundDeltas(
        'tenant-abc',
        { types: 'products,catalogvalues' },
        undefined,
        manager as never,
      );

      expect(manager.getRepository).toHaveBeenCalledWith(Product);
      expect(manager.getRepository).toHaveBeenCalledWith(CatalogValue);
      expect(manager.getRepository).toHaveBeenCalledWith(
        ProductInventoryMappingVersion,
      );
      // The global repositories stay untouched on the bound path: every
      // query must ride the transaction's own connection.
      expect(mockProductRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(mockCatalogRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(mockMappingVersionRepo.createQueryBuilder).not.toHaveBeenCalled();
      // And the pooled manager's session-scoped set_config workaround must
      // not run either: the transaction is already bound.
      expect(mockMappingVersionRepo.manager.query).not.toHaveBeenCalled();

      expect(response.deltas.products).toHaveLength(1);
      expect(response.deltas.products[0]).toMatchObject({
        id: 'prod-bound-1',
        mappingVersionId: 'map-bound-1',
        insumoId: 'insumo-bound-1',
      });
      expect(response.deltas.catalogValues).toHaveLength(1);
      expect(response.deltas.catalogValues[0]).toMatchObject({
        id: 'cat-bound-1',
      });
    });

    it('fails closed when no manager is supplied for the protected products read (issue #512)', async () => {
      productQb.getMany.mockResolvedValue([boundProduct]);

      await expect(
        service.getInboundDeltas('tenant-abc', { types: 'products' }),
      ).rejects.toThrow(
        'Inbound product sync requires a tenant-bound transaction manager',
      );

      // Fail closed means fail before any SQL: neither the pooled product
      // read nor the pooled session-scoped set_config workaround may run.
      expect(mockProductRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(mockMappingVersionRepo.manager.query).not.toHaveBeenCalled();
      expect(productQb.getMany).not.toHaveBeenCalled();
    });

    it('fails closed when no manager is supplied for the protected insumos read (issue #512)', async () => {
      insumoQb.getMany.mockResolvedValue([]);

      await expect(
        service.getInboundDeltas('tenant-abc', { types: 'insumos' }),
      ).rejects.toThrow(
        'Inbound insumo sync requires a tenant-bound transaction manager',
      );

      expect(mockInsumoRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(insumoQb.getMany).not.toHaveBeenCalled();
    });

    it('fails closed when no manager is supplied for the protected recipes read (issue #512 slice 2)', async () => {
      recipeQb.getMany.mockResolvedValue([]);

      await expect(
        service.getInboundDeltas('tenant-abc', { types: 'recipes' }),
      ).rejects.toThrow(
        'Inbound recipe sync requires a tenant-bound transaction manager',
      );

      // Fail closed means fail before any SQL: the pooled recipes read must
      // never run without the tenant binding.
      expect(mockRecipeRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(recipeQb.getMany).not.toHaveBeenCalled();
    });

    it('fails closed when no manager is supplied for the protected recipe_versions read (issue #512 slice 2)', async () => {
      recipeVersionQb.getMany.mockResolvedValue([]);

      await expect(
        service.getInboundDeltas('tenant-abc', { types: 'recipeversions' }),
      ).rejects.toThrow(
        'Inbound recipe version sync requires a tenant-bound transaction manager',
      );

      // Fail closed means fail before any SQL: the pooled recipe version,
      // recipe detail and insumo reads inside this fetch must never run
      // without the tenant binding.
      expect(mockRecipeVersionRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(mockRecipeDetailRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(mockInsumoRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(recipeVersionQb.getMany).not.toHaveBeenCalled();
    });

    it('fails closed when no manager is supplied for the protected users read (issue #581)', async () => {
      userQb.getMany.mockResolvedValue([]);

      await expect(
        service.getInboundDeltas('tenant-abc', { types: 'users' }),
      ).rejects.toThrow(
        'Inbound user sync requires a tenant-bound transaction manager',
      );

      // Fail closed means fail before any SQL: the pooled users read must
      // never run without the tenant binding.
      expect(mockUserRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(userQb.getMany).not.toHaveBeenCalled();
    });

    it('reads user deltas through the bound manager repository (issue #581)', async () => {
      userQb.getMany.mockResolvedValue([]);

      const getRepository = jest.fn(() => mockUserRepo);
      const manager = { getRepository } as never;

      const response = await service.getInboundDeltas(
        'tenant-abc',
        { types: 'users' },
        undefined,
        manager,
      );

      expect(response.status).toBe('success');
      // The User repository must be resolved through the bound manager, not
      // the pooled constructor-injected one.
      expect(getRepository).toHaveBeenCalledWith(User);
      expect(userQb.where).toHaveBeenCalledWith('user.tenant_id = :tenantId', {
        tenantId: 'tenant-abc',
      });
    });
  });
  describe('OHAC delivery negotiation member', () => {
    const negotiationQuery = { ohacPosBuild: 'pos-build-1' };

    // The shared setup clears mocks once, not per test, so a rejected
    // implementation would leak into the next test and make it fail for a
    // reason that has nothing to do with what it asserts.
    beforeEach(() => deliveryMock.negotiate.mockReset());

    it('omits the member for a client that never opted in', async () => {
      deliveryMock.negotiate.mockResolvedValue({ result: 'not-participating' });

      const response = await service.getInboundDeltas(
        'tenant-1',
        {},
        devicePrincipal,
        buildDefaultBoundManager(),
      );

      expect(response).not.toHaveProperty('humanAuthorization');
    });

    it('omits the member while the terminal is already current', async () => {
      // Absence must never mean DISABLED, so an up-to-date terminal is silent
      // and only an explicit status is reported.
      deliveryMock.negotiate.mockResolvedValue({ result: 'up-to-date' });

      const response = await service.getInboundDeltas(
        'tenant-1',
        {},
        devicePrincipal,
        buildDefaultBoundManager(),
      );

      expect(response).not.toHaveProperty('humanAuthorization');
    });

    it('omits the member when no device principal is present', async () => {
      const response = await service.getInboundDeltas(
        'tenant-1',
        {},
        undefined,
        buildDefaultBoundManager(),
      );

      expect(response).not.toHaveProperty('humanAuthorization');
      expect(deliveryMock.negotiate).not.toHaveBeenCalled();
    });

    it('reports an explicit non-delivery status', async () => {
      for (const status of [
        'DISABLED',
        'UPGRADE_REQUIRED',
        'RECOVERY_REQUIRED',
      ] as const) {
        deliveryMock.negotiate.mockResolvedValue({ result: 'status', status });

        const response = await service.getInboundDeltas(
          'tenant-1',
          negotiationQuery,
          devicePrincipal,
          buildDefaultBoundManager(),
        );

        expect(response.humanAuthorization).toEqual({ status });
      }
    });

    it('carries the epoch, sequence, and digest when there is one to apply', async () => {
      deliveryMock.negotiate.mockResolvedValue({
        result: 'deliver',
        epoch: { schema: 'ohac.staff-policy-epoch.v1', sequence: '1' },
        sequence: '1',
        digest: 'sha256:' + 'a'.repeat(64),
      });

      const response = await service.getInboundDeltas(
        'tenant-1',
        negotiationQuery,
        devicePrincipal,
        buildDefaultBoundManager(),
      );

      expect(response.humanAuthorization).toEqual({
        status: 'DELIVER',
        epoch: { schema: 'ohac.staff-policy-epoch.v1', sequence: '1' },
        sequence: '1',
        digest: 'sha256:' + 'a'.repeat(64),
      });
    });

    it('takes the terminal identity from the principal and the build from the query', async () => {
      deliveryMock.negotiate.mockResolvedValue({ result: 'up-to-date' });

      await service.getInboundDeltas(
        'tenant-1',
        {
          ohacPosBuild: 'pos-build-1',
          ohacPolicySchemas: 'ohac.staff-policy-epoch.v1',
          ohacAssertionSchemas: 'ohac.assertion.v1',
          ohacFloorSequence: '4',
        },
        devicePrincipal,
        buildDefaultBoundManager(),
      );

      expect(deliveryMock.negotiate).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        terminalId: 'pos-terminal-01',
        posBuild: 'pos-build-1',
        supportedPolicySchemas: ['ohac.staff-policy-epoch.v1'],
        supportedAssertionSchemas: ['ohac.assertion.v1'],
        localFloorSequence: '4',
      });
    });

    it('fails the pull closed when the delivery path refuses an untrusted artifact', async () => {
      // Failing the whole pull is deliberate: reporting deltas while silently
      // omitting the member would let a terminal keep operating on a corrupt
      // policy believing it is current.
      const failure = new Error('OHAC delivery refused an untrusted artifact');
      deliveryMock.negotiate.mockRejectedValue(failure);

      await expect(
        service.getInboundDeltas(
          'tenant-1',
          negotiationQuery,
          devicePrincipal,
          buildDefaultBoundManager(),
        ),
      ).rejects.toBe(failure);
    });

    it('still reports the rest of the pull when the tenant negotiates nothing', async () => {
      deliveryMock.negotiate.mockResolvedValue({ result: 'not-participating' });

      const response = await service.getInboundDeltas(
        'tenant-1',
        { sinceVersion: '100' },
        devicePrincipal,
        buildDefaultBoundManager(),
      );

      expect(response.status).toBe('success');
      expect(response.currentVersion).toBeGreaterThan(0);
      expect(response).not.toHaveProperty('humanAuthorization');
    });
  });
  describe('OHAC epoch acknowledgement', () => {
    const ackDto = {
      schema: 'ohac.staff-policy-epoch.v1',
      sequence: '1',
      digest: 'sha256:' + 'a'.repeat(64),
      previousSequence: '0',
      previousDigest: 'GENESIS',
      posBuild: 'pos-build-1',
      assertionSchema: 'ohac.assertion.v1',
      idempotencyKey: 'idem-1',
    };

    beforeEach(() => acknowledgementMock.acknowledge.mockReset());

    it('returns the receipt for an accepted acknowledgement', async () => {
      acknowledgementMock.acknowledge.mockResolvedValue({
        status: 'accepted',
        receipt: {
          receiptId: 'receipt-1',
          status: 'ACCEPTED',
          sequence: '1',
          digest: ackDto.digest,
          floorSequence: '1',
        },
      });

      const response = await service.acknowledgeStaffPolicyEpoch(
        'tenant-1',
        devicePrincipal,
        ackDto,
      );

      expect(response).toEqual({
        status: 'ACCEPTED',
        receiptId: 'receipt-1',
        sequence: '1',
        digest: ackDto.digest,
        floorSequence: '1',
      });
    });

    it('returns the same receipt for a replayed acknowledgement', async () => {
      // A retry must be indistinguishable from the first success, because the
      // terminal lost the response and the receipt is its only proof.
      const receipt = {
        receiptId: 'receipt-1',
        status: 'ACCEPTED' as const,
        sequence: '1',
        digest: ackDto.digest,
        floorSequence: '1',
      };
      acknowledgementMock.acknowledge.mockResolvedValueOnce({
        status: 'accepted',
        receipt,
      });
      acknowledgementMock.acknowledge.mockResolvedValueOnce({
        status: 'replayed',
        receipt,
      });

      const first = await service.acknowledgeStaffPolicyEpoch(
        'tenant-1',
        devicePrincipal,
        ackDto,
      );
      const second = await service.acknowledgeStaffPolicyEpoch(
        'tenant-1',
        devicePrincipal,
        ackDto,
      );

      expect(second).toEqual(first);
    });

    it('answers a rejection as a conflict carrying the stable code', async () => {
      acknowledgementMock.acknowledge.mockResolvedValue({
        status: 'rejected',
        resultCode: 'SEQUENCE_GAP',
        sequence: '3',
      });

      await expect(
        service.acknowledgeStaffPolicyEpoch(
          'tenant-1',
          devicePrincipal,
          ackDto,
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: {
          status: 'REJECTED',
          resultCode: 'SEQUENCE_GAP',
          sequence: '3',
        },
      });
    });

    it('takes the terminal from the principal and never from the body', async () => {
      acknowledgementMock.acknowledge.mockResolvedValue({
        status: 'accepted',
        receipt: {
          receiptId: 'receipt-1',
          status: 'ACCEPTED',
          sequence: '1',
          digest: ackDto.digest,
          floorSequence: '1',
        },
      });

      await service.acknowledgeStaffPolicyEpoch(
        'tenant-1',
        devicePrincipal,
        ackDto,
      );

      expect(acknowledgementMock.acknowledge).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        terminalId: 'pos-terminal-01',
        posBuild: 'pos-build-1',
        assertionSchema: 'ohac.assertion.v1',
        idempotencyKey: 'idem-1',
        claim: {
          sequence: '1',
          digest: ackDto.digest,
          previousSequence: '0',
          previousDigest: 'GENESIS',
        },
      });
    });

    it('fails closed when the acknowledgement service is not wired', async () => {
      // A composition without OHAC must not answer as though it had recorded
      // anything, so the terminal gets a conflict rather than a silent success.
      const bareService = new (
        service.constructor as new (...args: unknown[]) => typeof service
      )(...(Array.from({ length: 9 }, () => ({})) as unknown[]));

      await expect(
        bareService.acknowledgeStaffPolicyEpoch(
          'tenant-1',
          devicePrincipal,
          ackDto,
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: { status: 'REJECTED', resultCode: 'UNAVAILABLE' },
      });
    });
  });

  describe('OHAC recovery token redemption (design §9, §10 HTTP mapping)', () => {
    const redeemDto = {
      token: 'ohr1.66666666-6666-4666-8666-666666666666.abc',
      idempotencyKey: 'idem-1',
      posBuild: 'pos-build-1',
      policySchema: 'ohac.staff-policy-snapshot.v1',
      assertionSchema: 'ohac.assertion.v1',
    };

    beforeEach(() => {
      recoveryTokenMock.redeem.mockReset();
      process.env.OMNIFOOD_BACKEND_BUILD = 'backend-build-1';
    });

    it('returns the redemption receipt shape for a first redemption', async () => {
      recoveryTokenMock.redeem.mockResolvedValue({
        status: 'redeemed',
        receipt: {
          tokenId: 'token-1',
          terminalId: 'pos-terminal-01',
          redeemedAt: new Date('2026-09-28T12:05:00Z'),
        },
      });

      const response = await service.redeemHumanAuthorizationRecoveryToken(
        'tenant-1',
        devicePrincipal,
        redeemDto,
      );

      expect(response).toEqual({
        status: 'REDEEMED',
        tokenId: 'token-1',
        terminalId: 'pos-terminal-01',
        redeemedAt: '2026-09-28T12:05:00.000Z',
      });
    });

    it('marks a lost-response replay as REPLAYED with the same receipt', async () => {
      recoveryTokenMock.redeem.mockResolvedValue({
        status: 'replayed',
        receipt: {
          tokenId: 'token-1',
          terminalId: 'pos-terminal-01',
          redeemedAt: new Date('2026-09-28T12:05:00Z'),
        },
      });

      const response = await service.redeemHumanAuthorizationRecoveryToken(
        'tenant-1',
        devicePrincipal,
        redeemDto,
      );

      expect(response.status).toBe('REPLAYED');
      expect(response.tokenId).toBe('token-1');
    });

    it('maps an expired token through OHAC_ERROR_HTTP_STATUS to its §10 status', async () => {
      recoveryTokenMock.redeem.mockResolvedValue({
        status: 'rejected',
        resultCode: 'OHAC_RECOVERY_EXPIRED',
      });

      await expect(
        service.redeemHumanAuthorizationRecoveryToken(
          'tenant-1',
          devicePrincipal,
          redeemDto,
        ),
      ).rejects.toMatchObject({
        status: OHAC_ERROR_HTTP_STATUS.OHAC_RECOVERY_EXPIRED,
        response: { resultCode: 'OHAC_RECOVERY_EXPIRED' },
      });
    });

    it('maps a binding mismatch to its §10 status (403 family)', async () => {
      recoveryTokenMock.redeem.mockResolvedValue({
        status: 'rejected',
        resultCode: 'OHAC_RECOVERY_BINDING_MISMATCH',
      });

      await expect(
        service.redeemHumanAuthorizationRecoveryToken(
          'tenant-1',
          devicePrincipal,
          redeemDto,
        ),
      ).rejects.toMatchObject({
        status: OHAC_ERROR_HTTP_STATUS.OHAC_RECOVERY_BINDING_MISMATCH,
        response: { resultCode: 'OHAC_RECOVERY_BINDING_MISMATCH' },
      });
    });

    it('takes the tenant/terminal/credential from the principal and pins the deployment backend build', async () => {
      recoveryTokenMock.redeem.mockResolvedValue({
        status: 'redeemed',
        receipt: {
          tokenId: 'token-1',
          terminalId: 'pos-terminal-01',
          redeemedAt: new Date('2026-09-28T12:05:00Z'),
        },
      });

      await service.redeemHumanAuthorizationRecoveryToken(
        'tenant-1',
        devicePrincipal,
        redeemDto,
      );

      expect(recoveryTokenMock.redeem).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          terminalId: 'pos-terminal-01',
          credentialId: 'cred-1',
          backendBuild: 'backend-build-1',
          token: redeemDto.token,
          idempotencyKey: 'idem-1',
        }),
      );
    });

    it('fails closed with OHAC_TEMPORARY_UNAVAILABLE when the recovery service is not wired', async () => {
      const bareService = new (
        service.constructor as new (...args: unknown[]) => typeof service
      )(...(Array.from({ length: 9 }, () => ({})) as unknown[]));

      await expect(
        bareService.redeemHumanAuthorizationRecoveryToken(
          'tenant-1',
          devicePrincipal,
          redeemDto,
        ),
      ).rejects.toMatchObject({
        status: 503,
        response: { resultCode: 'OHAC_TEMPORARY_UNAVAILABLE' },
      });
    });
  });

  describe('forensic alerts projection (ST-05)', () => {
    const boundAlertRows: Record<string, unknown>[] = [
      {
        id: 'alert-active-1',
        tenant_id: 'tenant-abc',
        alert_type: 'COUNT_VARIANCE',
        severity: 'high',
        actor_role: 'MANAGER',
        message: 'Conteo con variación relevante.',
        metadata: null,
        resolved_at: null,
        created_at: new Date('2026-09-01T10:00:00Z'),
      },
      {
        id: 'alert-resolved-1',
        tenant_id: 'tenant-abc',
        alert_type: 'AUDIT_BACKEND_TERMINAL_REJECTION',
        severity: 'critical',
        actor_role: null,
        message: 'Rechazo de terminal registrado.',
        metadata: null,
        resolved_at: new Date('2026-09-02T12:00:00Z'),
        created_at: new Date('2026-09-01T11:00:00Z'),
      },
    ];

    it('projects tenant forensic alerts through the bound manager when types=alerts', async () => {
      const alertRepo = {
        createQueryBuilder: jest
          .fn()
          .mockReturnValue(createMockQueryBuilder(boundAlertRows)),
      };
      const manager = {
        getRepository: jest.fn((entity: unknown) =>
          entity === ForensicAlert ? alertRepo : undefined,
        ),
      };

      const response = await service.getInboundDeltas(
        'tenant-abc',
        { types: 'alerts' },
        undefined,
        manager as never,
      );

      // The alerts read must ride the tenant-bound transaction connection:
      // `forensic_alerts` carries no row-level security policy, so the
      // explicit tenant predicate is the only isolation this table has.
      expect(manager.getRepository).toHaveBeenCalledWith(ForensicAlert);
      expect(alertRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
      expect(alertRepo.createQueryBuilder().where).toHaveBeenCalledWith(
        'alert.tenant_id = :tenantId',
        { tenantId: 'tenant-abc' },
      );
      expect(mockProductRepo.createQueryBuilder).not.toHaveBeenCalled();

      expect(response.deltas.alerts).toHaveLength(2);
      expect(response.deltas.alerts[0]).toEqual({
        id: 'alert-active-1',
        alertType: 'COUNT_VARIANCE',
        severity: 'high',
        message: 'Conteo con variación relevante.',
        actorRole: 'MANAGER',
        resolvedAt: null,
        createdAt: new Date('2026-09-01T10:00:00Z'),
      });
      // Lifecycle state is reported, never fabricated: resolvedAt is passed
      // through verbatim so the terminal can derive status from it.
      expect(response.deltas.alerts[1]).toMatchObject({
        id: 'alert-resolved-1',
        alertType: 'AUDIT_BACKEND_TERMINAL_REJECTION',
        severity: 'critical',
        actorRole: null,
        resolvedAt: new Date('2026-09-02T12:00:00Z'),
      });
    });

    it('filters incremental pulls by created_at >= sinceVersion', async () => {
      const alertRepo = {
        createQueryBuilder: jest
          .fn()
          .mockReturnValue(createMockQueryBuilder(boundAlertRows)),
      };
      const manager = {
        getRepository: jest.fn((entity: unknown) =>
          entity === ForensicAlert ? alertRepo : undefined,
        ),
      };

      await service.getInboundDeltas(
        'tenant-abc',
        { types: 'alerts', sinceVersion: '1787745600000' },
        undefined,
        manager as never,
      );

      // The cursor for alerts is created_at only: the table has no
      // updated_at column, so no other timestamp can advance it. The
      // comparison is INCLUSIVE because the terminal applies each delta
      // insert-if-absent, so an overlapping row is idempotent there, while a
      // strict comparison could silently drop an alert created exactly at
      // the watermark.
      expect(alertRepo.createQueryBuilder().andWhere).toHaveBeenCalledWith(
        'alert.created_at >= :sinceDate',
        { sinceDate: new Date(1787745600000) },
      );
    });

    it('includes alerts in the default pull when the types parameter is omitted', async () => {
      const alertRepo = {
        createQueryBuilder: jest
          .fn()
          .mockReturnValue(createMockQueryBuilder(boundAlertRows)),
      };
      // The default pull reads products/insumos on the manager too; only
      // the alerts repository is overridden with the projection rows.
      const manager = buildDefaultBoundManager(
        new Map<unknown, unknown>([[ForensicAlert, alertRepo]]),
      ) as { getRepository: jest.Mock };

      // The production POS pull sends no types parameter: the default type
      // set must include alerts or the terminal inbox would starve.
      const response = await service.getInboundDeltas(
        'tenant-abc',
        {},
        undefined,
        manager as never,
      );

      expect(manager.getRepository).toHaveBeenCalledWith(ForensicAlert);
      expect(response.deltas.alerts).toHaveLength(2);
      expect(response.deltas.alerts[0]).toMatchObject({
        id: 'alert-active-1',
      });
    });

    it('serves no alerts when the type is not requested', async () => {
      const alertRepo = {
        createQueryBuilder: jest
          .fn()
          .mockReturnValue(createMockQueryBuilder(boundAlertRows)),
      };
      const manager = {
        getRepository: jest.fn((entity: unknown) => {
          if (entity === ForensicAlert) return alertRepo;
          // Issue #512: products reads ride the bound manager too.
          if (entity === Product) return mockProductRepo;
          return undefined;
        }),
      };

      const response = await service.getInboundDeltas(
        'tenant-abc',
        { types: 'products' },
        undefined,
        manager as never,
      );

      expect(manager.getRepository).not.toHaveBeenCalledWith(ForensicAlert);
      expect(response.deltas.alerts).toEqual([]);
    });

    it('answers an empty alerts array on the legacy unmanaged path instead of touching foreign repositories', async () => {
      // Without a bound manager there is no repository to read alerts from:
      // the entity is deliberately not registered forFeature (no module owns
      // it) and a pooled unbound read would bypass tenant isolation. Every
      // production caller (inbound controller, terminal priming) supplies a
      // manager; the legacy path stays defined and empty rather than unsafe.
      const response = await service.getInboundDeltas('tenant-abc', {
        types: 'alerts',
      });

      expect(response.deltas.alerts).toEqual([]);
    });
  });

  describe('recipe version insumo authority closure (issue #519 U1)', () => {
    function buildRecipeVersionRow(overrides: Record<string, unknown> = {}) {
      return {
        id: 'rv-1',
        product_id: 'prod-1',
        tenant_id: 'tenant-abc',
        pos_document_id: null,
        product_name: 'Producto 1',
        version_number: 1,
        is_active: true,
        fecha_inicio_vigencia: new Date('2026-08-01T00:00:00Z'),
        fecha_fin_vigencia: null,
        yield_quantity: '1',
        technical_shrink_pct: '0',
        version_note: null,
        published_at: new Date('2026-08-01T00:00:00Z'),
        pos_created_at: null,
        origin: 'MANUAL',
        suggestion_state: 'CONFIRMED',
        created_at: new Date('2026-08-01T00:00:00Z'),
        ...overrides,
      } as unknown as RecipeVersion;
    }

    function buildComponentRow(overrides: Record<string, unknown> = {}) {
      return {
        id: 'detail-1',
        tenant_id: 'tenant-abc',
        recipe_version_id: 'rv-1',
        insumo_id: 'ins-1',
        quantity: '2',
        gross_quantity: '2',
        technical_shrink_pct: '0',
        ingredient_name: null,
        ingredient_type: 'INSUMO',
        component_uom: null,
        reference_version_id: null,
        ...overrides,
      } as unknown as RecipeDetail;
    }

    function buildComponentInsumoRow(overrides: Record<string, unknown> = {}) {
      return {
        id: 'ins-1',
        tenant_id: 'tenant-abc',
        name: 'Leche',
        purchaseUom: 'L',
        consumptionUom: 'ml',
        ...overrides,
      } as unknown as Insumo;
    }

    async function pullRecipeVersions() {
      return service.getInboundDeltas(
        'tenant-abc',
        { types: 'recipeversions' },
        undefined,
        buildDefaultBoundManager(),
      );
    }

    it('de-duplicates the per-version closure and states the consumption UOM, not the purchase UOM', async () => {
      recipeVersionQb.getMany.mockResolvedValue([buildRecipeVersionRow()]);
      recipeDetailQb.getMany.mockResolvedValue([
        buildComponentRow({ id: 'detail-a', insumo_id: 'ins-1' }),
        buildComponentRow({ id: 'detail-b', insumo_id: 'ins-1' }),
      ]);
      insumoQb.getMany.mockResolvedValue([buildComponentInsumoRow()]);

      const response = await pullRecipeVersions();

      expect(response.deltas.recipeVersions).toHaveLength(1);
      // purchaseUom is 'L' and consumptionUom is 'ml': the closure must
      // state the consumption UOM the backend authorities, so the POS
      // stops guessing between the two.
      expect(response.deltas.recipeVersions[0].insumos).toEqual([
        {
          id: 'ins-1',
          tenantId: 'tenant-abc',
          name: 'Leche',
          uom: 'ml',
        },
      ]);
    });

    it('attaches only each version own closure, with [] for a componentless version', async () => {
      recipeVersionQb.getMany.mockResolvedValue([
        buildRecipeVersionRow({ id: 'rv-1', product_id: 'prod-1' }),
        buildRecipeVersionRow({ id: 'rv-2', product_id: 'prod-2' }),
        buildRecipeVersionRow({ id: 'rv-3', product_id: 'prod-3' }),
      ]);
      recipeDetailQb.getMany.mockResolvedValue([
        buildComponentRow({
          id: 'detail-1',
          recipe_version_id: 'rv-1',
          insumo_id: 'ins-1',
        }),
        buildComponentRow({
          id: 'detail-2',
          recipe_version_id: 'rv-2',
          insumo_id: 'ins-2',
        }),
      ]);
      insumoQb.getMany.mockResolvedValue([
        buildComponentInsumoRow({ id: 'ins-1', consumptionUom: 'ml' }),
        buildComponentInsumoRow({
          id: 'ins-2',
          name: 'Café',
          purchaseUom: 'kg',
          consumptionUom: 'g',
        }),
      ]);

      const response = await pullRecipeVersions();

      const [rv1, rv2, rv3] = response.deltas.recipeVersions;
      // Per-version, not a global sibling delta key: each version carries
      // only the insumos its own components reference.
      expect(rv1.insumos).toEqual([
        { id: 'ins-1', tenantId: 'tenant-abc', name: 'Leche', uom: 'ml' },
      ]);
      expect(rv2.insumos).toEqual([
        { id: 'ins-2', tenantId: 'tenant-abc', name: 'Café', uom: 'g' },
      ]);
      // A version with no components has an empty closure, never a missing
      // field.
      expect(rv3.insumos).toEqual([]);
    });

    it('keeps the fail-closed eligibility error when a component references an insumo outside the tenant set', async () => {
      recipeVersionQb.getMany.mockResolvedValue([buildRecipeVersionRow()]);
      recipeDetailQb.getMany.mockResolvedValue([
        buildComponentRow({ id: 'detail-foreign', insumo_id: 'ins-foreign' }),
      ]);
      insumoQb.getMany.mockResolvedValue([buildComponentInsumoRow()]);

      await expect(pullRecipeVersions()).rejects.toThrow(
        'Recipe version component insumo is not eligible for inbound sync',
      );
    });

    it('fails closed naming the insumo id when the consumption UOM is empty', async () => {
      recipeVersionQb.getMany.mockResolvedValue([buildRecipeVersionRow()]);
      recipeDetailQb.getMany.mockResolvedValue([
        buildComponentRow({ id: 'detail-empty', insumo_id: 'ins-empty-uom' }),
      ]);
      insumoQb.getMany.mockResolvedValue([
        buildComponentInsumoRow({ id: 'ins-empty-uom', consumptionUom: '' }),
      ]);

      await expect(pullRecipeVersions()).rejects.toThrow(BadRequestException);
      await expect(pullRecipeVersions()).rejects.toThrow('ins-empty-uom');
    });
  });

  describe('slice 5d inbound deltas: loyaltyPrograms, promotions, customers', () => {
    it('includes the three new keys by default and reads them through the bound manager', async () => {
      loyaltyProgramQb.getMany.mockResolvedValue([]);
      loyaltyRewardQb.getMany.mockResolvedValue([]);
      promotionQb.getMany.mockResolvedValue([]);
      customerQb.getMany.mockResolvedValue([]);

      const response = await service.getInboundDeltas(
        'tenant-abc',
        {},
        undefined,
        buildDefaultBoundManager(),
      );

      // The production POS pull sends no types parameter: the default type
      // set must include the new keys or the terminal would never receive
      // loyalty programs, promotions or customers.
      expect(response.deltas.loyaltyPrograms).toEqual([]);
      expect(response.deltas.promotions).toEqual([]);
      expect(response.deltas.customers).toEqual([]);
      expect(mockLoyaltyProgramRepo.createQueryBuilder).toHaveBeenCalled();
      expect(mockLoyaltyRewardRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(mockPromotionRepo.createQueryBuilder).toHaveBeenCalled();
      expect(mockCustomerRepo.createQueryBuilder).toHaveBeenCalled();

      // Tenant scoping: every read is tenant-predicated on top of the RLS
      // binding.
      expect(loyaltyProgramQb.where).toHaveBeenCalledWith(
        'program.tenant_id = :tenantId',
        { tenantId: 'tenant-abc' },
      );
      expect(promotionQb.where).toHaveBeenCalledWith(
        'promotion.tenant_id = :tenantId',
        { tenantId: 'tenant-abc' },
      );
      expect(customerQb.where).toHaveBeenCalledWith(
        'customer.tenant_id = :tenantId',
        { tenantId: 'tenant-abc' },
      );
    });

    it('projects loyalty programs with their embedded reward closure', async () => {
      loyaltyProgramQb.getMany.mockResolvedValue([
        {
          id: 'lp-1',
          tenant_id: 'tenant-abc',
          name: 'Café Loyal',
          program_type: 'SPEND_POINTS',
          status: 'ACTIVE',
          starts_at: new Date('2026-08-01T00:00:00Z'),
          ends_at: null,
          earning_rule: { pointsPerCurrency: 1 },
          eligibility_rule: { minOrderAmount: 100 },
          config_version: 3,
          created_at: new Date('2026-08-01T00:00:00Z'),
          updated_at: new Date('2026-08-02T00:00:00Z'),
        } as unknown as LoyaltyProgram,
      ]);
      loyaltyRewardQb.getMany.mockResolvedValue([
        {
          id: 'rw-1',
          tenant_id: 'tenant-abc',
          loyalty_program_id: 'lp-1',
          name: 'Café gratis',
          description: null,
          reward_type: 'FREE_PRODUCT',
          cost_units: 100,
          benefit_config: { productId: 'prod-1' },
          status: 'ACTIVE',
          starts_at: null,
          ends_at: null,
          presentation_order: 1,
          config_version: 2,
          created_at: new Date('2026-08-01T00:00:00Z'),
          updated_at: new Date('2026-08-02T00:00:00Z'),
        } as unknown as RewardDefinition,
      ]);

      const response = await service.getInboundDeltas(
        'tenant-abc',
        { types: 'loyaltyprograms' },
        undefined,
        buildDefaultBoundManager(),
      );

      expect(response.deltas.loyaltyPrograms).toHaveLength(1);
      expect(response.deltas.loyaltyPrograms[0]).toMatchObject({
        id: 'lp-1',
        tenantId: 'tenant-abc',
        name: 'Café Loyal',
        programType: 'SPEND_POINTS',
        status: 'ACTIVE',
        earningRule: { pointsPerCurrency: 1 },
        eligibilityRule: { minOrderAmount: 100 },
        configVersion: 3,
      });
      // The reward closure rides inside the program: the POS must be able to
      // apply the program without a second lookup.
      expect(response.deltas.loyaltyPrograms[0].rewards).toMatchObject([
        {
          id: 'rw-1',
          loyaltyProgramId: 'lp-1',
          rewardType: 'FREE_PRODUCT',
          costUnits: 100,
          benefitConfig: { productId: 'prod-1' },
        },
      ]);
      // The reward read is tenant-predicated and scoped to the fetched
      // programs.
      expect(loyaltyRewardQb.where).toHaveBeenCalledWith(
        'reward.tenant_id = :tenantId',
        { tenantId: 'tenant-abc' },
      );
      expect(loyaltyRewardQb.andWhere).toHaveBeenCalledWith(
        'reward.loyalty_program_id IN (:...programIds)',
        { programIds: ['lp-1'] },
      );
    });

    it('matches a program incrementally when the program row or any of its rewards changed', async () => {
      loyaltyProgramQb.getMany.mockResolvedValue([]);
      loyaltyRewardQb.getMany.mockResolvedValue([]);
      promotionQb.getMany.mockResolvedValue([]);
      customerQb.getMany.mockResolvedValue([]);

      await service.getInboundDeltas(
        'tenant-abc',
        { sinceVersion: '1787745600000' },
        undefined,
        buildDefaultBoundManager(),
      );

      expect(loyaltyProgramQb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('loyalty_rewards reward_cursor'),
        { sinceDate: new Date(1787745600000) },
      );
      expect(promotionQb.andWhere).toHaveBeenCalledWith(
        'promotion.updated_at > :sinceDate',
        { sinceDate: new Date(1787745600000) },
      );
      expect(customerQb.andWhere).toHaveBeenCalledWith(
        'customer.updated_at > :sinceDate',
        { sinceDate: new Date(1787745600000) },
      );
      // No programs matched: the reward closure read is skipped entirely.
      expect(mockLoyaltyRewardRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('answers empty arrays for the new keys when they are not requested', async () => {
      const response = await service.getInboundDeltas(
        'tenant-abc',
        { types: 'products,users' },
        undefined,
        buildDefaultBoundManager(),
      );

      expect(response.deltas.loyaltyPrograms).toEqual([]);
      expect(response.deltas.promotions).toEqual([]);
      expect(response.deltas.customers).toEqual([]);
      expect(mockLoyaltyProgramRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(mockLoyaltyRewardRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(mockPromotionRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(mockCustomerRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('fails closed without a tenant-bound manager for each new protected read', async () => {
      await expect(
        service.getInboundDeltas('tenant-abc', { types: 'loyaltyprograms' }),
      ).rejects.toThrow(
        'Inbound loyalty program sync requires a tenant-bound transaction manager',
      );
      await expect(
        service.getInboundDeltas('tenant-abc', { types: 'promotions' }),
      ).rejects.toThrow(
        'Inbound promotion sync requires a tenant-bound transaction manager',
      );
      await expect(
        service.getInboundDeltas('tenant-abc', { types: 'customers' }),
      ).rejects.toThrow(
        'Inbound customer sync requires a tenant-bound transaction manager',
      );

      // Fail closed means fail before any SQL: the pooled reads never run.
      expect(mockLoyaltyProgramRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(mockLoyaltyRewardRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(mockPromotionRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(mockCustomerRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });
});
