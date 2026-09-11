import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
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
import { OnboardingSession } from '../entities/onboarding-session.entity';
import { UomConversion } from '../../inventory/entities/uom-conversion.entity';
import {
  TemplateApplication,
  TemplateApplicationStatus,
} from '../entities/template-application.entity';
import {
  TemplateSeedLink,
  TemplateSourceItemType,
  TemplateTargetEntityType,
} from '../entities/template-seed-link.entity';
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
    options?: ApplyTemplateDto,
    actorUserId?: string,
    retryingIdempotency = false,
  ): Promise<ApplyTemplateResult> {
    const trimmedTenant = tenantId?.trim();
    if (!trimmedTenant) throw new BadRequestException('Tenant ID is required');

    const template = await this.getTemplateByCode(templateCode);
    const selectedSet = options?.selectedItemIds
      ? new Set(options.selectedItemIds)
      : null;
    const isSelected = (id: string) => !selectedSet || selectedSet.has(id);
    const templateVersion = template.version ?? 1;
    if (
      options?.templateVersion !== undefined &&
      options.templateVersion !== templateVersion
    ) {
      throw new ConflictException(
        `Template version ${options.templateVersion} does not match current version ${templateVersion}`,
      );
    }
    const idempotencyKey = options?.idempotencyKey?.trim() || randomUUID();
    // Preserve the semantic distinction between an omitted selection (ALL) and
    // an explicitly selected list, and bind every request-affecting option.
    const selectionHash = createHash('sha256')
      .update(
        JSON.stringify({
          scope: selectedSet ? 'SELECTED' : 'ALL',
          selectedItemIds: selectedSet ? [...selectedSet].sort() : [],
          templateCode: template.code,
          templateVersion,
          sessionId: options?.sessionId ?? null,
          productPriceOverrides: options?.productPriceOverrides ?? null,
          overrideExisting: options?.overrideExisting ?? false,
          prefixSku: options?.prefixSku ?? null,
        }),
      )
      .digest('hex');

    try {
      return await this.dataSource.transaction(
        async (manager: EntityManager) => {
          const previous = await manager.findOne(TemplateApplication, {
            where: {
              tenant_id: trimmedTenant,
              idempotency_key: idempotencyKey,
            },
          });
          if (
            previous &&
            (previous.template_code !== template.code ||
              previous.template_version !== templateVersion ||
              previous.selection_hash !== selectionHash ||
              previous.onboarding_session_id !== (options?.sessionId ?? null))
          ) {
            throw new ConflictException(
              'Idempotency key was already used for a different template request',
            );
          }
          if (previous?.status === TemplateApplicationStatus.APPLIED) {
            return previous.summary_json as ApplyTemplateResult;
          }
          if (options?.sessionId) {
            const session = await manager.findOne(OnboardingSession, {
              where: { id: options.sessionId, tenantId: trimmedTenant },
            });
            if (!session) {
              throw new BadRequestException(
                'Onboarding session does not exist for this tenant',
              );
            }
          }

          const application = previous
            ? await manager.save(TemplateApplication, {
                ...previous,
                status: TemplateApplicationStatus.PLANNED,
                applied_by_user_id: actorUserId ?? null,
              })
            : await manager.save(
                TemplateApplication,
                manager.create(TemplateApplication, {
                  tenant_id: trimmedTenant,
                  template_code: template.code,
                  template_version: templateVersion,
                  selection_hash: selectionHash,
                  idempotency_key: idempotencyKey,
                  status: TemplateApplicationStatus.PLANNED,
                  onboarding_session_id: options?.sessionId ?? null,
                  applied_by_user_id: actorUserId ?? null,
                  applied_at: null,
                  summary_json: null,
                }),
              );

          const saveSeedLink = async (
            sourceItemId: string,
            sourceItemType: TemplateSourceItemType,
            targetEntityType: TemplateTargetEntityType,
            targetEntityId: string,
          ) => {
            const existing = await manager.findOne(TemplateSeedLink, {
              where: {
                tenant_id: trimmedTenant,
                template_code: template.code,
                source_item_id: sourceItemId,
                target_entity_type: targetEntityType,
              },
            });
            await manager.save(
              TemplateSeedLink,
              manager.create(TemplateSeedLink, {
                ...existing,
                tenant_id: trimmedTenant,
                template_code: template.code,
                source_item_id: sourceItemId,
                source_item_type: sourceItemType,
                target_entity_type: targetEntityType,
                target_entity_id: targetEntityId,
                first_applied_version:
                  existing?.first_applied_version ?? templateVersion,
                last_seen_version: templateVersion,
                last_applied_version: templateVersion,
                last_source_fingerprint: this.sourceFingerprint(template),
              }),
            );
          };

          let insumosCreated = 0;
          let insumosSkipped = 0;
          let productsCreated = 0;
          let productsSkipped = 0;
          let recipesCreated = 0;

          const insumoMap = new Map<string, Insumo>();
          for (const insumo of await manager.find(Insumo, {
            where: { tenant_id: trimmedTenant },
          }))
            insumoMap.set(insumo.name.trim().toLowerCase(), insumo);

          const requiredIngredientNames = new Set(
            (template.templateProducts ?? [])
              .filter((product) => isSelected(product.id))
              .flatMap((product) => product.recipeItems ?? [])
              .map((item) => item.template_insumo_name.trim().toLowerCase()),
          );
          const availableIngredientNames = new Set(
            (template.templateInsumos ?? []).map((ingredient) =>
              ingredient.name.trim().toLowerCase(),
            ),
          );
          for (const ingredientName of requiredIngredientNames) {
            if (!availableIngredientNames.has(ingredientName)) {
              throw new BadRequestException(
                `Template integrity error: recipe ingredient '${ingredientName}' is missing`,
              );
            }
          }

          for (const source of template.templateInsumos ?? []) {
            if (
              !isSelected(source.id) &&
              !requiredIngredientNames.has(source.name.trim().toLowerCase())
            )
              continue;
            const key = source.name.trim().toLowerCase();
            let insumo = insumoMap.get(key);
            if (insumo) {
              insumosSkipped++;
            } else {
              insumo = await manager.save(
                Insumo,
                manager.create(Insumo, {
                  tenant_id: trimmedTenant,
                  name: source.name.trim(),
                  purchaseUom: source.purchase_uom,
                  consumptionUom: source.consumption_uom,
                  conversionFactor: Number(source.conversion_factor || 1),
                  parLevel: source.par_level
                    ? Number(source.par_level)
                    : undefined,
                  minStock: source.min_stock
                    ? Number(source.min_stock)
                    : undefined,
                  is_perishable: source.is_perishable,
                  negativeStockPolicy: source.negative_stock_policy,
                  stock: 0,
                  existenciaActual: 0,
                  averageCost: 0,
                  is_active: true,
                }),
              );
              insumoMap.set(key, insumo);
              insumosCreated++;
              if (source.purchase_uom !== source.consumption_uom) {
                await manager.save(
                  UomConversion,
                  manager.create(UomConversion, {
                    tenant_id: trimmedTenant,
                    insumo_id: insumo.id,
                    unit_name: source.purchase_uom,
                    factor: Number(source.conversion_factor || 1),
                  }),
                );
              }
            }
            await saveSeedLink(
              source.id,
              TemplateSourceItemType.INGREDIENT,
              TemplateTargetEntityType.INSUMO,
              insumo.id,
            );
          }

          const productMap = new Map<string, Product>();
          for (const product of await manager.find(Product, {
            where: { tenant_id: trimmedTenant },
          }))
            productMap.set(product.name.trim().toLowerCase(), product);

          for (const source of template.templateProducts ?? []) {
            // A template product owns its pre-BOM; selecting it selects that recipe.
            if (!isSelected(source.id)) continue;
            const key = source.name.trim().toLowerCase();
            let product = productMap.get(key);
            if (product) {
              productsSkipped++;
            } else {
              product = await manager.save(
                Product,
                manager.create(Product, {
                  tenant_id: trimmedTenant,
                  name: source.name.trim(),
                  uom: source.uom ?? 'UN',
                  sellPrice: source.suggested_price
                    ? Number(source.suggested_price)
                    : 0,
                  averageCost: 0,
                  stock: 0,
                  is_perishable: source.is_perishable,
                  is_active: true,
                }),
              );
              productMap.set(key, product);
              productsCreated++;
            }
            await saveSeedLink(
              source.id,
              TemplateSourceItemType.PRODUCT,
              TemplateTargetEntityType.PRODUCT,
              product.id,
            );

            if (!source.recipeItems?.length) continue;
            const existingVersion = await manager.findOne(RecipeVersion, {
              where: { tenant_id: trimmedTenant, product_id: product.id },
            });
            // An existing tenant recipe is authoritative and must not be replaced.
            if (existingVersion) continue;

            const version = await manager.save(
              RecipeVersion,
              manager.create(RecipeVersion, {
                tenant_id: trimmedTenant,
                product_id: product.id,
                version_number: 1,
                is_active: false,
                fecha_inicio_vigencia: null,
                product_name: product.name,
                yield_quantity: 1,
                technical_shrink_pct: 0,
                origin: RecipeOrigin.INDUSTRY_TEMPLATE,
                publication_state: RecipePublicationState.DRAFT,
                suggestion_state: RecipeSuggestionState.SUGGESTED,
              }),
            );
            for (const item of source.recipeItems) {
              const insumo = insumoMap.get(
                item.template_insumo_name.trim().toLowerCase(),
              );
              if (!insumo) {
                throw new BadRequestException(
                  `Template integrity error: recipe ingredient '${item.template_insumo_name}' was not resolved`,
                );
              }
              const grossQuantity = Number(item.gross_quantity || 0);
              const shrinkPct = Number(item.technical_shrink_pct || 0);
              await manager.save(
                RecipeDetail,
                manager.create(RecipeDetail, {
                  tenant_id: trimmedTenant,
                  recipe_version_id: version.id,
                  insumo_id: insumo.id,
                  gross_quantity: round4(grossQuantity),
                  technical_shrink_pct: round4(shrinkPct),
                  quantity: round4(grossQuantity * (1 - shrinkPct / 100)),
                  ingredient_name: insumo.name,
                  ingredient_type: 'INSUMO',
                  component_uom: item.component_uom,
                }),
              );
            }
            await saveSeedLink(
              source.id,
              TemplateSourceItemType.RECIPE,
              TemplateTargetEntityType.RECIPE_VERSION,
              version.id,
            );
            recipesCreated++;
          }

          const result: ApplyTemplateResult = {
            tenantId: trimmedTenant,
            templateCode: template.code,
            templateVersion,
            applicationId: application.id,
            insumosCreated,
            insumosSkipped,
            productsCreated,
            productsSkipped,
            recipesCreated,
          };
          application.status = TemplateApplicationStatus.APPLIED;
          application.applied_at = new Date();
          application.summary_json = result;
          await manager.save(TemplateApplication, application);
          return result;
        },
      );
    } catch (error) {
      // A concurrent first use can win the unique key race. Re-read once so an
      // exact request receives its established application instead of a 500.
      if (!retryingIdempotency && this.isUniqueViolation(error)) {
        return this.applyTemplate(
          tenantId,
          templateCode,
          options,
          actorUserId,
          true,
        );
      }
      throw error;
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === '23505'
    );
  }

  private sourceFingerprint(template: IndustryTemplate): string {
    if (template.source_fingerprint) return template.source_fingerprint;
    return createHash('sha256')
      .update(
        JSON.stringify({
          code: template.code,
          version: template.version ?? 1,
          ingredients: (template.templateInsumos ?? [])
            .map((item) => [item.id, item.name])
            .sort(),
          products: (template.templateProducts ?? [])
            .map((item) => [
              item.id,
              item.name,
              (item.recipeItems ?? []).map((recipe) => [
                recipe.template_insumo_name,
                recipe.gross_quantity,
                recipe.technical_shrink_pct,
              ]),
            ])
            .sort(),
        }),
      )
      .digest('hex');
  }
}
