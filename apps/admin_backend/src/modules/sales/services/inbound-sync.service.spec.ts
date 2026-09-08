import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException } from '@nestjs/common';
import { InboundSyncService } from './inbound-sync.service';
import { Product } from '../../inventory/entities/product.entity';
import { CatalogValue } from '../../catalog/entities/catalog-value.entity';
import { Insumo } from '../../inventory/entities/insumo.entity';
import { Recipe } from '../../inventory/entities/recipe.entity';
import { RecipeVersion } from '../../inventory/entities/recipe-version.entity';
import { User, UserRole } from '../../identity/entities/user.entity';
import { CatalogType } from '../../catalog/catalog-type';

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
  let userQb: MockQueryBuilder<User>;

  let mockProductRepo: { createQueryBuilder: jest.Mock };
  let mockCatalogRepo: { createQueryBuilder: jest.Mock };
  let mockInsumoRepo: { createQueryBuilder: jest.Mock };
  let mockRecipeRepo: { createQueryBuilder: jest.Mock };
  let mockRecipeVersionRepo: { createQueryBuilder: jest.Mock };
  let mockUserRepo: { createQueryBuilder: jest.Mock };

  beforeEach(async () => {
    productQb = createMockQueryBuilder<Product>([]);
    catalogQb = createMockQueryBuilder<CatalogValue>([]);
    insumoQb = createMockQueryBuilder<Insumo>([]);
    recipeQb = createMockQueryBuilder<Recipe>([]);
    recipeVersionQb = createMockQueryBuilder<RecipeVersion>([]);
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
    mockUserRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(userQb),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InboundSyncService,
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
      taxRate: 0.15,
      isTaxExempt: false,
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

  it('preserves taxRate and isTaxExempt through inbound sync (POS → backend → POS round-trip)', async () => {
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

    // Taxable product: taxRate=0.15, isTaxExempt=false
    const taxable = response.deltas.products.find((p) => p.id === 'prod-taxable');
    expect(taxable).toBeDefined();
    expect(taxable!.taxRate).toBe(0.15);
    expect(taxable!.isTaxExempt).toBe(false);

    // Exempt product: taxRate=0.0, isTaxExempt=true
    const exempt = response.deltas.products.find((p) => p.id === 'prod-exempt');
    expect(exempt).toBeDefined();
    expect(exempt!.taxRate).toBe(0.0);
    expect(exempt!.isTaxExempt).toBe(true);
  });

  it('filters deltas by ISO timestamp since string', async () => {
    const sinceIso = '2026-08-20T00:00:00.000Z';
    await service.getInboundDeltas('tenant-abc', { since: sinceIso });

    expect(productQb.andWhere).toHaveBeenCalledWith(
      'product.updated_at > :sinceDate',
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
      'rv.created_at > :sinceDate',
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
      'product.updated_at > :sinceDate',
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
});
