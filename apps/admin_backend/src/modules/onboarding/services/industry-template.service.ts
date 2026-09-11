import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { IndustryTemplate } from '../entities/industry-template.entity';
import { TemplateInsumo } from '../entities/template-insumo.entity';
import { TemplateProduct } from '../entities/template-product.entity';
import { TemplateRecipeItem } from '../entities/template-recipe-item.entity';
import { Insumo } from '../../inventory/entities/insumo.entity';
import { Product } from '../../inventory/entities/product.entity';
import { RecipeVersion } from '../../inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../../inventory/entities/recipe-detail.entity';
import { IngredientType, Recipe } from '../../inventory/entities/recipe.entity';
import { UomConversion } from '../../inventory/entities/uom-conversion.entity';
import {
  ApplyTemplateDto,
  ApplyTemplateResult,
  TemplateSummaryResponse,
} from '../dto/apply-template.dto';

const SCALE_4 = 4;
const round4 = (val: number | string): number => {
  const num = typeof val === 'number' ? val : Number(val || 0);
  return Number(num.toFixed(SCALE_4));
};

@Injectable()
export class IndustryTemplateService {
  constructor(
    @InjectRepository(IndustryTemplate)
    private readonly templateRepo: Repository<IndustryTemplate>,
    @InjectRepository(TemplateInsumo)
    private readonly templateInsumoRepo: Repository<TemplateInsumo>,
    @InjectRepository(TemplateProduct)
    private readonly templateProductRepo: Repository<TemplateProduct>,
    @InjectRepository(TemplateRecipeItem)
    private readonly templateRecipeItemRepo: Repository<TemplateRecipeItem>,
    @InjectRepository(Insumo)
    private readonly insumoRepo: Repository<Insumo>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(RecipeVersion)
    private readonly recipeVersionRepo: Repository<RecipeVersion>,
    @InjectRepository(RecipeDetail)
    private readonly recipeDetailRepo: Repository<RecipeDetail>,
    @InjectRepository(Recipe)
    private readonly recipeRepo: Repository<Recipe>,
    @InjectRepository(UomConversion)
    private readonly uomConversionRepo: Repository<UomConversion>,
    private readonly dataSource: DataSource,
  ) {}

  async listTemplates(): Promise<TemplateSummaryResponse[]> {
    const templates = await this.templateRepo.find({
      where: { is_active: true },
      relations: ['templateInsumos', 'templateProducts'],
      order: { name: 'ASC' },
    });

    return templates.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      description: t.description,
      icon: t.icon,
      insumoCount: t.templateInsumos?.length ?? 0,
      productCount: t.templateProducts?.length ?? 0,
    }));
  }

  async getTemplateByCode(code: string): Promise<IndustryTemplate> {
    const trimmed = code?.trim();
    if (!trimmed) {
      throw new BadRequestException('Template code must not be empty');
    }

    const template = await this.templateRepo.findOne({
      where: [{ code: trimmed }, { id: trimmed }],
      relations: [
        'templateInsumos',
        'templateProducts',
        'templateProducts.recipeItems',
      ],
    });

    if (!template) {
      throw new NotFoundException(`Industry template '${trimmed}' not found`);
    }

    return template;
  }

  async applyTemplate(
    tenantId: string,
    templateCode: string,
    _options?: ApplyTemplateDto,
  ): Promise<ApplyTemplateResult> {
    const trimmedTenant = tenantId?.trim();
    if (!trimmedTenant) {
      throw new BadRequestException('Tenant ID is required');
    }
    void _options;

    const template = await this.getTemplateByCode(templateCode);

    return this.dataSource.transaction(async (manager: EntityManager) => {
      let insumosCreated = 0;
      let insumosSkipped = 0;
      let productsCreated = 0;
      let productsSkipped = 0;
      let recipesCreated = 0;

      // 1. Existing Insumos lookup
      const existingInsumos = await manager.find(Insumo, {
        where: { tenant_id: trimmedTenant },
      });
      const insumoMap = new Map<string, Insumo>();
      for (const ins of existingInsumos) {
        insumoMap.set(ins.name.trim().toLowerCase(), ins);
      }

      // 2. Inject Template Insumos
      if (template.templateInsumos && template.templateInsumos.length > 0) {
        for (const tInsumo of template.templateInsumos) {
          const key = tInsumo.name.trim().toLowerCase();
          if (insumoMap.has(key)) {
            insumosSkipped++;
            continue;
          }

          const newInsumo = manager.create(Insumo, {
            tenant_id: trimmedTenant,
            name: tInsumo.name.trim(),
            purchaseUom: tInsumo.purchase_uom,
            consumptionUom: tInsumo.consumption_uom,
            conversionFactor: Number(tInsumo.conversion_factor || 1),
            parLevel: tInsumo.par_level ? Number(tInsumo.par_level) : undefined,
            minStock: tInsumo.min_stock ? Number(tInsumo.min_stock) : undefined,
            is_perishable: tInsumo.is_perishable,
            negativeStockPolicy: tInsumo.negative_stock_policy,
            stock: 0,
            existenciaActual: 0,
            averageCost: 0,
            is_active: true,
          });

          const savedInsumo = await manager.save(Insumo, newInsumo);
          insumoMap.set(key, savedInsumo);
          insumosCreated++;

          // Register standard conversion if purchaseUom !== consumptionUom
          if (tInsumo.purchase_uom !== tInsumo.consumption_uom) {
            const conversion = manager.create(UomConversion, {
              tenant_id: trimmedTenant,
              insumo_id: savedInsumo.id,
              unit_name: tInsumo.purchase_uom,
              factor: Number(tInsumo.conversion_factor || 1),
            });
            await manager.save(UomConversion, conversion);
          }
        }
      }

      // 3. Existing Products lookup
      const existingProducts = await manager.find(Product, {
        where: { tenant_id: trimmedTenant },
      });
      const productMap = new Map<string, Product>();
      for (const prod of existingProducts) {
        productMap.set(prod.name.trim().toLowerCase(), prod);
      }

      // 4. Inject Template Products
      if (template.templateProducts && template.templateProducts.length > 0) {
        for (const tProduct of template.templateProducts) {
          const key = tProduct.name.trim().toLowerCase();
          let currentProduct: Product;

          if (productMap.has(key)) {
            productsSkipped++;
            currentProduct = productMap.get(key)!;
          } else {
            const newProduct = manager.create(Product, {
              tenant_id: trimmedTenant,
              name: tProduct.name.trim(),
              uom: tProduct.uom ?? 'UN',
              sellPrice: tProduct.suggested_price
                ? Number(tProduct.suggested_price)
                : 0,
              averageCost: 0,
              stock: 0,
              is_perishable: tProduct.is_perishable,
              is_active: true,
            });

            currentProduct = await manager.save(Product, newProduct);
            productMap.set(key, currentProduct);
            productsCreated++;
          }

          // 5. Inject Pre-BOM Recipes
          if (tProduct.recipeItems && tProduct.recipeItems.length > 0) {
            const existingVersion = await manager.findOne(RecipeVersion, {
              where: {
                tenant_id: trimmedTenant,
                product_id: currentProduct.id,
                is_active: true,
              },
            });

            if (!existingVersion) {
              const recipeVersion = manager.create(RecipeVersion, {
                tenant_id: trimmedTenant,
                product_id: currentProduct.id,
                version_number: 1,
                is_active: true,
                fecha_inicio_vigencia: new Date(),
                product_name: currentProduct.name,
                yield_quantity: 1,
                technical_shrink_pct: 0,
              });

              const savedVersion = await manager.save(
                RecipeVersion,
                recipeVersion,
              );

              for (const item of tProduct.recipeItems) {
                const insumoKey = item.template_insumo_name
                  .trim()
                  .toLowerCase();
                const matchedInsumo = insumoMap.get(insumoKey);

                if (matchedInsumo) {
                  const grossQty = Number(item.gross_quantity || 0);
                  const shrinkPct = Number(item.technical_shrink_pct || 0);
                  const netQuantity = round4(grossQty * (1 - shrinkPct / 100));

                  const recipeDetail = manager.create(RecipeDetail, {
                    tenant_id: trimmedTenant,
                    recipe_version_id: savedVersion.id,
                    insumo_id: matchedInsumo.id,
                    gross_quantity: round4(grossQty),
                    technical_shrink_pct: round4(shrinkPct),
                    quantity: netQuantity,
                    ingredient_name: matchedInsumo.name,
                    ingredient_type: 'INSUMO',
                    component_uom: item.component_uom,
                  });

                  await manager.save(RecipeDetail, recipeDetail);

                  // Legacy compatibility recipe row
                  const legacyRecipe = manager.create(Recipe, {
                    tenant_id: trimmedTenant,
                    productId: currentProduct.id,
                    ingredientId: matchedInsumo.id,
                    ingredientType: IngredientType.INSUMO,
                    quantity: netQuantity,
                  });

                  await manager.save(Recipe, legacyRecipe);
                }
              }

              recipesCreated++;
            }
          }
        }
      }

      return {
        tenantId: trimmedTenant,
        templateCode: template.code,
        insumosCreated,
        insumosSkipped,
        productsCreated,
        productsSkipped,
        recipesCreated,
      };
    });
  }
}
