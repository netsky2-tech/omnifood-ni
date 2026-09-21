import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException } from '@nestjs/common';
import { InboundSyncService } from './inbound-sync.service';
import { Product, ProductType } from '../../inventory/entities/product.entity';
import { CatalogValue } from '../../catalog/entities/catalog-value.entity';
import { Insumo } from '../../inventory/entities/insumo.entity';
import { Recipe } from '../../inventory/entities/recipe.entity';
import { RecipeVersion } from '../../inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../../inventory/entities/recipe-detail.entity';
import { ProductInventoryMappingVersion } from '../../inventory/entities/product-inventory-mapping-version.entity';
import { User, UserRole } from '../../identity/entities/user.entity';
import { FiscalConfigVersionService } from '../../onboarding/services/fiscal-config-version.service';
import { StaffPolicyEpochDeliveryService } from '../../identity/human-authorization/services/staff-policy-epoch-delivery.service';
import { StaffPolicyEpochAcknowledgementService } from '../../identity/human-authorization/services/staff-policy-epoch-acknowledgement.service';
import type { DeviceSyncPrincipal } from '../../identity/security/device-sync-principal';
import { CatalogType } from '../../catalog/catalog-type';

interface MockQueryBuilder<T> {
  where: jest.Mock;
  andWhere: jest.Mock;
  leftJoinAndSelect: jest.Mock;
  addSelect: jest.Mock;
  getMany: jest.Mock<Promise<T[]>, []>;
  orderBy: jest.Mock;
}

function createMockQueryBuilder<T>(items: T[] = []): MockQueryBuilder<T> {
  const qb: MockQueryBuilder<T> = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    getMany: jest.fn<Promise<T[]>, []>().mockResolvedValue(items),
    orderBy: jest.fn().mockReturnThis(),
  };
  return qb;
}

describe('InboundSyncService', () => {
  let service: InboundSyncService;
  const deliveryMock = { negotiate: jest.fn() };
  const acknowledgementMock = { acknowledge: jest.fn() };
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
      ],
    }).compile();

    service = module.get<InboundSyncService>(InboundSyncService);
    fiscalService = module.get(FiscalConfigVersionService);
    jest.clearAllMocks();
  });

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

    const response = await service.getInboundDeltas('tenant-abc', {});

    expect(response.status).toBe('success');
    expect(response.deltas.products).toHaveLength(1);
    expect(response.deltas.products[0]).toEqual({
      id: 'prod-1',
      name: 'Café Americano',
      uom: 'CUP',
      stock: 10.5,
      averageCost: 15,
      sellPrice: 45,
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

  it('keeps persistence-only tax fields out of the inbound product contract', async () => {
    // Scenario: POS device syncs a product with explicit fiscal fields.
    // The backend must preserve tax_rate and is_tax_exempt exactly.
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
    ];

    productQb.getMany.mockResolvedValue(mockProducts);

    const response = await service.getInboundDeltas('tenant-abc', {});

    expect(response.deltas.products).toHaveLength(2);

    const taxable = response.deltas.products.find(
      (p) => p.id === 'prod-taxable',
    );
    const exempt = response.deltas.products.find((p) => p.id === 'prod-exempt');

    expect(taxable).not.toHaveProperty('taxRate');
    expect(taxable).not.toHaveProperty('isTaxExempt');
    expect(exempt).not.toHaveProperty('taxRate');
    expect(exempt).not.toHaveProperty('isTaxExempt');
  });

  it('filters deltas by ISO timestamp since string', async () => {
    const sinceIso = '2026-08-20T00:00:00.000Z';
    await service.getInboundDeltas('tenant-abc', { since: sinceIso });

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
    await service.getInboundDeltas('tenant-abc', {
      sinceVersion: sinceTimestamp,
    });

    expect(productQb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('mapping_cursor'),
      { sinceDate: new Date(1787745600000) },
    );
  });

  it('filters by entity types when requested', async () => {
    const response = await service.getInboundDeltas('tenant-abc', {
      types: 'products,users',
    });

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

    it('binds the tenant context via the shared guard before reading mapping versions', async () => {
      await service.getInboundDeltas('tenant-abc', { types: 'products' });

      expect(mockMappingVersionRepo.manager.query).toHaveBeenCalledWith(
        "SELECT set_config('app.tenant_id', $1, true)",
        ['tenant-abc'],
      );
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
        [Product, { createQueryBuilder: jest.fn().mockReturnValue(createMockQueryBuilder([boundProduct])) }],
        [CatalogValue, { createQueryBuilder: jest.fn().mockReturnValue(createMockQueryBuilder([boundCatalogValue])) }],
        [ProductInventoryMappingVersion, { createQueryBuilder: jest.fn().mockReturnValue(createMockQueryBuilder([boundMapping])) }],
      ]);
      const manager = buildBoundManager(managerRepos);

      const response = await service.getInboundDeltas(
        'tenant-abc',
        { types: 'products,catalogvalues' } as never,
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

    it('keeps the global repositories as the default path when no manager is supplied', async () => {
      productQb.getMany.mockResolvedValue([boundProduct]);

      const response = await service.getInboundDeltas('tenant-abc', {
        types: 'products',
      } as never);

      // Byte-for-byte the pre-existing device-path behavior: global repos,
      // and the session-scoped mapping binding workaround still runs.
      expect(mockProductRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
      expect(mockMappingVersionRepo.manager.query).toHaveBeenCalledWith(
        "SELECT set_config('app.tenant_id', $1, true)",
        ['tenant-abc'],
      );
      expect(response.deltas.products).toHaveLength(1);
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
      );

      expect(response).not.toHaveProperty('humanAuthorization');
    });

    it('omits the member when no device principal is present', async () => {
      const response = await service.getInboundDeltas('tenant-1', {});

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
        service.getInboundDeltas('tenant-1', negotiationQuery, devicePrincipal),
      ).rejects.toBe(failure);
    });

    it('still reports the rest of the pull when the tenant negotiates nothing', async () => {
      deliveryMock.negotiate.mockResolvedValue({ result: 'not-participating' });

      const response = await service.getInboundDeltas(
        'tenant-1',
        { sinceVersion: '100' },
        devicePrincipal,
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
});
