import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InboundSyncService } from './inbound-sync.service';
import { Product, ProductType } from '../../inventory/entities/product.entity';
import { CatalogValue } from '../../catalog/entities/catalog-value.entity';
import { Insumo } from '../../inventory/entities/insumo.entity';
import { Recipe } from '../../inventory/entities/recipe.entity';
import { RecipeVersion } from '../../inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../../inventory/entities/recipe-detail.entity';
import { User, UserRole } from '../../identity/entities/user.entity';
import { CatalogType } from '../../catalog/catalog-type';
import { FiscalConfigVersionService } from '../../onboarding/services/fiscal-config-version.service';
import { FiscalRegime } from '../../onboarding/dto/fiscal-setup.dto';

interface MockQueryBuilder<T> {
  where: jest.Mock;
  andWhere: jest.Mock;
  leftJoinAndSelect: jest.Mock;
  addSelect: jest.Mock;
  getMany: jest.Mock<Promise<T[]>, []>;
}

function createMockQueryBuilder<T>(items: T[] = []): MockQueryBuilder<T> {
  const qb: MockQueryBuilder<T> = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    getMany: jest.fn<Promise<T[]>, []>().mockResolvedValue(items),
  };
  return qb;
}

describe('InboundSyncService', () => {
  let service: InboundSyncService;

  let productQb: MockQueryBuilder<Product>;
  let catalogQb: MockQueryBuilder<CatalogValue>;
  let insumoQb: MockQueryBuilder<Insumo>;
  let recipeQb: MockQueryBuilder<Recipe>;
  let recipeVersionQb: MockQueryBuilder<RecipeVersion>;
  let recipeDetailQb: MockQueryBuilder<RecipeDetail>;
  let userQb: MockQueryBuilder<User>;

  let mockProductRepo: { createQueryBuilder: jest.Mock };
  let mockCatalogRepo: { createQueryBuilder: jest.Mock };
  let mockInsumoRepo: { createQueryBuilder: jest.Mock };
  let mockRecipeRepo: { createQueryBuilder: jest.Mock };
  let mockRecipeVersionRepo: { createQueryBuilder: jest.Mock };
  let mockRecipeDetailRepo: { createQueryBuilder: jest.Mock };
  let mockUserRepo: { createQueryBuilder: jest.Mock };

  beforeEach(async () => {
    productQb = createMockQueryBuilder<Product>([]);
    catalogQb = createMockQueryBuilder<CatalogValue>([]);
    insumoQb = createMockQueryBuilder<Insumo>([]);
    recipeQb = createMockQueryBuilder<Recipe>([]);
    recipeVersionQb = createMockQueryBuilder<RecipeVersion>([]);
    recipeDetailQb = createMockQueryBuilder<RecipeDetail>([]);
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
    mockUserRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(userQb),
    };

    const mockFiscalService = {
      getFiscalConfigSnapshot: jest.fn().mockResolvedValue({
        tenantId: 'tenant-abc',
        businessName: 'Café Granada',
        ruc: 'J0310000000001',
        fiscalRegime: FiscalRegime.REGIMEN_GENERAL,
        taxRate: 0.15,
        pricesIncludeTax: true,
        commercialFxSpread: 0.5,
        configVersion: {
          revision: 1,
          fingerprint:
            '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        },
        generatedAt: '2026-03-30T12:00:00Z',
      }),
      validateIntegrity: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InboundSyncService,
        {
          provide: FiscalConfigVersionService,
          useValue: mockFiscalService,
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
          provide: getRepositoryToken(User),
          useValue: mockUserRepo,
        },
      ],
    }).compile();

    service = module.get<InboundSyncService>(InboundSyncService);
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

  it('projects only tenant-owned published recipe-version component facts', async () => {
    const version = {
      id: 'version-1',
      tenant_id: 'tenant-abc',
      product_id: 'product-1',
      version_number: 2,
      is_active: true,
      publication_state: 'PUBLISHED',
      fecha_inicio_vigencia: new Date('2026-08-01T00:00:00Z'),
      fecha_fin_vigencia: null,
      yield_quantity: 4,
      technical_shrink_pct: 2.5,
      version_note: 'published batch',
      published_at: new Date('2026-08-01T00:00:00Z'),
      created_at: new Date('2026-08-01T00:00:00Z'),
    } as unknown as RecipeVersion;
    const component = {
      id: 'component-1',
      tenant_id: 'tenant-abc',
      recipe_version_id: 'version-1',
      insumo_id: 'insumo-1',
      quantity: 1.25,
      gross_quantity: 1.5,
      technical_shrink_pct: 2.5,
      ingredient_type: 'INSUMO',
      component_uom: 'g',
    } as unknown as RecipeDetail;
    insumoQb.getMany.mockResolvedValue([
      {
        id: 'insumo-1',
        tenant_id: 'tenant-abc',
        name: 'Coffee',
        purchaseUom: 'kg',
        consumptionUom: 'g',
        conversionFactor: 1000,
        stock: 10,
        averageCost: 4,
        is_active: true,
        is_perishable: false,
        negativeStockPolicy: 'RESTRICT',
        created_at: new Date('2026-08-01T00:00:00Z'),
        updated_at: new Date('2026-08-01T00:00:00Z'),
      } as unknown as Insumo,
    ]);
    recipeQb.getMany.mockResolvedValue([
      {
        id: 'legacy-recipe-1',
        tenant_id: 'tenant-abc',
        productId: 'product-1',
        ingredientId: 'mutable-insumo',
        ingredientType: 'INSUMO',
        quantity: 99,
        created_at: new Date('2026-08-01T00:00:00Z'),
        updated_at: new Date('2026-08-01T00:00:00Z'),
      } as unknown as Recipe,
    ]);
    recipeVersionQb.getMany.mockResolvedValue([version]);
    recipeDetailQb.getMany.mockResolvedValue([component]);

    const response = await service.getInboundDeltas('tenant-abc', {
      types: 'insumos,recipes,recipe_versions',
    });

    expect(response.deltas.insumos[0].tenantId).toBe('tenant-abc');
    expect(response.deltas.recipes[0]).toMatchObject({
      tenantId: 'tenant-abc',
      id: 'legacy-recipe-1',
    });
    expect(response.deltas.recipeVersions).toEqual([
      expect.objectContaining({
        id: 'version-1',
        tenantId: 'tenant-abc',
        productId: 'product-1',
        publicationState: 'PUBLISHED',
        effectiveAt: version.fecha_inicio_vigencia,
        components: [
          {
            id: 'component-1',
            tenantId: 'tenant-abc',
            recipeVersionId: 'version-1',
            componentOrdinal: 0,
            insumoId: 'insumo-1',
            quantityPerSaleUnit: 1.25,
            grossQuantity: 1.5,
            technicalShrinkPct: 2.5,
            ingredientName: null,
            ingredientType: 'INSUMO',
            componentUom: 'g',
            referenceVersionId: null,
          },
        ],
      }),
    ]);
    expect(recipeDetailQb.where).toHaveBeenCalledWith(
      'detail.recipe_version_id IN (:...versionIds)',
      { versionIds: ['version-1'] },
    );
  });

  it('projects the complete immutable version contract with direct version linkage', async () => {
    const version = {
      id: 'version-immutable-1',
      tenant_id: 'tenant-abc',
      product_id: 'product-1',
      version_number: 7,
      is_active: true,
      publication_state: 'PUBLISHED',
      fecha_inicio_vigencia: new Date('2026-08-01T00:00:00Z'),
      fecha_fin_vigencia: null,
      pos_document_id: 'recipe-document-immutable-1',
      product_name: 'Frozen product name',
      yield_quantity: 4,
      technical_shrink_pct: 2.5,
      version_note: 'published batch',
      published_at: new Date('2026-08-01T00:00:00Z'),
      pos_created_at: new Date('2026-07-31T00:00:00Z'),
      origin: 'MANUAL',
      suggestion_state: 'CONFIRMED',
      created_at: new Date('2026-08-01T00:00:00Z'),
    } as unknown as RecipeVersion;
    recipeVersionQb.getMany.mockResolvedValue([version]);
    recipeDetailQb.getMany.mockResolvedValue([
      {
        id: 'component-null-uom',
        tenant_id: 'tenant-abc',
        recipe_version_id: version.id,
        insumo_id: 'insumo-1',
        quantity: 1.25,
        gross_quantity: 1.5,
        technical_shrink_pct: 2.5,
        ingredient_name: 'Frozen insumo name',
        ingredient_type: 'INSUMO',
        component_uom: null,
        reference_version_id: null,
      },
    ] as RecipeDetail[]);
    insumoQb.getMany.mockResolvedValue([
      { id: 'insumo-1', tenant_id: 'tenant-abc' },
    ] as Insumo[]);

    const response = await service.getInboundDeltas('tenant-abc', {
      types: 'recipe_versions',
    });

    expect(response.deltas.recipeVersions).toEqual([
      expect.objectContaining({
        id: 'version-immutable-1',
        recipeVersionId: 'version-immutable-1',
        recipeDocumentId: 'recipe-document-immutable-1',
        productName: 'Frozen product name',
        posCreatedAt: new Date('2026-07-31T00:00:00Z'),
        origin: 'MANUAL',
        suggestionState: 'CONFIRMED',
        components: [
          expect.objectContaining({
            recipeVersionId: 'version-immutable-1',
            ingredientName: 'Frozen insumo name',
            componentUom: null,
            referenceVersionId: null,
          }),
        ],
      }),
    ]);
  });

  it('uses immutable component identity order to assign stable ordinals', async () => {
    recipeVersionQb.getMany.mockResolvedValue([
      {
        id: 'version-ordered',
        tenant_id: 'tenant-abc',
        product_id: 'product-1',
      },
    ] as RecipeVersion[]);
    recipeDetailQb.getMany.mockResolvedValue([
      {
        id: 'component-z',
        tenant_id: 'tenant-abc',
        recipe_version_id: 'version-ordered',
        insumo_id: 'insumo-1',
      },
      {
        id: 'component-a',
        tenant_id: 'tenant-abc',
        recipe_version_id: 'version-ordered',
        insumo_id: 'insumo-2',
      },
    ] as RecipeDetail[]);
    insumoQb.getMany.mockResolvedValue([
      { id: 'insumo-1', tenant_id: 'tenant-abc' },
      { id: 'insumo-2', tenant_id: 'tenant-abc' },
    ] as Insumo[]);

    const response = await service.getInboundDeltas('tenant-abc', {
      types: 'recipe_versions',
    });

    expect(response.deltas.recipeVersions[0].components).toMatchObject([
      { id: 'component-a', componentOrdinal: 0 },
      { id: 'component-z', componentOrdinal: 1 },
    ]);
  });

  it('includes a version that became effective after the incremental cursor', async () => {
    const since = '2026-08-10T00:00:00.000Z';
    const version = {
      id: 'version-became-effective',
      tenant_id: 'tenant-abc',
      product_id: 'product-1',
      version_number: 2,
      is_active: true,
      publication_state: 'PUBLISHED',
      fecha_inicio_vigencia: new Date('2026-08-11T00:00:00Z'),
      fecha_fin_vigencia: null,
      yield_quantity: 1,
      technical_shrink_pct: 0,
      published_at: new Date('2026-08-01T00:00:00Z'),
      created_at: new Date('2026-08-01T00:00:00Z'),
    } as unknown as RecipeVersion;
    recipeVersionQb.getMany.mockResolvedValue([version]);

    const response = await service.getInboundDeltas('tenant-abc', {
      types: 'recipe_versions',
      since,
    });

    expect(response.deltas.recipeVersions).toHaveLength(1);
    expect(response.deltas.recipeVersions[0].id).toBe(
      'version-became-effective',
    );
    expect(recipeVersionQb.andWhere).toHaveBeenCalledWith(
      '(rv.created_at > :sinceDate OR rv.published_at > :sinceDate OR rv.fecha_inicio_vigencia > :sinceDate)',
      { sinceDate: new Date(since) },
    );
  });

  it('fails closed when a version component references a missing or foreign insumo', async () => {
    recipeVersionQb.getMany.mockResolvedValue([
      {
        id: 'version-1',
        tenant_id: 'tenant-abc',
        product_id: 'product-1',
      },
    ] as RecipeVersion[]);
    recipeDetailQb.getMany.mockResolvedValue([
      {
        id: 'missing-insumo-component',
        tenant_id: 'tenant-abc',
        recipe_version_id: 'version-1',
        insumo_id: 'insumo-missing',
      },
    ] as RecipeDetail[]);

    await expect(
      service.getInboundDeltas('tenant-abc', { types: 'recipe_versions' }),
    ).rejects.toThrow(BadRequestException);

    recipeDetailQb.getMany.mockResolvedValue([
      {
        id: 'foreign-insumo-component',
        tenant_id: 'tenant-abc',
        recipe_version_id: 'version-1',
        insumo_id: 'insumo-foreign',
      },
    ] as RecipeDetail[]);
    insumoQb.getMany.mockResolvedValue([
      {
        id: 'insumo-foreign',
        tenant_id: 'tenant-foreign',
      },
    ] as Insumo[]);

    await expect(
      service.getInboundDeltas('tenant-abc', { types: 'recipe_versions' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects ambiguous effective versions and foreign version components', async () => {
    recipeVersionQb.getMany.mockResolvedValue([
      { id: 'version-1', tenant_id: 'tenant-abc', product_id: 'product-1' },
      { id: 'version-2', tenant_id: 'tenant-abc', product_id: 'product-1' },
    ] as RecipeVersion[]);

    await expect(
      service.getInboundDeltas('tenant-abc', { types: 'recipe_versions' }),
    ).rejects.toThrow(BadRequestException);

    recipeVersionQb.getMany.mockResolvedValue([
      { id: 'version-1', tenant_id: 'tenant-abc', product_id: 'product-1' },
    ] as RecipeVersion[]);
    recipeDetailQb.getMany.mockResolvedValue([
      {
        id: 'foreign-component',
        tenant_id: 'tenant-foreign',
        recipe_version_id: 'version-1',
        insumo_id: 'insumo-foreign',
      },
    ] as RecipeDetail[]);

    await expect(
      service.getInboundDeltas('tenant-abc', { types: 'recipe_versions' }),
    ).rejects.toThrow(BadRequestException);
    // This deliberately returns the foreign row so the service must validate it;
    // a tenant predicate here would hide a corrupt cross-tenant component link.
    expect(recipeDetailQb.where).toHaveBeenCalledWith(
      'detail.recipe_version_id IN (:...versionIds)',
      { versionIds: ['version-1'] },
    );
    expect(recipeDetailQb.where).not.toHaveBeenCalledWith(
      'detail.tenant_id = :tenantId',
      { tenantId: 'tenant-abc' },
    );
  });

  it('includes FiscalConfigSnapshot in outbound deltas when requested or default', async () => {
    const response = await service.getInboundDeltas('tenant-abc', {});

    expect(response.deltas.fiscalConfig).toBeDefined();
    expect(response.deltas.fiscalConfig.businessName).toBe('Café Granada');
    expect(response.deltas.fiscalConfig.configVersion.revision).toBe(1);
    expect(response.fiscalConfig).toBeDefined();
  });

  it('records fiscal ACK and validates integrity', async () => {
    const ack = await service.recordFiscalAck('tenant-abc', {
      tenantId: 'tenant-abc',
      terminalId: 'term-1',
      revision: 1,
      fingerprint:
        '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      appliedAt: '2026-03-30T12:00:00Z',
    });

    expect(ack.status).toBe('success');
    expect(ack.acknowledgedRevision).toBe(1);
  });

  it('rejects fiscal ACK if tenantId in body does not match auth tenant', async () => {
    await expect(
      service.recordFiscalAck('tenant-abc', {
        tenantId: 'tenant-xyz',
        terminalId: 'term-1',
        revision: 1,
        fingerprint: 'fingerprint',
        appliedAt: '2026-03-30T12:00:00Z',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
