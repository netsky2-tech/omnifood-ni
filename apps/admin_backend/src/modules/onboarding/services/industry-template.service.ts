import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { IndustryTemplate } from '../entities/industry-template.entity';
import { TemplateInsumo } from '../entities/template-insumo.entity';
import { TemplateProduct } from '../entities/template-product.entity';
import { TemplateRecipeItem } from '../entities/template-recipe-item.entity';
import { Insumo } from '../../inventory/entities/insumo.entity';
import { Product } from '../../inventory/entities/product.entity';
import {
  RecipeOrigin,
  RecipePublicationState,
  RecipeSuggestionState,
  RecipeVersion,
} from '../../inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../../inventory/entities/recipe-detail.entity';
import { Recipe } from '../../inventory/entities/recipe.entity';
import { UomConversion } from '../../inventory/entities/uom-conversion.entity';
import {
  TemplateSeedLink,
  TemplateSourceItemType,
  TemplateTargetEntityType,
} from '../entities/template-seed-link.entity';
import {
  TemplateApplication,
  TemplateApplicationStatus,
} from '../entities/template-application.entity';
import { TemplatePreviewService } from './template-preview.service';
import { OnboardingIdempotencyCoordinator } from './onboarding-idempotency.coordinator';
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
    @InjectRepository(TemplateSeedLink)
    private readonly seedLinkRepo: Repository<TemplateSeedLink>,
    @InjectRepository(TemplateApplication)
    private readonly templateApplicationRepo: Repository<TemplateApplication>,
    private readonly previewService: TemplatePreviewService,
    private readonly idempotencyCoordinator: OnboardingIdempotencyCoordinator,
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
    options?: ApplyTemplateDto,
  ): Promise<ApplyTemplateResult> {
    const trimmedTenant = tenantId?.trim();
    if (!trimmedTenant) {
      throw new BadRequestException('Tenant ID is required');
    }

    const template = await this.getTemplateByCode(templateCode);
    const version = options?.templateVersion ?? template.version ?? 1;

    // Idempotency lease check
    let leaseRecordId: string | null = null;
    if (options?.idempotencyKey) {
      const leasePayload = {
        templateCode: template.code,
        templateVersion: version,
        selectedItemIds: options.selectedItemIds ?? null,
        productPriceOverrides: options.productPriceOverrides ?? null,
      };

      const lease = await this.idempotencyCoordinator.acquireLease({
        tenantId: trimmedTenant,
        idempotencyKey: options.idempotencyKey,
        commandType: 'APPLY_INDUSTRY_TEMPLATE',
        payload: leasePayload,
      });

      if (lease.state === 'ALREADY_COMPLETED') {
        return lease.result as ApplyTemplateResult;
      }

      leaseRecordId = lease.record.id;
    }

    try {
      const result = await this.dataSource.transaction(
        async (manager: EntityManager) => {
          let insumosCreated = 0;
          let insumosSkipped = 0;
          let productsCreated = 0;
          let productsSkipped = 0;
          let recipesCreated = 0;

          const selectionHash = this.previewService.computeFingerprint({
            templateCode: template.code,
            version,
            selectedItemIds: options?.selectedItemIds ?? null,
          });

          const selectedSet = options?.selectedItemIds
            ? new Set(options.selectedItemIds)
            : null;

          // 1. Existing Seed Links for this template
          const existingLinks = await manager.find(TemplateSeedLink, {
            where: {
              tenant_id: trimmedTenant,
              template_code: template.code,
            },
          });
          const seedLinkMap = new Map<string, TemplateSeedLink>();
          for (const link of existingLinks) {
            seedLinkMap.set(
              `${link.source_item_id}:${link.target_entity_type}`,
              link,
            );
          }

          // 2. Existing Insumos lookup
          const existingInsumos = await manager.find(Insumo, {
            where: { tenant_id: trimmedTenant },
          });
          const insumoMap = new Map<string, Insumo>();
          for (const ins of existingInsumos) {
            insumoMap.set(ins.name.trim().toLowerCase(), ins);
          }

          // 3. Inject Template Insumos
          if (template.templateInsumos && template.templateInsumos.length > 0) {
            for (const tInsumo of template.templateInsumos) {
              if (selectedSet && !selectedSet.has(tInsumo.id)) {
                continue;
              }

              const linkKey = `${tInsumo.id}:${TemplateTargetEntityType.INSUMO}`;
              const existingLink = seedLinkMap.get(linkKey);

              let currentInsumo: Insumo | undefined;
              const nameKey = tInsumo.name.trim().toLowerCase();

              const fp = this.previewService.computeFingerprint({
                templateCode: template.code,
                version,
                type: 'INGREDIENT',
                name: tInsumo.name.trim(),
                purchaseUom: tInsumo.purchase_uom,
                consumptionUom: tInsumo.consumption_uom,
                conversionFactor: tInsumo.conversion_factor,
              });

              if (existingLink) {
                insumosSkipped++;
                existingLink.last_seen_version = version;
                await manager.save(TemplateSeedLink, existingLink);
                currentInsumo = insumoMap.get(nameKey);
              } else if (insumoMap.has(nameKey)) {
                insumosSkipped++;
                currentInsumo = insumoMap.get(nameKey)!;

                // Create link to existing unlinked entity
                const newLink = manager.create(TemplateSeedLink, {
                  tenant_id: trimmedTenant,
                  template_code: template.code,
                  source_item_id: tInsumo.id,
                  source_item_type: TemplateSourceItemType.INGREDIENT,
                  target_entity_type: TemplateTargetEntityType.INSUMO,
                  target_entity_id: currentInsumo.id,
                  first_applied_version: version,
                  last_seen_version: version,
                  last_applied_version: version,
                  last_source_fingerprint: fp,
                });
                await manager.save(TemplateSeedLink, newLink);
              } else {
                const newInsumo = manager.create(Insumo, {
                  tenant_id: trimmedTenant,
                  name: tInsumo.name.trim(),
                  purchaseUom: tInsumo.purchase_uom,
                  consumptionUom: tInsumo.consumption_uom,
                  conversionFactor: Number(tInsumo.conversion_factor || 1),
                  parLevel: tInsumo.par_level
                    ? Number(tInsumo.par_level)
                    : undefined,
                  minStock: tInsumo.min_stock
                    ? Number(tInsumo.min_stock)
                    : undefined,
                  is_perishable: tInsumo.is_perishable,
                  negativeStockPolicy: tInsumo.negative_stock_policy,
                  stock: 0,
                  existenciaActual: 0,
                  averageCost: 0,
                  is_active: true,
                });

                const savedInsumo = await manager.save(Insumo, newInsumo);
                currentInsumo = savedInsumo;
                insumoMap.set(nameKey, savedInsumo);
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

                // Create SeedLink for newly created Insumo
                const newLink = manager.create(TemplateSeedLink, {
                  tenant_id: trimmedTenant,
                  template_code: template.code,
                  source_item_id: tInsumo.id,
                  source_item_type: TemplateSourceItemType.INGREDIENT,
                  target_entity_type: TemplateTargetEntityType.INSUMO,
                  target_entity_id: savedInsumo.id,
                  first_applied_version: version,
                  last_seen_version: version,
                  last_applied_version: version,
                  last_source_fingerprint: fp,
                });
                await manager.save(TemplateSeedLink, newLink);
              }
            }
          }

          // 4. Existing Products lookup
          const existingProducts = await manager.find(Product, {
            where: { tenant_id: trimmedTenant },
          });
          const productMap = new Map<string, Product>();
          for (const prod of existingProducts) {
            productMap.set(prod.name.trim().toLowerCase(), prod);
          }

          // 5. Inject Template Products
          if (template.templateProducts && template.templateProducts.length > 0) {
            for (const tProduct of template.templateProducts) {
              if (selectedSet && !selectedSet.has(tProduct.id)) {
                continue;
              }

              const linkKey = `${tProduct.id}:${TemplateTargetEntityType.PRODUCT}`;
              const existingLink = seedLinkMap.get(linkKey);

              let currentProduct: Product;
              const nameKey = tProduct.name.trim().toLowerCase();

              const fp = this.previewService.computeFingerprint({
                templateCode: template.code,
                version,
                type: 'PRODUCT',
                name: tProduct.name.trim(),
                category: tProduct.category,
                uom: tProduct.uom,
                suggestedPrice: tProduct.suggested_price,
              });

              if (existingLink) {
                productsSkipped++;
                existingLink.last_seen_version = version;
                await manager.save(TemplateSeedLink, existingLink);
                currentProduct = productMap.get(nameKey)!;
              } else if (productMap.has(nameKey)) {
                productsSkipped++;
                currentProduct = productMap.get(nameKey)!;

                // Create link to existing unlinked entity
                const newLink = manager.create(TemplateSeedLink, {
                  tenant_id: trimmedTenant,
                  template_code: template.code,
                  source_item_id: tProduct.id,
                  source_item_type: TemplateSourceItemType.PRODUCT,
                  target_entity_type: TemplateTargetEntityType.PRODUCT,
                  target_entity_id: currentProduct.id,
                  first_applied_version: version,
                  last_seen_version: version,
                  last_applied_version: version,
                  last_source_fingerprint: fp,
                });
                await manager.save(TemplateSeedLink, newLink);
              } else {
                const sellPrice =
                  options?.productPriceOverrides?.[tProduct.id] ??
                  (tProduct.suggested_price
                    ? Number(tProduct.suggested_price)
                    : 0);

                const newProduct = manager.create(Product, {
                  tenant_id: trimmedTenant,
                  name: tProduct.name.trim(),
                  uom: tProduct.uom ?? 'UN',
                  sellPrice,
                  averageCost: 0,
                  stock: 0,
                  is_perishable: tProduct.is_perishable,
                  is_active: true,
                });

                currentProduct = await manager.save(Product, newProduct);
                productMap.set(nameKey, currentProduct);
                productsCreated++;

                const newLink = manager.create(TemplateSeedLink, {
                  tenant_id: trimmedTenant,
                  template_code: template.code,
                  source_item_id: tProduct.id,
                  source_item_type: TemplateSourceItemType.PRODUCT,
                  target_entity_type: TemplateTargetEntityType.PRODUCT,
                  target_entity_id: currentProduct.id,
                  first_applied_version: version,
                  last_seen_version: version,
                  last_applied_version: version,
                  last_source_fingerprint: fp,
                });
                await manager.save(TemplateSeedLink, newLink);
              }

              // 6. Inject Pre-BOM Recipes as DRAFT / SUGGESTED (Safe cutover: is_active = false)
              if (tProduct.recipeItems && tProduct.recipeItems.length > 0 && currentProduct) {
                const recipeLinkKey = `${tProduct.id}:recipe:${TemplateTargetEntityType.RECIPE_VERSION}`;
                const existingRecipeLink = seedLinkMap.get(recipeLinkKey);

                const existingVersion = await manager.findOne(RecipeVersion, {
                  where: {
                    tenant_id: trimmedTenant,
                    product_id: currentProduct.id,
                  },
                });

                if (existingRecipeLink) {
                  existingRecipeLink.last_seen_version = version;
                  await manager.save(TemplateSeedLink, existingRecipeLink);
                } else if (!existingVersion) {
                  const recipeVersion = manager.create(RecipeVersion, {
                    tenant_id: trimmedTenant,
                    product_id: currentProduct.id,
                    version_number: 1,
                    is_active: false, // SAFE GUARD: NEVER ACTIVE ON TEMPLATE APPLY
                    origin: RecipeOrigin.INDUSTRY_TEMPLATE,
                    publication_state: RecipePublicationState.DRAFT,
                    suggestion_state: RecipeSuggestionState.SUGGESTED,
                    fecha_inicio_vigencia: new Date(),
                    product_name: currentProduct.name,
                    yield_quantity: 1,
                    technical_shrink_pct: 0,
                    version_note: 'Industry template draft suggestion',
                    published_at: null,
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
                      const netQuantity = round4(
                        grossQty * (1 - shrinkPct / 100),
                      );

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
                      // NOTE: Legacy Recipe row is intentionally NOT created for draft recipes!
                    }
                  }

                  recipesCreated++;

                  const recipeFp = this.previewService.computeFingerprint({
                    templateCode: template.code,
                    version,
                    type: 'RECIPE',
                    productId: tProduct.id,
                    items: tProduct.recipeItems.map((r) => ({
                      insumo: r.template_insumo_name,
                      qty: r.gross_quantity,
                    })),
                  });

                  const recipeLink = manager.create(TemplateSeedLink, {
                    tenant_id: trimmedTenant,
                    template_code: template.code,
                    source_item_id: `${tProduct.id}:recipe`,
                    source_item_type: TemplateSourceItemType.RECIPE,
                    target_entity_type: TemplateTargetEntityType.RECIPE_VERSION,
                    target_entity_id: savedVersion.id,
                    first_applied_version: version,
                    last_seen_version: version,
                    last_applied_version: version,
                    last_source_fingerprint: recipeFp,
                  });
                  await manager.save(TemplateSeedLink, recipeLink);
                }
              }
            }
          }

          // 7. Persist TemplateApplication audit record
          const templateApp = manager.create(TemplateApplication, {
            id: randomUUID(),
            tenant_id: trimmedTenant,
            onboarding_session_id: options?.sessionId ?? null,
            template_code: template.code,
            template_version: version,
            selection_hash: selectionHash,
            idempotency_key: options?.idempotencyKey ?? `app-${Date.now()}`,
            status: TemplateApplicationStatus.APPLIED,
            applied_at: new Date(),
            summary_json: {
              insumosCreated,
              insumosSkipped,
              productsCreated,
              productsSkipped,
              recipesCreated,
            },
          });
          const savedApp = await manager.save(TemplateApplication, templateApp);

          const finalResult: ApplyTemplateResult = {
            tenantId: trimmedTenant,
            templateCode: template.code,
            templateVersion: version,
            applicationId: savedApp?.id || templateApp.id,
            insumosCreated,
            insumosSkipped,
            productsCreated,
            productsSkipped,
            recipesCreated,
          };

          if (leaseRecordId) {
            await this.idempotencyCoordinator.completeSuccess(
              leaseRecordId,
              finalResult,
              manager,
            );
          }

          return finalResult;
        },
      );

      return result;
    } catch (error: any) {
      if (leaseRecordId) {
        await this.idempotencyCoordinator.completeFailure(leaseRecordId, {
          message: error.message || 'Template application failed',
          isRetryable: true,
        });
      }
      throw error;
    }
  }
}
