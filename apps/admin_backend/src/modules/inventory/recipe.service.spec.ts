import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { RecipeService } from './recipe.service';
import { RecipeVersion } from './entities/recipe-version.entity';
import { RecipeDetail } from './entities/recipe-detail.entity';
import { Insumo } from './entities/insumo.entity';
import { Product } from './entities/product.entity';
import { UomConversion } from './entities/uom-conversion.entity';
import { BomExplosionService } from './bom-explosion.service';
import { SyncRecipeVersionDocumentDto } from './dto/sync-recipe-version-document.dto';
import { UomConversionCalculator } from './uom-conversion-calculator';

const buildDto = (
  overrides: Partial<SyncRecipeVersionDocumentDto> = {},
): SyncRecipeVersionDocumentDto => ({
  id: '00000000-0000-4000-8000-000000000001',
  productId: '00000000-0000-4000-8000-000000000aaa',
  productName: 'Gallopinto',
  versionNumber: 1,
  yieldQuantity: 10,
  technicalShrinkPct: 0,
  createdAt: '2026-06-26T12:00:00.000Z',
  publishedAt: '2026-06-26T12:00:00.000Z',
  components: [
    {
      ingredientId: '00000000-0000-4000-8000-000000000ins',
      ingredientName: 'Arroz',
      ingredientType: 'INSUMO',
      grossQuantity: 5,
      technicalShrinkPct: 0,
      componentUom: 'kg',
    },
  ],
  ...overrides,
});

describe('RecipeService', () => {
  let service: RecipeService;

  const recipeVersionRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const recipeDetailRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };

  const insumoRepo = {
    findOne: jest.fn(),
  };

  const productRepo = {
    findOne: jest.fn(),
  };

  const uomConversionRepo = {
    findOne: jest.fn(),
  };

  type CreatedRecord = Record<string, unknown>;
  const createdVersions: CreatedRecord[] = [];
  const createdDetails: CreatedRecord[] = [];
  const savedVersions: CreatedRecord[] = [];

  const productLockQueryBuilder = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };

  const manager = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(() => productLockQueryBuilder),
    create: jest.fn((entity: unknown, value: CreatedRecord) => {
      if (entity === RecipeVersion) createdVersions.push(value);
      if (entity === RecipeDetail) createdDetails.push(value);
      return value;
    }),
    save: jest.fn((_entity: unknown, value: unknown) => {
      if (
        !Array.isArray(value) &&
        typeof value === 'object' &&
        value !== null
      ) {
        savedVersions.push(value as CreatedRecord);
      }
      return Promise.resolve(
        Array.isArray(value) ? value : { ...(value as object), id: 'v-new' },
      );
    }),
    delete: jest.fn(),
  };

  const dataSource = {
    transaction: jest.fn(
      <T>(cb: (m: typeof manager) => Promise<T>): Promise<T> => cb(manager),
    ),
  };

  const buildTestingModule = async () => {
    jest.clearAllMocks();
    createdVersions.length = 0;
    createdDetails.length = 0;
    savedVersions.length = 0;
    productLockQueryBuilder.setLock.mockClear();
    productLockQueryBuilder.where.mockClear();
    productLockQueryBuilder.andWhere.mockClear();
    productLockQueryBuilder.getOne.mockResolvedValue({
      id: buildDto().productId,
      tenant_id: 'tenant-A',
    });
    dataSource.transaction.mockImplementation(
      <T>(cb: (m: typeof manager) => Promise<T>): Promise<T> => cb(manager),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecipeService,
        {
          provide: getRepositoryToken(RecipeVersion),
          useValue: recipeVersionRepo,
        },
        {
          provide: getRepositoryToken(RecipeDetail),
          useValue: recipeDetailRepo,
        },
        { provide: getRepositoryToken(Insumo), useValue: insumoRepo },
        { provide: getRepositoryToken(Product), useValue: productRepo },
        {
          provide: getRepositoryToken(UomConversion),
          useValue: uomConversionRepo,
        },
        UomConversionCalculator,
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    return module.get<RecipeService>(RecipeService);
  };

  beforeEach(async () => {
    service = await buildTestingModule();
  });

  it('creates new immutable recipe version and computes net usable quantity', async () => {
    recipeVersionRepo.findOne.mockResolvedValue({
      id: 'v7',
      version_number: 7,
      is_active: true,
    });
    recipeVersionRepo.create.mockImplementation((value: unknown) => value);
    recipeVersionRepo.save
      .mockResolvedValueOnce({ id: 'v7', is_active: false })
      .mockResolvedValueOnce({ id: 'v8', version_number: 8, is_active: true });
    recipeDetailRepo.create.mockImplementation((value: unknown) => value);
    recipeDetailRepo.save.mockResolvedValue([]);

    await service.createNewVersion({
      tenantId: 'tenant-A',
      productId: 'prod-1',
      components: [
        { insumoId: 'ins-1', grossQuantity: 1, technicalShrinkPct: 15 },
      ],
    });

    expect(recipeVersionRepo.save).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ is_active: false }),
    );
    expect(recipeVersionRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ version_number: 8, is_active: true }),
    );
    expect(recipeDetailRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        gross_quantity: 1,
        technical_shrink_pct: 15,
        quantity: 0.85,
      }),
    );
  });

  it('returns deterministic ordered snapshot by insumo id', async () => {
    recipeVersionRepo.findOne.mockResolvedValue({
      id: 'v3',
      product_id: 'prod-1',
    });
    recipeDetailRepo.find.mockResolvedValue([
      { insumo_id: 'ins-9' },
      { insumo_id: 'ins-1' },
    ]);

    await service.getSnapshot('v3', 'tenant-A');

    expect(recipeDetailRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ order: { insumo_id: 'ASC' } }),
    );
  });

  it('rejects snapshot when recipe version belongs to another product', async () => {
    recipeVersionRepo.findOne.mockResolvedValue({
      id: 'v3',
      product_id: 'prod-other',
    });

    await expect(
      service.getSnapshot('v3', 'tenant-A', 'prod-1'),
    ).rejects.toThrow('does not belong to product prod-1');
    expect(recipeDetailRepo.find).not.toHaveBeenCalled();
  });

  describe('ingestPosVersion', () => {
    it('persists a new tenant-scoped version + details with per-sold-unit quantity', async () => {
      productRepo.findOne.mockResolvedValue({ id: buildDto().productId });
      insumoRepo.findOne.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000ins',
        tenant_id: 'tenant-A',
        name: 'Arroz',
        consumptionUom: 'kg',
      });
      manager.findOne.mockResolvedValue(null); // no existing, no prior active

      const result = await service.ingestPosVersion({
        tenantId: 'tenant-A',
        dto: buildDto(),
      });

      expect(result).toEqual({
        recipeVersionId: 'v-new',
        replaced: false,
      });

      expect(createdVersions).toHaveLength(1);
      expect(createdVersions[0]).toMatchObject({
        tenant_id: 'tenant-A',
        pos_document_id: buildDto().id,
        yield_quantity: 10,
        is_active: true,
        product_name: 'Gallopinto',
      });

      expect(createdDetails).toHaveLength(1);
      expect(createdDetails[0]).toMatchObject({
        tenant_id: 'tenant-A',
        insumo_id: '00000000-0000-4000-8000-000000000ins',
        gross_quantity: 5,
        technical_shrink_pct: 0,
        quantity: 0.5, // 5 * (1) / 10
        ingredient_type: 'INSUMO',
        component_uom: 'kg',
      });
      expect(manager.delete).not.toHaveBeenCalled();
    });

    it('deactivates the prior active version when ingesting a fresh document', async () => {
      productRepo.findOne.mockResolvedValue({ id: buildDto().productId });
      insumoRepo.findOne.mockResolvedValue({
        tenant_id: 'tenant-A',
        name: 'Arroz',
        consumptionUom: 'kg',
      });
      manager.findOne.mockResolvedValueOnce(null); // idempotency miss
      manager.findOne.mockResolvedValueOnce({
        id: 'v-old',
        version_number: 1,
        is_active: true,
      }); // prior active

      await service.ingestPosVersion({
        tenantId: 'tenant-A',
        dto: buildDto({ versionNumber: 2 }),
      });

      const savedPrior = savedVersions.find((value) => value.id === 'v-old');
      expect(savedPrior).toMatchObject({ is_active: false });
    });

    it('idempotently replaces details when the same pos_document_id is reposted', async () => {
      productRepo.findOne.mockResolvedValue({ id: buildDto().productId });
      insumoRepo.findOne.mockResolvedValue({
        tenant_id: 'tenant-A',
        name: 'Arroz',
        consumptionUom: 'kg',
      });
      const existing = {
        id: 'v-existing',
        tenant_id: 'tenant-A',
        pos_document_id: buildDto().id,
        product_id: buildDto().productId,
        product_name: 'Old name',
        version_number: 1,
        yield_quantity: 1,
        technical_shrink_pct: 0,
        fecha_inicio_vigencia: new Date('2026-01-01T00:00:00.000Z'),
      };
      manager.findOne.mockResolvedValue(existing);

      const result = await service.ingestPosVersion({
        tenantId: 'tenant-A',
        dto: buildDto({ productName: 'New name' }),
      });

      expect(result).toEqual({ recipeVersionId: 'v-existing', replaced: true });
      expect(existing.product_name).toBe('New name');
      expect(existing.fecha_inicio_vigencia.toISOString()).toBe(
        '2026-06-26T12:00:00.000Z',
      );
      expect(manager.delete).toHaveBeenCalledWith(RecipeDetail, {
        recipe_version_id: 'v-existing',
        tenant_id: 'tenant-A',
      });
      // The new version row itself is never deleted.
      expect(createdVersions).toHaveLength(0);
    });

    it('locks the product row before mutating active recipe versions', async () => {
      productRepo.findOne.mockResolvedValue({ id: buildDto().productId });
      insumoRepo.findOne.mockResolvedValue({
        tenant_id: 'tenant-A',
        name: 'Arroz',
        consumptionUom: 'kg',
      });
      manager.findOne.mockResolvedValue(null);

      await service.ingestPosVersion({
        tenantId: 'tenant-A',
        dto: buildDto(),
      });

      expect(manager.createQueryBuilder).toHaveBeenCalledWith(
        Product,
        'product',
      );
      expect(productLockQueryBuilder.setLock).toHaveBeenCalledWith(
        'pessimistic_write',
      );
    });

    it('retries deterministically when a duplicate pos_document_id insert wins a race', async () => {
      const existing = {
        id: 'v-existing',
        tenant_id: 'tenant-A',
        pos_document_id: buildDto().id,
        product_id: buildDto().productId,
        product_name: 'Gallopinto',
        version_number: 1,
        yield_quantity: 10,
        technical_shrink_pct: 0,
        fecha_inicio_vigencia: new Date('2026-06-26T12:00:00.000Z'),
      };
      const driverError = Object.assign(
        new Error('duplicate key value violates unique constraint'),
        { code: '23505' },
      );

      productRepo.findOne.mockResolvedValue({ id: buildDto().productId });
      insumoRepo.findOne.mockResolvedValue({
        tenant_id: 'tenant-A',
        name: 'Arroz',
        consumptionUom: 'kg',
      });
      recipeVersionRepo.findOne.mockResolvedValue(existing);
      manager.findOne.mockResolvedValue(existing);
      dataSource.transaction
        .mockRejectedValueOnce(
          new QueryFailedError(
            'INSERT INTO recipe_versions ...',
            [],
            driverError,
          ),
        )
        .mockImplementationOnce(
          <T>(cb: (m: typeof manager) => Promise<T>): Promise<T> => cb(manager),
        );

      const result = await service.ingestPosVersion({
        tenantId: 'tenant-A',
        dto: buildDto(),
      });

      expect(result).toEqual({ recipeVersionId: 'v-existing', replaced: true });
      expect(dataSource.transaction).toHaveBeenCalledTimes(2);
      expect(manager.delete).toHaveBeenCalledWith(RecipeDetail, {
        recipe_version_id: 'v-existing',
        tenant_id: 'tenant-A',
      });
    });

    it('rejects invalid yield / gross / shrink values', async () => {
      productRepo.findOne.mockResolvedValue({ id: buildDto().productId });
      await expect(
        service.ingestPosVersion({
          tenantId: 'tenant-A',
          dto: buildDto({ yieldQuantity: 0 }),
        }),
      ).rejects.toThrow();

      await expect(
        service.ingestPosVersion({
          tenantId: 'tenant-A',
          dto: buildDto({
            technicalShrinkPct: 100,
            components: [
              {
                ingredientId: '00000000-0000-4000-8000-000000000ins',
                ingredientName: 'Arroz',
                ingredientType: 'INSUMO',
                grossQuantity: 5,
                technicalShrinkPct: 100,
                componentUom: 'kg',
              },
            ],
          }),
        }),
      ).rejects.toThrow(BadRequestException);

      insumoRepo.findOne.mockResolvedValue({
        tenant_id: 'tenant-A',
        consumptionUom: 'kg',
      });
      await expect(
        service.ingestPosVersion({
          tenantId: 'tenant-A',
          dto: buildDto({
            components: [
              {
                ingredientId: '00000000-0000-4000-8000-000000000ins',
                ingredientName: 'Arroz',
                ingredientType: 'INSUMO',
                grossQuantity: 0,
                technicalShrinkPct: 0,
                componentUom: 'kg',
              },
            ],
          }),
        }),
      ).rejects.toThrow('grossQuantity');
    });

    it('stores per-sold-unit quantity that BomExplosionService consumes correctly', async () => {
      productRepo.findOne.mockResolvedValue({ id: buildDto().productId });
      insumoRepo.findOne.mockResolvedValue({
        tenant_id: 'tenant-A',
        consumptionUom: 'kg',
      });
      manager.findOne.mockResolvedValue(null);

      await service.ingestPosVersion({
        tenantId: 'tenant-A',
        // yield=10, gross=5 -> per-sold-unit quantity 0.5
        dto: buildDto(),
      });

      const detail = createdDetails[0] as unknown as RecipeDetail;
      const explosion = new BomExplosionService().explode({
        orderQuantity: 2,
        snapshotComponents: [detail],
      });
      // 0.5 * 2 = 1
      expect(explosion.get('00000000-0000-4000-8000-000000000ins')).toBe(1);
    });

    it('rejects SUB_RECIPE components (multi-level BOM ingestion deferred)', async () => {
      productRepo.findOne.mockResolvedValue({ id: buildDto().productId });
      await expect(
        service.ingestPosVersion({
          tenantId: 'tenant-A',
          dto: buildDto({
            components: [
              {
                ingredientId: '00000000-0000-4000-8000-000000000sub',
                ingredientName: 'Salsa sub-receta',
                ingredientType: 'SUB_RECIPE',
                grossQuantity: 1,
                technicalShrinkPct: 0,
                componentUom: 'l',
              },
            ],
          }),
        }),
      ).rejects.toThrow('SUB_RECIPE');
    });

    it('rejects when the insumo is not found for the tenant', async () => {
      productRepo.findOne.mockResolvedValue({ id: buildDto().productId });
      insumoRepo.findOne.mockResolvedValue(null);

      await expect(
        service.ingestPosVersion({
          tenantId: 'tenant-A',
          dto: buildDto(),
        }),
      ).rejects.toThrow('not found for tenant');
    });

    it('rejects when the product is not found for the tenant', async () => {
      productRepo.findOne.mockResolvedValue(null);

      await expect(
        service.ingestPosVersion({
          tenantId: 'tenant-A',
          dto: buildDto(),
        }),
      ).rejects.toThrow('Product');
      expect(insumoRepo.findOne).not.toHaveBeenCalled();
    });

    it('rejects an incompatible componentUom (no positive conversion)', async () => {
      productRepo.findOne.mockResolvedValue({ id: buildDto().productId });
      insumoRepo.findOne.mockResolvedValue({
        tenant_id: 'tenant-A',
        name: 'Arroz',
        consumptionUom: 'kg',
      });
      uomConversionRepo.findOne.mockResolvedValue(null);

      await expect(
        service.ingestPosVersion({
          tenantId: 'tenant-A',
          dto: buildDto({
            components: [
              {
                ingredientId: '00000000-0000-4000-8000-000000000ins',
                ingredientName: 'Arroz',
                ingredientType: 'INSUMO',
                grossQuantity: 5,
                technicalShrinkPct: 0,
                componentUom: 'lb',
              },
            ],
          }),
        }),
      ).rejects.toThrow('not compatible');
    });

    it('rejects a missing componentUom to avoid silent unit corruption', async () => {
      productRepo.findOne.mockResolvedValue({ id: buildDto().productId });
      insumoRepo.findOne.mockResolvedValue({
        tenant_id: 'tenant-A',
        name: 'Arroz',
        consumptionUom: 'kg',
      });

      await expect(
        service.ingestPosVersion({
          tenantId: 'tenant-A',
          dto: buildDto({
            components: [
              {
                ingredientId: '00000000-0000-4000-8000-000000000ins',
                ingredientName: 'Arroz',
                ingredientType: 'INSUMO',
                grossQuantity: 5,
                technicalShrinkPct: 0,
                componentUom: null,
              },
            ],
          }),
        }),
      ).rejects.toThrow('componentUom is required');
    });

    it('accepts a compatible componentUom when a positive conversion exists', async () => {
      productRepo.findOne.mockResolvedValue({ id: buildDto().productId });
      insumoRepo.findOne.mockResolvedValue({
        tenant_id: 'tenant-A',
        name: 'Arroz',
        consumptionUom: 'kg',
      });
      uomConversionRepo.findOne.mockResolvedValue({ factor: 0.453592 });
      manager.findOne.mockResolvedValue(null);

      const result = await service.ingestPosVersion({
        tenantId: 'tenant-A',
        dto: buildDto({
          components: [
            {
              ingredientId: '00000000-0000-4000-8000-000000000ins',
              ingredientName: 'Arroz',
              ingredientType: 'INSUMO',
              grossQuantity: 5,
              technicalShrinkPct: 0,
              componentUom: 'lb',
            },
          ],
        }),
      });

      expect(result.replaced).toBe(false);
      const detail = createdDetails[0] as unknown as RecipeDetail;
      expect(detail.component_uom).toBe('lb');
      expect(detail.quantity).toBe(0.2268);
    });
  });
});
