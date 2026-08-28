import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { IndustryTemplateService } from './industry-template.service';
import { IndustryTemplate } from '../entities/industry-template.entity';
import { TemplateInsumo } from '../entities/template-insumo.entity';
import { TemplateProduct } from '../entities/template-product.entity';
import { TemplateRecipeItem } from '../entities/template-recipe-item.entity';
import {
  Insumo,
  NEGATIVE_STOCK_POLICY,
} from '../../inventory/entities/insumo.entity';
import { Product } from '../../inventory/entities/product.entity';
import { RecipeVersion } from '../../inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../../inventory/entities/recipe-detail.entity';
import { Recipe } from '../../inventory/entities/recipe.entity';
import { UomConversion } from '../../inventory/entities/uom-conversion.entity';

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
      create: jest.fn(
        (_entityClass: unknown, plain: unknown) => plain as object,
      ),
      save: jest.fn((_entityClass: unknown, entities: unknown) =>
        Promise.resolve(entities),
      ),
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

    it('throws BadRequestException if tenantId is missing or blank', async () => {
      await expect(service.applyTemplate('   ', 'CAFETERIA')).rejects.toThrow(
        BadRequestException,
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

      expect(result).toEqual({
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
        sellPrice: 95.0,
        averageCost: 15.0,
        stock: 0,
        is_perishable: false,
        is_active: true,
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

      expect(result).toEqual({
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

      expect(result).toEqual({
        tenantId,
        templateCode: 'RETAIL_MINIMARKET',
        insumosCreated: 0,
        insumosSkipped: 0,
        productsCreated: 1,
        productsSkipped: 0,
        recipesCreated: 0,
      });
    });
  });
});
