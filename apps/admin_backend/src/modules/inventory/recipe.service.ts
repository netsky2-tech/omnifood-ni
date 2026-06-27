import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { RecipeVersion } from './entities/recipe-version.entity';
import { RecipeDetail } from './entities/recipe-detail.entity';
import { Insumo } from './entities/insumo.entity';
import { Product } from './entities/product.entity';
import { UomConversion } from './entities/uom-conversion.entity';
import { SyncRecipeVersionDocumentDto } from './dto/sync-recipe-version-document.dto';
import { UomConversionCalculator } from './uom-conversion-calculator';

const SCALE_4 = 4;
const POSTGRES_UNIQUE_VIOLATION = '23505';
const round4 = (value: number): number => Number(value.toFixed(SCALE_4));

export interface RecipeComponentInput {
  insumoId: string;
  grossQuantity: number;
  technicalShrinkPct: number;
}

export interface IngestPosVersionInput {
  tenantId: string;
  dto: SyncRecipeVersionDocumentDto;
}

export interface IngestPosVersionResult {
  recipeVersionId: string;
  replaced: boolean;
}

interface ResolvedRecipeComponent {
  ingredientId: string;
  ingredientName: string;
  ingredientType: string;
  grossQuantity: number;
  grossQuantityInBase: number;
  technicalShrinkPct: number;
  componentUom: string | null;
  referenceVersionId: string | null;
}

interface PreparedRecipeVersionIngestion {
  tenantId: string;
  dto: SyncRecipeVersionDocumentDto;
  resolvedComponents: ResolvedRecipeComponent[];
  yieldQuantity: number;
  publishedAt: Date | null;
  posCreatedAt: Date | null;
}

interface QueryFailedDriverError {
  code?: string;
}

@Injectable()
export class RecipeService {
  constructor(
    @InjectRepository(RecipeVersion)
    private readonly recipeVersionRepo: Repository<RecipeVersion>,
    @InjectRepository(RecipeDetail)
    private readonly recipeDetailRepo: Repository<RecipeDetail>,
    @InjectRepository(Insumo)
    private readonly insumoRepo: Repository<Insumo>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(UomConversion)
    private readonly uomConversionRepo: Repository<UomConversion>,
    private readonly uomConversionCalculator: UomConversionCalculator,
    private readonly dataSource: DataSource,
  ) {}

  async createNewVersion(input: {
    tenantId: string;
    productId: string;
    components: RecipeComponentInput[];
    effectiveAt?: Date;
  }): Promise<RecipeVersion> {
    const activeVersion = await this.recipeVersionRepo.findOne({
      where: {
        tenant_id: input.tenantId,
        product_id: input.productId,
        is_active: true,
      },
      order: { version_number: 'DESC' },
    });

    if (activeVersion) {
      activeVersion.is_active = false;
      activeVersion.fecha_fin_vigencia = input.effectiveAt ?? new Date();
      await this.recipeVersionRepo.save(activeVersion);
    }

    const nextVersionNumber = activeVersion
      ? activeVersion.version_number + 1
      : 1;

    const version = this.recipeVersionRepo.create({
      tenant_id: input.tenantId,
      product_id: input.productId,
      version_number: nextVersionNumber,
      is_active: true,
      fecha_inicio_vigencia: input.effectiveAt ?? new Date(),
    });

    const savedVersion = await this.recipeVersionRepo.save(version);

    const details = input.components.map((component) => {
      const netUsableQuantity = round4(
        component.grossQuantity * (1 - component.technicalShrinkPct / 100),
      );

      return this.recipeDetailRepo.create({
        tenant_id: input.tenantId,
        recipe_version_id: savedVersion.id,
        insumo_id: component.insumoId,
        gross_quantity: round4(component.grossQuantity),
        technical_shrink_pct: round4(component.technicalShrinkPct),
        quantity: netUsableQuantity,
      });
    });

    await this.recipeDetailRepo.save(details);

    return savedVersion;
  }

  async findActiveVersion(
    tenantId: string,
    productId: string,
  ): Promise<RecipeVersion | null> {
    return this.recipeVersionRepo.findOne({
      where: {
        tenant_id: tenantId,
        product_id: productId,
        is_active: true,
      },
      order: { version_number: 'DESC' },
    });
  }

  async getSnapshot(
    recipeVersionId: string,
    tenantId: string,
    productId?: string,
  ): Promise<{
    recipeVersion: RecipeVersion;
    components: RecipeDetail[];
  }> {
    const recipeVersion = await this.recipeVersionRepo.findOne({
      where: { id: recipeVersionId, tenant_id: tenantId },
    });

    if (!recipeVersion) {
      throw new NotFoundException(
        `Recipe version ${recipeVersionId} not found`,
      );
    }

    if (productId && recipeVersion.product_id !== productId) {
      throw new BadRequestException(
        `Recipe version ${recipeVersionId} does not belong to product ${productId}`,
      );
    }

    const components = await this.recipeDetailRepo.find({
      where: {
        recipe_version_id: recipeVersion.id,
        tenant_id: tenantId,
      },
      order: { insumo_id: 'ASC' },
    });

    return { recipeVersion, components };
  }

  /**
   * Ingest a POS recipe-version document posted to
   * `POST /inventory/recipes/versions`.
   *
   * Scope (this cleanup slice):
   * - INSUMO components are persisted tenant-scoped. SUB_RECIPE components are
   *   rejected with `BadRequestException` (full multi-level versioned BOM
   *   ingestion is deferred — rejecting is the safe, non-corrupting choice).
   * - `componentUom` (when present) is validated against the insumo base
   *   consumption UOM or a registered positive conversion; incompatible or
   *   missing `componentUom` values are rejected to avoid silent stock-unit
   *   corruption.
   * - Idempotent by (tenant_id, pos_document_id): reposting the same document
   *   transactionally replaces the version snapshot + details without
   *   duplicating rows and without deleting prior versions (DGI/audit).
   * - `RecipeDetail.quantity` is normalized to per-sold-unit consumption
   *   `gross * (1 - shrink / 100) / yield` so `BomExplosionService.explode`
   *   (quantity * orderQuantity) yields the correct consumed stock.
   */
  async ingestPosVersion(
    input: IngestPosVersionInput,
  ): Promise<IngestPosVersionResult> {
    const { tenantId, dto } = input;

    if (!Number.isFinite(dto.yieldQuantity) || dto.yieldQuantity <= 0) {
      throw new BadRequestException('yieldQuantity must be > 0');
    }

    this.assertVersionShrink(dto.technicalShrinkPct, 'version');

    if (dto.components.length === 0) {
      throw new BadRequestException(
        'Recipe version requires at least one component',
      );
    }

    // Resolve INSUMO components + validate UOM before opening the transaction
    // so rejections are cheap and the transaction never stages invalid rows.
    await this.assertProductExistsForTenant(tenantId, dto.productId);
    const resolvedComponents = await this.resolveAndValidateComponents(
      tenantId,
      dto,
    );

    const preparedInput: PreparedRecipeVersionIngestion = {
      tenantId,
      dto,
      resolvedComponents,
      yieldQuantity: round4(dto.yieldQuantity),
      publishedAt: this.parseDate(dto.publishedAt),
      posCreatedAt: this.parseDate(dto.createdAt),
    };

    try {
      return await this.persistPosVersion(preparedInput);
    } catch (error) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }

      const existing = await this.recipeVersionRepo.findOne({
        where: {
          tenant_id: tenantId,
          pos_document_id: dto.id,
        },
      });

      if (!existing) {
        throw error;
      }

      if (existing.product_id !== dto.productId) {
        throw new BadRequestException(
          `Recipe version document ${dto.id} already exists for product ${existing.product_id}, not ${dto.productId}`,
        );
      }

      return this.persistPosVersion(preparedInput);
    }
  }

  private async persistPosVersion(
    input: PreparedRecipeVersionIngestion,
  ): Promise<IngestPosVersionResult> {
    const where: FindOptionsWhere<RecipeVersion> = {
      tenant_id: input.tenantId,
      pos_document_id: input.dto.id,
    };

    return this.dataSource.transaction(async (manager) => {
      await this.lockProductForVersionIngestion(
        manager,
        input.tenantId,
        input.dto.productId,
      );

      const existing = await manager.findOne(RecipeVersion, { where });

      if (existing) {
        return this.replaceExistingVersion(manager, existing, input);
      }

      return this.createFreshVersion(manager, input);
    });
  }

  private async lockProductForVersionIngestion(
    manager: EntityManager,
    tenantId: string,
    productId: string,
  ): Promise<void> {
    const lockedProduct = await manager
      .createQueryBuilder(Product, 'product')
      .setLock('pessimistic_write')
      .where('product.id = :productId', { productId })
      .andWhere('product.tenant_id = :tenantId', { tenantId })
      .getOne();

    if (!lockedProduct) {
      throw new BadRequestException(
        `Product ${productId} not found for tenant`,
      );
    }
  }

  private async replaceExistingVersion(
    manager: EntityManager,
    existing: RecipeVersion,
    input: PreparedRecipeVersionIngestion,
  ): Promise<IngestPosVersionResult> {
    if (existing.product_id !== input.dto.productId) {
      throw new BadRequestException(
        `Recipe version document ${input.dto.id} already exists for product ${existing.product_id}, not ${input.dto.productId}`,
      );
    }

    existing.product_name = input.dto.productName;
    existing.version_number = input.dto.versionNumber;
    existing.yield_quantity = input.yieldQuantity;
    existing.technical_shrink_pct = round4(input.dto.technicalShrinkPct);
    existing.version_note = input.dto.versionNote ?? null;
    existing.pos_created_at = input.posCreatedAt;
    existing.published_at = input.publishedAt;
    existing.fecha_inicio_vigencia =
      input.publishedAt ?? existing.fecha_inicio_vigencia ?? new Date();

    await manager.save(RecipeVersion, existing);
    await manager.delete(RecipeDetail, {
      recipe_version_id: existing.id,
      tenant_id: input.tenantId,
    });
    await this.saveRecipeDetails(manager, existing.id, input);

    return {
      recipeVersionId: existing.id,
      replaced: true,
    };
  }

  private async createFreshVersion(
    manager: EntityManager,
    input: PreparedRecipeVersionIngestion,
  ): Promise<IngestPosVersionResult> {
    const priorActive = await manager.findOne(RecipeVersion, {
      where: {
        tenant_id: input.tenantId,
        product_id: input.dto.productId,
        is_active: true,
      },
      order: { version_number: 'DESC' },
    });

    if (priorActive) {
      priorActive.is_active = false;
      priorActive.fecha_fin_vigencia = input.publishedAt ?? new Date();
      await manager.save(RecipeVersion, priorActive);
    }

    const created = manager.create(RecipeVersion, {
      tenant_id: input.tenantId,
      product_id: input.dto.productId,
      version_number: input.dto.versionNumber,
      is_active: true,
      fecha_inicio_vigencia: input.publishedAt ?? new Date(),
      pos_document_id: input.dto.id,
      product_name: input.dto.productName,
      yield_quantity: input.yieldQuantity,
      technical_shrink_pct: round4(input.dto.technicalShrinkPct),
      version_note: input.dto.versionNote ?? null,
      pos_created_at: input.posCreatedAt,
      published_at: input.publishedAt,
    });

    const saved = await manager.save(RecipeVersion, created);
    await this.saveRecipeDetails(manager, saved.id, input);

    return {
      recipeVersionId: saved.id,
      replaced: false,
    };
  }

  private async saveRecipeDetails(
    manager: EntityManager,
    recipeVersionId: string,
    input: PreparedRecipeVersionIngestion,
  ): Promise<void> {
    const details = input.resolvedComponents.map((component) =>
      manager.create(RecipeDetail, {
        tenant_id: input.tenantId,
        recipe_version_id: recipeVersionId,
        insumo_id: component.ingredientId,
        gross_quantity: round4(component.grossQuantity),
        technical_shrink_pct: round4(component.technicalShrinkPct),
        quantity: round4(
          (component.grossQuantityInBase *
            (1 - component.technicalShrinkPct / 100)) /
            input.yieldQuantity,
        ),
        ingredient_name: component.ingredientName,
        ingredient_type: component.ingredientType,
        component_uom: component.componentUom ?? null,
        reference_version_id: component.referenceVersionId ?? null,
      }),
    );

    await manager.save(RecipeDetail, details);
  }

  private assertVersionShrink(value: number, label: string): void {
    if (!Number.isFinite(value) || value < 0 || value >= 100) {
      throw new BadRequestException(
        `technicalShrinkPct for ${label} must be >= 0 and < 100`,
      );
    }
  }

  private parseDate(value: string | null | undefined): Date | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed;
  }

  private async assertProductExistsForTenant(
    tenantId: string,
    productId: string,
  ): Promise<void> {
    const product = await this.productRepo.findOne({
      where: { id: productId, tenant_id: tenantId },
      select: { id: true },
    });

    if (!product) {
      throw new BadRequestException(
        `Product ${productId} not found for tenant`,
      );
    }
  }

  private async resolveAndValidateComponents(
    tenantId: string,
    dto: SyncRecipeVersionDocumentDto,
  ): Promise<ResolvedRecipeComponent[]> {
    const resolved: ResolvedRecipeComponent[] = [];

    const seenIngredientIds = new Set<string>();

    for (const [index, component] of dto.components.entries()) {
      const label = `component[${index}]`;

      this.assertVersionShrink(component.technicalShrinkPct, label);
      if (
        !Number.isFinite(component.grossQuantity) ||
        component.grossQuantity <= 0
      ) {
        throw new BadRequestException(`grossQuantity for ${label} must be > 0`);
      }

      if (seenIngredientIds.has(component.ingredientId)) {
        throw new BadRequestException(
          `Duplicate ingredientId ${component.ingredientId} in recipe version`,
        );
      }
      seenIngredientIds.add(component.ingredientId);

      if (component.ingredientType === 'SUB_RECIPE') {
        // Multi-level versioned BOM ingestion is deferred; reject rather
        // than risk corrupting insumo lines with product references.
        throw new BadRequestException(
          `SUB_RECIPE components are not supported by this ingestion slice (${label}). Multi-level versioned BOM ingestion is deferred.`,
        );
      }

      const insumo = await this.insumoRepo.findOne({
        where: { id: component.ingredientId, tenant_id: tenantId },
      });

      if (!insumo) {
        throw new BadRequestException(
          `Insumo ${component.ingredientId} not found for tenant (component ${label})`,
        );
      }

      const componentUom = component.componentUom?.trim() || null;
      if (!componentUom) {
        throw new BadRequestException(
          `componentUom is required for INSUMO components (${label})`,
        );
      }

      const grossQuantityInBase = await this.resolveGrossQuantityInBase(
        insumo,
        componentUom,
        component.grossQuantity,
        label,
      );

      resolved.push({
        ingredientId: component.ingredientId,
        ingredientName: component.ingredientName,
        ingredientType: component.ingredientType,
        grossQuantity: component.grossQuantity,
        grossQuantityInBase,
        technicalShrinkPct: component.technicalShrinkPct,
        componentUom,
        referenceVersionId: component.referenceVersionId ?? null,
      });
    }

    return resolved;
  }

  private async resolveGrossQuantityInBase(
    insumo: Insumo,
    componentUom: string,
    grossQuantity: number,
    label: string,
  ): Promise<number> {
    if (componentUom === insumo.consumptionUom) {
      return round4(grossQuantity);
    }

    const conversion = await this.uomConversionRepo.findOne({
      where: {
        tenant_id: insumo.tenant_id,
        insumo_id: insumo.id,
        unit_name: componentUom,
      },
    });

    if (!conversion || conversion.factor <= 0) {
      throw new BadRequestException(
        `componentUom '${componentUom}' is not compatible with insumo '${insumo.name}' base consumption UOM '${insumo.consumptionUom}' (no positive conversion registered) (${label})`,
      );
    }

    return this.uomConversionCalculator.toInventoryBaseQuantity(
      grossQuantity,
      Number(conversion.factor),
    );
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverError = (
      error as QueryFailedError & { driverError?: QueryFailedDriverError }
    ).driverError;

    return driverError?.code === POSTGRES_UNIQUE_VIOLATION;
  }
}
