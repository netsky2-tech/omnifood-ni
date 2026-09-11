import { DataSource, EntityManager, Repository } from 'typeorm';
import { IndustryTemplateService } from './industry-template.service';
import { IndustryTemplate } from '../entities/industry-template.entity';
import { TemplateApplication } from '../entities/template-application.entity';
import { TemplateSeedLink } from '../entities/template-seed-link.entity';
import {
  Insumo,
  NEGATIVE_STOCK_POLICY,
} from '../../inventory/entities/insumo.entity';
import { Product } from '../../inventory/entities/product.entity';
import { RecipeVersion } from '../../inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../../inventory/entities/recipe-detail.entity';
import { Recipe } from '../../inventory/entities/recipe.entity';
import { UomConversion } from '../../inventory/entities/uom-conversion.entity';

describe('IndustryTemplateService Safe Cutover (TDD / ONB1.3D-F)', () => {
  let service: IndustryTemplateService;
  let templateRepo: jest.Mocked<Partial<Repository<IndustryTemplate>>>;
  let insumoRepo: jest.Mocked<Partial<Repository<Insumo>>>;
  let productRepo: jest.Mocked<Partial<Repository<Product>>>;
  let recipeVersionRepo: jest.Mocked<Partial<Repository<RecipeVersion>>>;
  let recipeDetailRepo: jest.Mocked<Partial<Repository<RecipeDetail>>>;
  let recipeRepo: jest.Mocked<Partial<Repository<Recipe>>>;
  let uomConversionRepo: jest.Mocked<Partial<Repository<UomConversion>>>;
  let dataSource: jest.Mocked<Partial<DataSource>>;
  let mockManager: jest.Mocked<Partial<EntityManager>>;

  const sampleTemplate: IndustryTemplate = {
    id: 'CAFETERIA',
    code: 'CAFETERIA',
    name: 'Cafetería & Coffee Shop',
    description: 'Plantilla especializada',
    icon: 'coffee',
    is_active: true,
    version: 1,
    source_fingerprint: 'fp-cafeteria-v1',
    templateInsumos: [
      {
        id: 'ti-1',
        template_id: 'CAFETERIA',
        name: 'Granos de Café Especial',
        purchase_uom: 'KG',
        consumption_uom: 'G',
        conversion_factor: 1000,
        par_level: 10000,
        min_stock: 2000,
        is_perishable: false,
        negative_stock_policy: NEGATIVE_STOCK_POLICY.RESTRICT,
        created_at: new Date(),
        updated_at: new Date(),
        template: null,
      },
    ],
    templateProducts: [
      {
        id: 'tp-1',
        template_id: 'CAFETERIA',
        name: 'Capuchino 8oz',
        category: 'Bebidas Calientes',
        uom: 'UN',
        suggested_price: 95.0,
        is_perishable: false,
        created_at: new Date(),
        updated_at: new Date(),
        recipeItems: [
          {
            id: 'tri-1',
            template_product_id: 'tp-1',
            templateProduct: null,
            template_insumo_name: 'Granos de Café Especial',
            gross_quantity: 18,
            technical_shrink_pct: 0,
            component_uom: 'G',
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
        template: null,
      },
    ],
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    templateRepo = {
      findOne: jest.fn().mockResolvedValue(sampleTemplate),
      find: jest.fn().mockResolvedValue([sampleTemplate]),
    };
    insumoRepo = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((e: any) => e) as any,
      save: jest.fn((e: any) =>
        Promise.resolve({ ...e, id: 'saved-insumo-1' }),
      ) as any,
    };
    productRepo = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((e: any) => e) as any,
      save: jest.fn((e: any) =>
        Promise.resolve({ ...e, id: 'saved-product-1' }),
      ) as any,
    };
    recipeVersionRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((e: any) => e) as any,
      save: jest.fn((e: any) =>
        Promise.resolve({ ...e, id: 'saved-rv-1' }),
      ) as any,
    };
    recipeDetailRepo = {
      create: jest.fn((e: any) => e) as any,
      save: jest.fn((e: any) => Promise.resolve(e)) as any,
    };
    recipeRepo = {
      create: jest.fn((e: any) => e) as any,
      save: jest.fn((e: any) => Promise.resolve(e)) as any,
    };
    uomConversionRepo = {
      create: jest.fn((e: any) => e) as any,
      save: jest.fn((e: any) => Promise.resolve(e)) as any,
    };

    const savedEntities: any[] = [];
    mockManager = {
      find: jest.fn().mockImplementation((entityClass: any) => {
        if (entityClass === TemplateSeedLink) return Promise.resolve([]);
        if (entityClass === Insumo) return Promise.resolve([]);
        if (entityClass === Product) return Promise.resolve([]);
        if (entityClass === RecipeVersion) return Promise.resolve([]);
        return Promise.resolve([]);
      }),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((entityClass: any, plain: any) => ({ ...plain })),
      save: jest.fn((entityClass: any, item: any) => {
        const withId = {
          ...item,
          id: item.id || `gen-${Math.random().toString(36).substring(2, 8)}`,
        };
        savedEntities.push({ entityClass, entity: withId });
        return Promise.resolve(withId);
      }),
    };

    dataSource = {
      transaction: jest.fn((cb: any) => cb(mockManager)) as any,
    };

    service = new IndustryTemplateService(
      templateRepo as any,
      {} as any,
      {} as any,
      {} as any,
      insumoRepo as any,
      productRepo as any,
      recipeVersionRepo as any,
      recipeDetailRepo as any,
      recipeRepo as any,
      uomConversionRepo as any,
      dataSource as any,
    );
  });

  it('creates persisted provenance and an inactive template recipe draft', async () => {
    const result = await service.applyTemplate('tenant-1', 'CAFETERIA', {
      idempotencyKey: 'idemp-1',
    });

    expect(result.recipesCreated).toBe(1);
    expect(result.insumosCreated).toBe(1);
    expect(result.productsCreated).toBe(1);

    const saveCalls = (mockManager.save as jest.Mock).mock.calls;
    const rvSaves = saveCalls.filter((c) => c[0] === RecipeVersion);
    expect(rvSaves).toHaveLength(1);
    expect(rvSaves[0][1]).toMatchObject({
      is_active: false,
      origin: 'INDUSTRY_TEMPLATE',
      publication_state: 'DRAFT',
      suggestion_state: 'SUGGESTED',
    });
    expect(saveCalls.filter((c) => c[0] === TemplateApplication)).toHaveLength(
      2,
    );
    expect(saveCalls.filter((c) => c[0] === TemplateSeedLink)).toHaveLength(3);
  });

  it('ensures Insumos and Products have stock=0 and averageCost=0 (no fictitious stock/cost)', async () => {
    await service.applyTemplate('tenant-1', 'CAFETERIA', {
      idempotencyKey: 'idemp-2',
    });

    const saveCalls = (mockManager.save as jest.Mock).mock.calls;
    const insumoSaves = saveCalls.filter((c) => c[0] === Insumo);
    const productSaves = saveCalls.filter((c) => c[0] === Product);

    expect(insumoSaves.length).toBe(1);
    expect(insumoSaves[0][1].stock).toBe(0);
    expect(insumoSaves[0][1].averageCost).toBe(0);

    expect(productSaves.length).toBe(1);
    expect(productSaves[0][1].stock).toBe(0);
    expect(productSaves[0][1].averageCost).toBe(0);
  });

  it('persists a recipe detail linked to the created recipe version', async () => {
    await service.applyTemplate('tenant-1', 'CAFETERIA');

    const saveCalls = (mockManager.save as jest.Mock).mock.calls;
    const recipeDetailSaves = saveCalls.filter((c) => c[0] === RecipeDetail);

    expect(recipeDetailSaves).toHaveLength(1);
    expect(recipeDetailSaves[0][1]).toMatchObject({
      tenant_id: 'tenant-1',
      insumo_id: expect.any(String),
      quantity: 18,
      ingredient_type: 'INSUMO',
    });
  });

  it('honors selectedItemIds by excluding unselected products and recipes', async () => {
    const result = await service.applyTemplate('tenant-1', 'CAFETERIA', {
      idempotencyKey: 'idemp-4',
      selectedItemIds: ['ti-1'],
    });

    expect(result.insumosCreated).toBe(1);
    expect(result.productsCreated).toBe(0);
    expect(result.recipesCreated).toBe(0);
  });

  it('skips existing items matched by name', async () => {
    mockManager.find = jest.fn().mockImplementation((entityClass: any) => {
      if (entityClass === Insumo)
        return Promise.resolve([
          { id: 'existing-insumo', name: 'Granos de Café Especial' },
        ]);
      if (entityClass === Product)
        return Promise.resolve([
          { id: 'existing-product', name: 'Capuchino 8oz' },
        ]);
      if (entityClass === RecipeVersion)
        return Promise.resolve([{ id: 'existing-version' }]);
      return Promise.resolve([]);
    });

    mockManager.findOne = jest.fn().mockImplementation((entityClass: any) => {
      if (entityClass === RecipeVersion) {
        return Promise.resolve({ id: 'existing-version' });
      }
      return Promise.resolve(null);
    });

    const result = await service.applyTemplate('tenant-1', 'CAFETERIA');

    expect(result.insumosSkipped).toBe(1);
    expect(result.productsSkipped).toBe(1);
    expect(result.recipesCreated).toBe(0);
  });
});
