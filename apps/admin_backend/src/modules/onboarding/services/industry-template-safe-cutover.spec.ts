import { DataSource, EntityManager, Repository } from 'typeorm';
import { IndustryTemplateService } from './industry-template.service';
import { IndustryTemplate } from '../entities/industry-template.entity';
import { TemplateInsumo } from '../entities/template-insumo.entity';
import { TemplateProduct } from '../entities/template-product.entity';
import { TemplateRecipeItem } from '../entities/template-recipe-item.entity';
import { TemplateSeedLink, TemplateSourceItemType, TemplateTargetEntityType } from '../entities/template-seed-link.entity';
import { TemplateApplication, TemplateApplicationStatus } from '../entities/template-application.entity';
import { Insumo, NEGATIVE_STOCK_POLICY } from '../../inventory/entities/insumo.entity';
import { Product } from '../../inventory/entities/product.entity';
import { RecipeVersion, RecipeOrigin, RecipePublicationState, RecipeSuggestionState } from '../../inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../../inventory/entities/recipe-detail.entity';
import { Recipe } from '../../inventory/entities/recipe.entity';
import { UomConversion } from '../../inventory/entities/uom-conversion.entity';
import { TemplatePreviewService } from './template-preview.service';
import { OnboardingIdempotencyCoordinator } from './onboarding-idempotency.coordinator';

describe('IndustryTemplateService Safe Cutover (TDD / ONB1.3D-F)', () => {
  let service: IndustryTemplateService;
  let templateRepo: jest.Mocked<Partial<Repository<IndustryTemplate>>>;
  let seedLinkRepo: jest.Mocked<Partial<Repository<TemplateSeedLink>>>;
  let applicationRepo: jest.Mocked<Partial<Repository<TemplateApplication>>>;
  let insumoRepo: jest.Mocked<Partial<Repository<Insumo>>>;
  let productRepo: jest.Mocked<Partial<Repository<Product>>>;
  let recipeVersionRepo: jest.Mocked<Partial<Repository<RecipeVersion>>>;
  let recipeDetailRepo: jest.Mocked<Partial<Repository<RecipeDetail>>>;
  let recipeRepo: jest.Mocked<Partial<Repository<Recipe>>>;
  let uomConversionRepo: jest.Mocked<Partial<Repository<UomConversion>>>;
  let previewService: jest.Mocked<Partial<TemplatePreviewService>>;
  let idempotencyCoordinator: jest.Mocked<Partial<OnboardingIdempotencyCoordinator>>;
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
        template: null as any,
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
            templateProduct: null as any,
            template_insumo_name: 'Granos de Café Especial',
            gross_quantity: 18,
            technical_shrink_pct: 0,
            component_uom: 'G',
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
        template: null as any,
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
    seedLinkRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((e: any) => e) as any,
      save: jest.fn((e: any) => Promise.resolve(e)) as any,
    };
    applicationRepo = {
      create: jest.fn((e: any) => e) as any,
      save: jest.fn((e: any) => Promise.resolve(e)) as any,
    };
    insumoRepo = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((e: any) => e) as any,
      save: jest.fn((e: any) => Promise.resolve({ ...e, id: 'saved-insumo-1' })) as any,
    };
    productRepo = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((e: any) => e) as any,
      save: jest.fn((e: any) => Promise.resolve({ ...e, id: 'saved-product-1' })) as any,
    };
    recipeVersionRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((e: any) => e) as any,
      save: jest.fn((e: any) => Promise.resolve({ ...e, id: 'saved-rv-1' })) as any,
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

    previewService = {
      computeFingerprint: jest.fn((obj: any) => 'fp-' + JSON.stringify(obj).length),
      buildPreview: jest.fn().mockResolvedValue({
        templateCode: 'CAFETERIA',
        templateVersion: 1,
        items: [],
      } as any),
    };

    idempotencyCoordinator = {
      acquireLease: jest.fn().mockResolvedValue({ status: 'ACQUIRED', record: {} as any }),
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
      seedLinkRepo as any,
      applicationRepo as any,
      previewService as any,
      idempotencyCoordinator as any,
      dataSource as any,
    );
  });

  it('creates recipe versions as DRAFT, SUGGESTED, and is_active=false without creating legacy Recipe records', async () => {
    const result = await service.applyTemplate('tenant-1', 'CAFETERIA', {
      idempotencyKey: 'idemp-1',
    });

    expect(result.recipesCreated).toBe(1);
    expect(result.insumosCreated).toBe(1);
    expect(result.productsCreated).toBe(1);

    // Verify RecipeVersion was created with safe lifecycle fields
    const saveCalls = (mockManager.save as jest.Mock).mock.calls;
    const rvSaves = saveCalls.filter((c) => c[0] === RecipeVersion);
    expect(rvSaves.length).toBe(1);

    const savedRv = rvSaves[0][1];
    expect(savedRv.origin).toBe(RecipeOrigin.INDUSTRY_TEMPLATE);
    expect(savedRv.publication_state).toBe(RecipePublicationState.DRAFT);
    expect(savedRv.suggestion_state).toBe(RecipeSuggestionState.SUGGESTED);
    expect(savedRv.is_active).toBe(false);

    // Verify legacy Recipe was NOT saved
    const legacyRecipeSaves = saveCalls.filter((c) => c[0] === Recipe);
    expect(legacyRecipeSaves.length).toBe(0);
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

  it('creates TemplateSeedLink for every created entity and TemplateApplication for the execution', async () => {
    await service.applyTemplate('tenant-1', 'CAFETERIA', {
      idempotencyKey: 'idemp-3',
    });

    const saveCalls = (mockManager.save as jest.Mock).mock.calls;
    const seedLinkSaves = saveCalls.filter((c) => c[0] === TemplateSeedLink);
    const applicationSaves = saveCalls.filter((c) => c[0] === TemplateApplication);

    // 1 insumo + 1 product + 1 recipe_version = 3 seed links
    expect(seedLinkSaves.length).toBe(3);
    expect(seedLinkSaves[0][1].tenant_id).toBe('tenant-1');
    expect(seedLinkSaves[0][1].template_code).toBe('CAFETERIA');
    expect(seedLinkSaves[0][1].last_source_fingerprint).toBeDefined();

    expect(applicationSaves.length).toBe(1);
    expect(applicationSaves[0][1].status).toBe(TemplateApplicationStatus.APPLIED);
    expect(applicationSaves[0][1].idempotency_key).toBe('idemp-3');
  });

  it('respects partial selection (only creates selected items)', async () => {
    const result = await service.applyTemplate('tenant-1', 'CAFETERIA', {
      idempotencyKey: 'idemp-4',
      selectedItemIds: ['ti-1'], // Only insumo selected, product not selected
    });

    expect(result.insumosCreated).toBe(1);
    expect(result.productsCreated).toBe(0);
    expect(result.recipesCreated).toBe(0);

    const saveCalls = (mockManager.save as jest.Mock).mock.calls;
    const productSaves = saveCalls.filter((c) => c[0] === Product);
    expect(productSaves.length).toBe(0);
  });

  it('is idempotent on reapply: skips already linked items and does not duplicate', async () => {
    const existingSeedLink: Partial<TemplateSeedLink> = {
      id: 'existing-link-ti1',
      tenant_id: 'tenant-1',
      template_code: 'CAFETERIA',
      source_item_id: 'ti-1',
      target_entity_type: TemplateTargetEntityType.INSUMO,
      target_entity_id: 'existing-ins-uuid',
      first_applied_version: 1,
      last_seen_version: 1,
      last_applied_version: 1,
      last_source_fingerprint: 'fp-1',
    };

    mockManager.find = jest.fn().mockImplementation((entityClass: any) => {
      if (entityClass === TemplateSeedLink) return Promise.resolve([existingSeedLink]);
      return Promise.resolve([]);
    });

    const result = await service.applyTemplate('tenant-1', 'CAFETERIA', {
      idempotencyKey: 'idemp-5',
    });

    expect(result.insumosSkipped).toBe(1);
    expect(result.insumosCreated).toBe(0);
  });
});
