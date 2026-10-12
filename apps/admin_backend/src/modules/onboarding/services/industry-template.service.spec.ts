import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { IndustryTemplateService } from './industry-template.service';
import {
  TENANT_CONTEXT_SET_CONFIG_SQL,
  TenantContextRequiredError,
} from '../../../core/database/tenant-transaction';
import { IndustryTemplate } from '../entities/industry-template.entity';
import { TemplateInsumo } from '../entities/template-insumo.entity';
import { TemplateProduct } from '../entities/template-product.entity';
import { TemplateRecipeItem } from '../entities/template-recipe-item.entity';
import {
  Insumo,
  NEGATIVE_STOCK_POLICY,
} from '../../inventory/entities/insumo.entity';
import { Product, ProductType } from '../../inventory/entities/product.entity';
import { RecipeVersion } from '../../inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../../inventory/entities/recipe-detail.entity';
import { Recipe } from '../../inventory/entities/recipe.entity';
import { UomConversion } from '../../inventory/entities/uom-conversion.entity';
import {
  RecipeOrigin,
  RecipePublicationState,
  RecipeSuggestionState,
} from '../../inventory/entities/recipe-version.entity';
import { TemplateApplication } from '../entities/template-application.entity';
import { ApplyTemplateResult } from '../dto/apply-template.dto';

describe('IndustryTemplateService (Unit & Triangulation)', () => {
  let service: IndustryTemplateService;
  let templateRepo: jest.Mocked<Repository<IndustryTemplate>>;
  let templateInsumoRepo: jest.Mocked<Repository<TemplateInsumo>>;
  let templateProductRepo: jest.Mocked<Repository<TemplateProduct>>;
  let templateRecipeItemRepo: jest.Mocked<Repository<TemplateRecipeItem>>;
  let insumoRepo: jest.Mocked<Repository<Insumo>>;
  let productRepo: jest.Mocked<Repository<Product>>;
  let recipeVersionRepo: jest.Mocked<Repository<RecipeVersion>>;
  let recipeDetailRepo: jest.Mocked<Repository<RecipeDetail>>;
  let recipeRepo: jest.Mocked<Repository<Recipe>>;
  let uomConversionRepo: jest.Mocked<Repository<UomConversion>>;
  let dataSource: jest.Mocked<DataSource>;
  let mockManager: jest.Mocked<EntityManager>;

  const mockTemplates: IndustryTemplate[] = [
    {
      id: 'CAFETERIA',
      code: 'CAFETERIA',
      name: 'Cafetería & Coffee Shop',
      description:
        'Plantilla especializada en café de especialidad, bebidas frías y calientes.',
      icon: 'coffee',
      is_active: true,
      version: 1,
      source_fingerprint: 'fp-cafeteria',
      created_at: new Date('2026-01-01'),
      updated_at: new Date('2026-01-01'),
      templateInsumos: [
        {
          id: 'ti-1',
          template_id: 'CAFETERIA',
          template: null,
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
        },
        {
          id: 'ti-2',
          template_id: 'CAFETERIA',
          template: null,
          name: 'Leche Entera',
          purchase_uom: 'L',
          consumption_uom: 'ML',
          conversion_factor: 1000,
          par_level: 20000,
          min_stock: 5000,
          is_perishable: true,
          negative_stock_policy: NEGATIVE_STOCK_POLICY.RESTRICT,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
      templateProducts: [
        {
          id: 'tp-1',
          template_id: 'CAFETERIA',
          template: null,
          name: 'Capuchino 8oz',
          category: 'Bebidas Calientes',
          uom: 'UN',
          suggested_price: 95.0,
          is_perishable: false,
          product_type: ProductType.COMPOUND,
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
            {
              id: 'tri-2',
              template_product_id: 'tp-1',
              templateProduct: null,
              template_insumo_name: 'Leche Entera',
              gross_quantity: 150,
              technical_shrink_pct: 0,
              component_uom: 'ML',
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        },
      ],
    },
    {
      id: 'BAR_RESTAURANTE',
      code: 'BAR_RESTAURANTE',
      name: 'Bar & Restaurante',
      description:
        'Plantilla para gastronomía, hamburguesas, cortes y coctelería.',
      icon: 'utensils',
      is_active: true,
      version: 1,
      source_fingerprint: 'fp-bar',
      created_at: new Date('2026-01-01'),
      updated_at: new Date('2026-01-01'),
      templateInsumos: [],
      templateProducts: [],
    },
    {
      id: 'RETAIL_MINIMARKET',
      code: 'RETAIL_MINIMARKET',
      name: 'Retail & Minimarket',
      description:
        'Plantilla para abarrotes, bebidas embotelladas y snacks sin receta.',
      icon: 'shopping-cart',
      is_active: true,
      version: 1,
      source_fingerprint: 'fp-retail',
      created_at: new Date('2026-01-01'),
      updated_at: new Date('2026-01-01'),
      templateInsumos: [],
      templateProducts: [],
    },
  ];

  beforeEach(() => {
    templateRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<IndustryTemplate>>;

    templateInsumoRepo = {
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<TemplateInsumo>>;

    templateProductRepo = {
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<TemplateProduct>>;

    templateRecipeItemRepo = {
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<TemplateRecipeItem>>;

    insumoRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<Insumo>>;

    productRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<Product>>;

    recipeVersionRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<RecipeVersion>>;

    recipeDetailRepo = {
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<RecipeDetail>>;

    recipeRepo = {
      create: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<Recipe>>;

    uomConversionRepo = {
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<UomConversion>>;

    mockManager = {
      find: jest.fn(),
      findOne: jest.fn(),
      query: jest.fn().mockResolvedValue(undefined),
      create: jest.fn(
        (_entityClass: unknown, plain: unknown) => plain as object,
      ),
      save: jest.fn((_entityClass: unknown, entities: unknown) => {
        console.log(
          'SAVE CALLED WITH:',
          (_entityClass as any)?.name || _entityClass,
          entities,
        );
        if (_entityClass === TemplateApplication) {
          return Promise.resolve({ ...(entities as any), id: 'app-uuid-1' });
        }
        return Promise.resolve(entities);
      }),
    } as unknown as jest.Mocked<EntityManager>;

    dataSource = {
      transaction: jest.fn((cb: (mgr: EntityManager) => Promise<unknown>) =>
        cb(mockManager),
      ),
    } as unknown as jest.Mocked<DataSource>;

    service = new IndustryTemplateService(
      templateRepo,
      templateInsumoRepo,
      templateProductRepo,
      templateRecipeItemRepo,
      insumoRepo,
      productRepo,
      recipeVersionRepo,
      recipeDetailRepo,
      recipeRepo,
      uomConversionRepo,
      dataSource,
    );
  });

  describe('listTemplates', () => {
    it('returns all active templates with metadata and item counts', async () => {
      templateRepo.find.mockResolvedValueOnce(mockTemplates);

      const result = await service.listTemplates();

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        id: 'CAFETERIA',
        code: 'CAFETERIA',
        name: 'Cafetería & Coffee Shop',
        description: mockTemplates[0].description,
        icon: 'coffee',
        insumoCount: 2,
        productCount: 1,
      });
      expect(templateRepo.find).toHaveBeenCalledWith({
        where: { is_active: true },
        relations: ['templateInsumos', 'templateProducts'],
        order: { name: 'ASC' },
      });
    });
  });

  describe('getTemplateByCode', () => {
    it('returns full template structure when found by code', async () => {
      templateRepo.findOne.mockResolvedValueOnce(mockTemplates[0]);

      const result = await service.getTemplateByCode('CAFETERIA');

      expect(result.code).toBe('CAFETERIA');
      expect(result.templateInsumos).toHaveLength(2);
      expect(result.templateProducts).toHaveLength(1);
      expect(templateRepo.findOne).toHaveBeenCalledWith({
        where: [{ code: 'CAFETERIA' }, { id: 'CAFETERIA' }],
        relations: [
          'templateInsumos',
          'templateProducts',
          'templateProducts.recipeItems',
        ],
      });
    });

    it('throws NotFoundException when template does not exist', async () => {
      templateRepo.findOne.mockResolvedValueOnce(null);

      await expect(service.getTemplateByCode('UNKNOWN_CODE')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when code is empty', async () => {
      await expect(service.getTemplateByCode('   ')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('applyTemplate (Triangulation & Idempotency)', () => {
    const tenantId = 'tenant-123';

    it('binds the tenant context on the transaction manager before the first protected access', async () => {
      templateRepo.findOne.mockResolvedValueOnce(mockTemplates[0]);
      mockManager.find.mockResolvedValue([]);

      await service.applyTemplate(tenantId, 'CAFETERIA');

      expect(mockManager.query).toHaveBeenCalledWith(
        TENANT_CONTEXT_SET_CONFIG_SQL,
        [tenantId],
      );
      const queryOrder =
        (mockManager.query as jest.Mock).mock.invocationCallOrder[0];
      const firstProtected = Math.min(
        ...(mockManager.findOne as jest.Mock).mock.invocationCallOrder,
        ...(mockManager.find as jest.Mock).mock.invocationCallOrder,
        ...(mockManager.save as jest.Mock).mock.invocationCallOrder,
      );
      expect(queryOrder).toBeLessThan(firstProtected);
    });

    it('runs every protected access through manager-scoped repositories, never the pooled ones', async () => {
      templateRepo.findOne.mockResolvedValueOnce(mockTemplates[0]);
      mockManager.find.mockResolvedValue([]);

      await service.applyTemplate(tenantId, 'CAFETERIA');

      // The pooled tenant-bearing repositories are untouched by apply.
      expect(insumoRepo.find).not.toHaveBeenCalled();
      expect(insumoRepo.save).not.toHaveBeenCalled();
      expect(productRepo.find).not.toHaveBeenCalled();
      expect(productRepo.save).not.toHaveBeenCalled();
    });

    it('fails fast with TenantContextRequiredError on a blank tenant and issues no set_config SQL (Unit 0b-3)', async () => {
      await expect(
        service.applyTemplate('   ', 'CAFETERIA'),
      ).rejects.toThrow(TenantContextRequiredError);

      // The transaction itself must never be opened for a blank tenant.
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(mockManager.query).not.toHaveBeenCalled();
    });

    it('propagates a binding failure and aborts before any protected write', async () => {
      templateRepo.findOne.mockResolvedValueOnce(mockTemplates[0]);
      (mockManager.query as jest.Mock).mockRejectedValueOnce(
        new Error('binding failed'),
      );

      await expect(
        service.applyTemplate(tenantId, 'CAFETERIA'),
      ).rejects.toThrow('binding failed');

      expect(mockManager.findOne).not.toHaveBeenCalled();
      expect(mockManager.save).not.toHaveBeenCalled();
    });

    it('fails closed if tenantId is missing or blank (Unit 0b-3: TenantContextRequiredError, no SQL)', async () => {
      // The old BadRequestException guard is superseded by the stricter
      // fail-closed contract shared with the rest of the bound services.
      await expect(service.applyTemplate('   ', 'CAFETERIA')).rejects.toThrow(
        TenantContextRequiredError,
      );
    });

    it('throws NotFoundException if template to apply is not found', async () => {
      templateRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.applyTemplate(tenantId, 'NON_EXISTENT'),
      ).rejects.toThrow(NotFoundException);
    });

    it('injects all insumos, products, UOM conversions and Pre-BOM recipes on empty tenant', async () => {
      templateRepo.findOne.mockResolvedValueOnce(mockTemplates[0]);

      mockManager.find.mockResolvedValue([]);

      mockManager.save.mockImplementation(
        (entityClass: unknown, item: unknown) => {
          if (entityClass === Insumo) {
            if (Array.isArray(item)) {
              const mapped = (item as Insumo[]).map((i, idx) => ({
                ...i,
                id: `real-insumo-${idx + 1}`,
              }));
              return Promise.resolve(mapped);
            }
            return Promise.resolve({
              ...(item as Insumo),
              id: 'real-insumo-1',
            });
          }
          if (entityClass === Product) {
            if (Array.isArray(item)) {
              const mapped = (item as Product[]).map((p, idx) => ({
                ...p,
                id: `real-prod-${idx + 1}`,
              }));
              return Promise.resolve(mapped);
            }
            return Promise.resolve({
              ...(item as Product),
              id: 'real-prod-1',
            });
          }
          if (entityClass === RecipeVersion) {
            return Promise.resolve({
              ...(item as RecipeVersion),
              id: 'real-rv-1',
            });
          }
          return Promise.resolve(item);
        },
      );

      const result = await service.applyTemplate(tenantId, 'CAFETERIA');

      expect(result).toMatchObject({
        tenantId,
        templateCode: 'CAFETERIA',
        insumosCreated: 2,
        insumosSkipped: 0,
        productsCreated: 1,
        productsSkipped: 0,
        recipesCreated: 1,
      });

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });

    it('includes every recipe ingredient when only its product is selected', async () => {
      templateRepo.findOne.mockResolvedValueOnce(mockTemplates[0]);
      mockManager.find.mockResolvedValue([]);
      mockManager.save.mockImplementation(
        (entityClass: unknown, item: unknown) => {
          if (entityClass === Insumo)
            return Promise.resolve({
              ...(item as Insumo),
              id: `ins-${(item as Insumo).name}`,
            });
          if (entityClass === Product)
            return Promise.resolve({ ...(item as Product), id: 'product-1' });
          if (entityClass === RecipeVersion)
            return Promise.resolve({
              ...(item as RecipeVersion),
              id: 'version-1',
            });
          if (entityClass === TemplateApplication)
            return Promise.resolve({
              ...(item as TemplateApplication),
              id: 'application-1',
            });
          return Promise.resolve(item);
        },
      );

      const result = await service.applyTemplate(tenantId, 'CAFETERIA', {
        selectedItemIds: ['tp-1'],
      });

      expect(result.insumosCreated).toBe(2);
      expect(mockManager.save).toHaveBeenCalledWith(
        Insumo,
        expect.objectContaining({ name: 'Granos de Café Especial' }),
      );
      expect(mockManager.save).toHaveBeenCalledWith(
        Insumo,
        expect.objectContaining({ name: 'Leche Entera' }),
      );
    });

    it('is strictly idempotent: skips already existing insumos and products and avoids duplicate recipes', async () => {
      templateRepo.findOne.mockResolvedValueOnce(mockTemplates[0]);

      const existingInsumo: Insumo = {
        id: 'existing-ins-1',
        tenant_id: tenantId,
        tenant: null,
        warehouse_id: 'wh-1',
        name: 'Granos de Café Especial',
        purchaseUom: 'KG',
        consumptionUom: 'G',
        conversionFactor: 1000,
        stock: 5000,
        existenciaActual: 5000,
        averageCost: 0.5,
        parLevel: 10000,
        minStock: 2000,
        maxStock: 20000,
        is_perishable: false,
        negativeStockPolicy: NEGATIVE_STOCK_POLICY.RESTRICT,
        is_active: true,
        conversions: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      const existingProduct: Product = {
        id: 'existing-prod-1',
        tenant_id: tenantId,
        tenant: null,
        warehouse_id: 'wh-1',
        name: 'Capuchino 8oz',
        uom: 'UN',
        product_type: 'SIMPLE' as never,
        category_code: null,
        sellPrice: 95.0,
        averageCost: 15.0,
        stock: 0,
        is_perishable: false,
        is_active: true,
        tax_rate: 0.15,
        is_tax_exempt: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const existingRecipeVersion: RecipeVersion = {
        id: 'existing-rv-1',
        tenant_id: tenantId,
        tenant: null,
        product_id: existingProduct.id,
        product: null,
        version_number: 1,
        is_active: true,
        fecha_inicio_vigencia: new Date(),
        fecha_fin_vigencia: null,
        pos_document_id: null,
        product_name: 'Capuchino 8oz',
        yield_quantity: 1,
        technical_shrink_pct: 0,
        version_note: null,
        published_at: null,
        pos_created_at: null,
        origin: RecipeOrigin.MANUAL,
        publication_state: RecipePublicationState.PUBLISHED,
        suggestion_state: RecipeSuggestionState.CONFIRMED,
        created_at: new Date(),
      };

      mockManager.findOne.mockImplementation((entityClass: unknown) => {
        if (entityClass === RecipeVersion)
          return Promise.resolve(existingRecipeVersion);
        return Promise.resolve(null);
      });

      mockManager.find.mockImplementation((entityClass: unknown) => {
        if (entityClass === Insumo) return Promise.resolve([existingInsumo]);
        if (entityClass === Product) return Promise.resolve([existingProduct]);
        if (entityClass === RecipeVersion)
          return Promise.resolve([existingRecipeVersion]);
        return Promise.resolve([] as unknown as never[]);
      });

      mockManager.save.mockImplementation(
        (entityClass: unknown, item: unknown) => {
          if (entityClass === Insumo) {
            if (Array.isArray(item)) {
              const mapped = (item as Insumo[]).map((i, idx) => ({
                ...i,
                id: `new-ins-${idx + 1}`,
              }));
              return Promise.resolve(mapped);
            }
            return Promise.resolve({
              ...(item as Insumo),
              id: 'new-ins-1',
            });
          }
          return Promise.resolve(item);
        },
      );

      const result = await service.applyTemplate(tenantId, 'CAFETERIA');

      expect(result).toMatchObject({
        tenantId,
        templateCode: 'CAFETERIA',
        insumosCreated: 1,
        insumosSkipped: 1,
        productsCreated: 0,
        productsSkipped: 1,
        recipesCreated: 0,
      });
    });

    it('correctly handles retail template with 0 insumos and 0 recipes (triangulation test)', async () => {
      const retailTemplate: IndustryTemplate = {
        id: 'RETAIL_MINIMARKET',
        code: 'RETAIL_MINIMARKET',
        name: 'Retail & Minimarket',
        description: 'Plantilla minimarket',
        icon: 'shopping-cart',
        is_active: true,
        version: 1,
        source_fingerprint: 'fp-retail',
        created_at: new Date(),
        updated_at: new Date(),
        templateInsumos: [],
        templateProducts: [
          {
            id: 'tp-coca',
            template_id: 'RETAIL_MINIMARKET',
            template: null,
            name: 'Gaseosa Coca Cola 500ml',
            category: 'Bebidas',
            uom: 'UN',
            suggested_price: 35.0,
            is_perishable: false,
            product_type: ProductType.SIMPLE,
            created_at: new Date(),
            updated_at: new Date(),
            recipeItems: [],
          },
        ],
      };

      templateRepo.findOne.mockResolvedValueOnce(retailTemplate);
      mockManager.find.mockResolvedValue([]);
      mockManager.save.mockImplementation(
        (entityClass: unknown, item: unknown) => {
          if (entityClass === Product) {
            return Promise.resolve(
              Array.isArray(item)
                ? (item as Product[]).map((p, idx) => ({
                    ...p,
                    id: `retail-p-${idx}`,
                  }))
                : { ...(item as Product), id: 'retail-p-0' },
            );
          }
          return Promise.resolve(item);
        },
      );

      const result = await service.applyTemplate(tenantId, 'RETAIL_MINIMARKET');

      expect(result).toMatchObject({
        tenantId,
        templateCode: 'RETAIL_MINIMARKET',
        insumosCreated: 0,
        insumosSkipped: 0,
        productsCreated: 1,
        productsSkipped: 0,
        recipesCreated: 0,
      });
    });

    describe('#523 T1 — template products carry a real product type', () => {
      it('creates a recipe-bearing template product as COMPOUND', async () => {
        templateRepo.findOne.mockResolvedValueOnce(mockTemplates[0]);
        mockManager.find.mockResolvedValue([]);

        await service.applyTemplate(tenantId, 'CAFETERIA');

        // COMPOUND (not a new enum member): the cloud recipe branch admits
        // PREPARED || COMPOUND identically, the POS maps both to
        // isPrepared: true, and COMPOUND is the value the dashboard Recipes
        // page already lists — so the created product is explodable AND
        // visible in Recipes without inventing a type.
        expect(mockManager.save).toHaveBeenCalledWith(
          Product,
          expect.objectContaining({
            name: 'Capuchino 8oz',
            product_type: ProductType.COMPOUND,
          }),
        );
      });

      it('keeps a template row without recipe items SIMPLE (triangulation: retail)', async () => {
        const retailTemplate = mockTemplates[2];
        retailTemplate.templateProducts = [
          {
            id: 'tp-coca',
            template_id: 'RETAIL_MINIMARKET',
            template: null,
            name: 'Gaseosa Coca Cola 500ml',
            category: 'Bebidas',
            uom: 'UN',
            suggested_price: 35.0,
            is_perishable: false,
            product_type: ProductType.SIMPLE,
            created_at: new Date(),
            updated_at: new Date(),
            recipeItems: [],
          },
        ];
        templateRepo.findOne.mockResolvedValueOnce(retailTemplate);
        mockManager.find.mockResolvedValue([]);

        await service.applyTemplate(tenantId, 'RETAIL_MINIMARKET');

        expect(mockManager.save).toHaveBeenCalledWith(
          Product,
          expect.objectContaining({
            name: 'Gaseosa Coca Cola 500ml',
            product_type: ProductType.SIMPLE,
          }),
        );
      });

      it('resolves an undeclared type from the row shape (recipe items → COMPOUND) so pre-backfill rows do not crash', async () => {
        const undeclaredTemplate: IndustryTemplate = {
          ...mockTemplates[0],
          templateProducts: [
            {
              ...mockTemplates[0].templateProducts[0],
              product_type: undefined,
            },
          ],
        };
        templateRepo.findOne.mockResolvedValueOnce(undeclaredTemplate);
        mockManager.find.mockResolvedValue([]);

        await service.applyTemplate(tenantId, 'CAFETERIA');

        expect(mockManager.save).toHaveBeenCalledWith(
          Product,
          expect.objectContaining({ product_type: ProductType.COMPOUND }),
        );
      });

      it('surfaces a data error instead of downgrading when a recipe-bearing row declares SIMPLE', async () => {
        const contradictoryTemplate: IndustryTemplate = {
          ...mockTemplates[0],
          templateProducts: [
            {
              ...mockTemplates[0].templateProducts[0],
              product_type: ProductType.SIMPLE,
            },
          ],
        };
        templateRepo.findOne.mockResolvedValueOnce(contradictoryTemplate);
        mockManager.find.mockResolvedValue([]);

        // A SIMPLE product is structurally incapable of consuming insumos
        // (POS planner: simple → noImpact), so recipe items next to an
        // explicit SIMPLE declaration is template data corruption; the
        // service must surface it, never silently downgrade the row.
        await expect(
          service.applyTemplate(tenantId, 'CAFETERIA'),
        ).rejects.toThrow(
          /declares \d+ recipe item\(s\) but declares product_type SIMPLE/,
        );
      });
    });

    // #523 T5/T7 — the apply result must say the created recipes are PENDING
    // SUGGESTIONS requiring review (not a bare count), and a re-apply must
    // report what it skipped and why instead of being a silent no-op. The
    // skip guard itself keeps its exact behaviour.
    describe('#523 T5/T7 — honest apply result', () => {
      const existingInsumo: Insumo = {
        id: 'existing-ins-1',
        tenant_id: tenantId,
        tenant: null,
        warehouse_id: 'wh-1',
        name: 'Granos de Café Especial',
        purchaseUom: 'KG',
        consumptionUom: 'G',
        conversionFactor: 1000,
        stock: 5000,
        existenciaActual: 5000,
        averageCost: 0.5,
        parLevel: 10000,
        minStock: 2000,
        maxStock: 20000,
        is_perishable: false,
        negativeStockPolicy: NEGATIVE_STOCK_POLICY.RESTRICT,
        is_active: true,
        conversions: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      const buildSkippedApply = async (
        publicationState: RecipePublicationState,
      ): Promise<ApplyTemplateResult> => {
        templateRepo.findOne.mockResolvedValueOnce(mockTemplates[0]);
        const existingProduct: Product = {
          id: 'existing-prod-1',
          tenant_id: tenantId,
          tenant: null,
          warehouse_id: 'wh-1',
          name: 'Capuchino 8oz',
          uom: 'UN',
          product_type: 'SIMPLE' as never,
          category_code: null,
          sellPrice: 95.0,
          averageCost: 15.0,
          stock: 0,
          is_perishable: false,
          is_active: true,
          tax_rate: 0.15,
          is_tax_exempt: false,
          created_at: new Date(),
          updated_at: new Date(),
        };
        const existingVersion: RecipeVersion = {
          id: 'existing-rv-1',
          tenant_id: tenantId,
          tenant: null,
          product_id: existingProduct.id,
          product: null,
          version_number: 1,
          is_active: publicationState === RecipePublicationState.PUBLISHED,
          fecha_inicio_vigencia: new Date(),
          fecha_fin_vigencia: null,
          pos_document_id: null,
          product_name: 'Capuchino 8oz',
          yield_quantity: 1,
          technical_shrink_pct: 0,
          version_note: null,
          published_at: null,
          pos_created_at: null,
          origin: RecipeOrigin.INDUSTRY_TEMPLATE,
          publication_state: publicationState,
          suggestion_state: RecipeSuggestionState.SUGGESTED,
          created_at: new Date(),
        };
        mockManager.findOne.mockImplementation((entityClass: unknown) => {
          if (entityClass === RecipeVersion)
            return Promise.resolve(existingVersion);
          return Promise.resolve(null);
        });
        mockManager.find.mockImplementation((entityClass: unknown) => {
          if (entityClass === Insumo) return Promise.resolve([existingInsumo]);
          if (entityClass === Product)
            return Promise.resolve([existingProduct]);
          return Promise.resolve([] as unknown as never[]);
        });

        return service.applyTemplate(tenantId, 'CAFETERIA');
      };

      it('says the single created recipe is a pending suggestion requiring review (T5)', async () => {
        templateRepo.findOne.mockResolvedValueOnce(mockTemplates[0]);
        mockManager.find.mockResolvedValue([]);

        const result = await service.applyTemplate(tenantId, 'CAFETERIA');

        expect(result.recipesCreated).toBe(1);
        expect(result.recipesPendingReviewMessage).toBe(
          '1 receta creada como sugerencia pendiente de revisión',
        );
      });

      it('keeps the pending-review signal for an apply that creates zero recipes (T5 triangulation)', async () => {
        templateRepo.findOne.mockResolvedValueOnce(mockTemplates[2]);
        mockManager.find.mockResolvedValue([]);

        const result = await service.applyTemplate(
          tenantId,
          'RETAIL_MINIMARKET',
        );

        expect(result.recipesCreated).toBe(0);
        expect(result.recipesPendingReviewMessage).toBe(
          '0 recetas creadas como sugerencias pendientes de revisión',
        );
      });

      it('reports each skipped recipe with product name and existing PUBLISHED state (T7)', async () => {
        const result = await buildSkippedApply(
          RecipePublicationState.PUBLISHED,
        );

        expect(result.recipesCreated).toBe(0);
        expect(result.recipesSkipped).toEqual([
          {
            productName: 'Capuchino 8oz',
            reason: 'VERSION_ALREADY_EXISTS',
            existingState: RecipePublicationState.PUBLISHED,
          },
        ]);
      });

      it('reports the existing DRAFT state on the re-apply path (T7 triangulation)', async () => {
        const result = await buildSkippedApply(RecipePublicationState.DRAFT);

        expect(result.recipesSkipped).toEqual([
          {
            productName: 'Capuchino 8oz',
            reason: 'VERSION_ALREADY_EXISTS',
            existingState: RecipePublicationState.DRAFT,
          },
        ]);
      });

      it('normalizes legacy stored summaries on idempotent replay so the payload stays closed (T5/T7)', async () => {
        templateRepo.findOne.mockResolvedValue(mockTemplates[0]);
        mockManager.find.mockResolvedValue([]);
        let stored: TemplateApplication | null = null;
        mockManager.save.mockImplementation(
          (entityClass: unknown, item: unknown) => {
            if (entityClass === TemplateApplication) {
              stored = {
                ...(item as TemplateApplication),
                id: 'app-1',
              };
              return Promise.resolve(stored);
            }
            return Promise.resolve(item);
          },
        );
        mockManager.findOne.mockImplementation((entityClass: unknown) => {
          if (entityClass === TemplateApplication)
            return Promise.resolve(stored);
          return Promise.resolve(null);
        });

        await service.applyTemplate(tenantId, 'CAFETERIA', {
          idempotencyKey: 'replay-key',
        });

        // Simulate a summary stored by a pre-#523 backend: no new keys.
        if (stored) {
          delete (stored.summary_json as Record<string, unknown>)
            .recipesPendingReviewMessage;
          delete (stored.summary_json as Record<string, unknown>)
            .recipesSkipped;
        }

        const replay = await service.applyTemplate(tenantId, 'CAFETERIA', {
          idempotencyKey: 'replay-key',
        });

        expect(replay.recipesPendingReviewMessage).toBe(
          '1 receta creada como sugerencia pendiente de revisión',
        );
        expect(replay.recipesSkipped).toEqual([]);
      });
    });
  });
});
