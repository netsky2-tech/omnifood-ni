import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductInventoryMappingVersion } from '../../inventory/entities/product-inventory-mapping-version.entity';
import { Product } from '../../inventory/entities/product.entity';
import { CatalogValue } from '../../catalog/entities/catalog-value.entity';
import { Insumo } from '../../inventory/entities/insumo.entity';
import { Recipe } from '../../inventory/entities/recipe.entity';
import {
  RecipeOrigin,
  RecipePublicationState,
  RecipeSuggestionState,
  RecipeVersion,
} from '../../inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../../inventory/entities/recipe-detail.entity';
import { User } from '../../identity/entities/user.entity';
import {
  InboundSyncQueryDto,
  InboundSyncResponseDto,
  InboundSyncDeltasDto,
  InboundSyncProductDto,
  InboundSyncCatalogValueDto,
  InboundSyncInsumoDto,
  InboundSyncRecipeDto,
  InboundSyncRecipeVersionDto,
  InboundSyncUserDto,
} from '../dto/inbound-sync.dto';
import {
  FiscalAckDto,
  FiscalConfigSnapshot,
} from '../../onboarding/dto/fiscal-config-version.dto';
import { FiscalConfigVersionService } from '../../onboarding/services/fiscal-config-version.service';
import { bindTenantContext } from '../../../core/database/tenant-transaction';
import type { DeviceSyncPrincipal } from '../../identity/security/device-sync-principal';
import { StaffPolicyEpochDeliveryService } from '../../identity/human-authorization/services/staff-policy-epoch-delivery.service';
import { parseHumanAuthorizationNegotiation } from '../dto/human-authorization-negotiation';
import type { HumanAuthorizationDeliveryDto } from '../dto/inbound-sync.dto';

@Injectable()
export class InboundSyncService {
  private readonly logger = new Logger(InboundSyncService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(CatalogValue)
    private readonly catalogValueRepository: Repository<CatalogValue>,
    @InjectRepository(Insumo)
    private readonly insumoRepository: Repository<Insumo>,
    @InjectRepository(Recipe)
    private readonly recipeRepository: Repository<Recipe>,
    @InjectRepository(RecipeVersion)
    private readonly recipeVersionRepository: Repository<RecipeVersion>,
    @InjectRepository(RecipeDetail)
    private readonly recipeDetailRepository: Repository<RecipeDetail>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @Optional()
    @Inject(forwardRef(() => FiscalConfigVersionService))
    private readonly fiscalConfigVersionService?: FiscalConfigVersionService,
    @Optional()
    @InjectRepository(ProductInventoryMappingVersion)
    private readonly mappingVersionRepository?: Repository<ProductInventoryMappingVersion>,
    /**
     * OHAC delivery negotiation (design §11.4 decision 24). The epoch read
     * stays owned by the human-authorization module, which is why this
     * service delegates instead of querying epochs itself, and it is optional
     * so the pull keeps working in compositions that do not wire OHAC.
     */
    @Optional()
    private readonly humanAuthorizationDelivery?: StaffPolicyEpochDeliveryService,
  ) {}

  async getInboundDeltas(
    tenantId: string,
    query: InboundSyncQueryDto,
    devicePrincipal?: DeviceSyncPrincipal,
  ): Promise<InboundSyncResponseDto> {
    if (!tenantId?.trim()) {
      throw new UnauthorizedException('Tenant ID is required for sync');
    }

    const now = new Date();
    const sinceDate = this.parseSinceDate(query.since, query.sinceVersion);
    const requestedTypes = this.parseRequestedTypes(query.types);

    const includeFiscal =
      requestedTypes.has('fiscal') ||
      requestedTypes.has('fiscal_config') ||
      requestedTypes.has('fiscalconfig') ||
      requestedTypes.has('config');

    let fiscalConfig: FiscalConfigSnapshot | null = null;
    if (includeFiscal && this.fiscalConfigVersionService) {
      try {
        fiscalConfig =
          await this.fiscalConfigVersionService.getFiscalConfigSnapshot(
            tenantId,
          );
      } catch (error) {
        this.logger.warn(
          `Failed to fetch fiscal config snapshot for tenant ${tenantId}: ${error instanceof Error ? error.message : String(error)}`,
        );
        fiscalConfig = null;
      }
    }

    const deltas: InboundSyncDeltasDto = {
      products: requestedTypes.has('products')
        ? await this.fetchProductDeltas(tenantId, sinceDate)
        : [],
      catalogValues:
        requestedTypes.has('catalogvalues') ||
        requestedTypes.has('catalog_values') ||
        requestedTypes.has('categories')
          ? await this.fetchCatalogValueDeltas(tenantId, sinceDate)
          : [],
      insumos: requestedTypes.has('insumos')
        ? await this.fetchInsumoDeltas(tenantId, sinceDate)
        : [],
      recipes: requestedTypes.has('recipes')
        ? await this.fetchRecipeDeltas(tenantId, sinceDate)
        : [],
      recipeVersions:
        requestedTypes.has('recipeversions') ||
        requestedTypes.has('recipe_versions')
          ? await this.fetchRecipeVersionDeltas(tenantId, sinceDate, now)
          : [],
      users: requestedTypes.has('users')
        ? await this.fetchUserDeltas(tenantId, sinceDate)
        : [],
      fiscalConfig,
    };

    const humanAuthorization = await this.resolveHumanAuthorization(
      tenantId,
      query,
      devicePrincipal,
    );

    return {
      status: 'success',
      serverTime: now.toISOString(),
      currentVersion: now.getTime(),
      deltas,
      fiscalConfig,
      ...(humanAuthorization === undefined ? {} : { humanAuthorization }),
    };
  }

  /**
   * Resolves what this pull answers about the staff policy epoch. The
   * terminal identity comes only from the authenticated device principal,
   * never from the query or the body, because the principal is the canonical
   * enrolled terminal the epoch chain is bound to (design §4.1 rule 2).
   *
   * Nothing is caught here on purpose: an integrity failure must fail the
   * pull closed rather than return a response that would let a terminal treat
   * a corrupt policy as current.
   */
  private async resolveHumanAuthorization(
    tenantId: string,
    query: InboundSyncQueryDto,
    devicePrincipal?: DeviceSyncPrincipal,
  ): Promise<HumanAuthorizationDeliveryDto | undefined> {
    if (!this.humanAuthorizationDelivery || !devicePrincipal) {
      return undefined;
    }
    const negotiation = parseHumanAuthorizationNegotiation(query);
    const result = await this.humanAuthorizationDelivery.negotiate({
      tenantId,
      terminalId: devicePrincipal.deviceId,
      ...negotiation,
    });
    switch (result.result) {
      case 'not-participating':
        // A legacy client: silence is the whole contract here.
        return undefined;
      case 'up-to-date':
        // Current, and the client knows its own floor; an empty epoch would
        // be indistinguishable from a policy to apply.
        return undefined;
      case 'status':
        return { status: result.status };
      case 'deliver':
        return {
          status: 'DELIVER',
          epoch: result.epoch as unknown as Record<string, unknown>,
          sequence: result.sequence,
          digest: result.digest,
        };
    }
  }

  async recordFiscalAck(
    tenantId: string,
    dto: FiscalAckDto,
  ): Promise<{
    status: string;
    acknowledgedRevision: number;
    acknowledgedFingerprint: string;
  }> {
    if (dto.tenantId && dto.tenantId.trim() !== tenantId.trim()) {
      throw new BadRequestException(
        'tenantId in payload does not match auth context',
      );
    }
    if (this.fiscalConfigVersionService) {
      await this.fiscalConfigVersionService.validateIntegrity(
        tenantId,
        dto.revision,
        dto.fingerprint,
      );
    }
    return {
      status: 'success',
      acknowledgedRevision: dto.revision,
      acknowledgedFingerprint: dto.fingerprint,
    };
  }

  private parseSinceDate(since?: string, sinceVersion?: string): Date | null {
    const candidate = sinceVersion || since;
    if (!candidate || candidate.trim() === '') {
      return null;
    }
    const numeric = Number(candidate);
    if (!isNaN(numeric) && numeric > 0) {
      const date = new Date(numeric);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
    const date = new Date(candidate);
    if (!isNaN(date.getTime())) {
      return date;
    }
    return null;
  }

  private parseRequestedTypes(types?: string): Set<string> {
    if (!types || types.trim() === '') {
      return new Set([
        'products',
        'catalogvalues',
        'catalog_values',
        'categories',
        'insumos',
        'recipes',
        'recipeversions',
        'recipe_versions',
        'users',
        'fiscal',
        'fiscal_config',
        'fiscalconfig',
      ]);
    }
    const tokens = types
      .toLowerCase()
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    return new Set(tokens);
  }

  private async fetchProductDeltas(
    tenantId: string,
    sinceDate: Date | null,
  ): Promise<InboundSyncProductDto[]> {
    const qb = this.productRepository
      .createQueryBuilder('product')
      .where('product.tenant_id = :tenantId', { tenantId });

    if (sinceDate) {
      // Mapping supersession is a catalog change even when the product row is untouched.
      qb.andWhere(
        `(product.updated_at > :sinceDate OR EXISTS (
        SELECT 1 FROM product_inventory_mapping_versions mapping_cursor
        WHERE mapping_cursor.tenant_id = product.tenant_id
          AND mapping_cursor.product_id = product.id
          AND (mapping_cursor.created_at > :sinceDate OR mapping_cursor.effective_at > :sinceDate OR mapping_cursor.superseded_at > :sinceDate)
      ))`,
        { sinceDate },
      );
    }

    const items = await qb.getMany();
    const now = new Date();
    if (this.mappingVersionRepository?.manager) {
      try {
        await bindTenantContext(
          this.mappingVersionRepository.manager,
          tenantId,
        );
      } catch (error) {
        this.logger.debug(
          `Could not set tenant session config for mapping versions: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    const mappings = this.mappingVersionRepository
      ? await this.mappingVersionRepository
          .createQueryBuilder('m')
          .where('m.tenant_id = :tenantId', { tenantId })
          .andWhere('m.effective_at <= :now', { now })
          .andWhere('(m.superseded_at IS NULL OR m.superseded_at > :now)', {
            now,
          })
          .orderBy('m.effective_at', 'DESC')
          .getMany()
      : [];
    const mappingByProductId = new Map(mappings.map((m) => [m.product_id, m]));

    return items.map((p) => {
      const mapping = mappingByProductId.get(p.id);
      return {
        id: p.id,
        name: p.name,
        uom: p.uom,
        stock: Number(p.stock),
        averageCost: Number(p.averageCost),
        sellPrice: Number(p.sellPrice),
        isActive: p.is_active,
        isPerishable: p.is_perishable,
        warehouseId: p.warehouse_id ?? null,
        productType: p.product_type,
        mappingVersionId: mapping ? mapping.id : null,
        insumoId: mapping ? mapping.insumo_id : null,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
        tenantId: p.tenant_id,
      };
    });
  }

  private async fetchCatalogValueDeltas(
    tenantId: string,
    sinceDate: Date | null,
  ): Promise<InboundSyncCatalogValueDto[]> {
    const qb = this.catalogValueRepository
      .createQueryBuilder('catalog')
      .where('catalog.tenant_id = :tenantId', { tenantId });

    if (sinceDate) {
      qb.andWhere('catalog.updated_at > :sinceDate', { sinceDate });
    }

    const items = await qb.getMany();
    return items.map((c) => ({
      id: c.id,
      catalogType: c.catalog_type,
      code: c.code,
      name: c.name,
      description: c.description ?? null,
      isActive: c.is_active,
      sortOrder: c.sort_order,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    }));
  }

  private async fetchInsumoDeltas(
    tenantId: string,
    sinceDate: Date | null,
  ): Promise<InboundSyncInsumoDto[]> {
    const qb = this.insumoRepository
      .createQueryBuilder('insumo')
      .where('insumo.tenant_id = :tenantId', { tenantId });

    if (sinceDate) {
      qb.andWhere('insumo.updated_at > :sinceDate', { sinceDate });
    }

    const items = await qb.getMany();
    return items.map((i) => ({
      id: i.id,
      name: i.name,
      purchaseUom: i.purchaseUom,
      consumptionUom: i.consumptionUom,
      conversionFactor: Number(i.conversionFactor),
      stock: Number(i.stock),
      averageCost: Number(i.averageCost),
      isActive: i.is_active,
      isPerishable: i.is_perishable,
      negativeStockPolicy: i.negativeStockPolicy,
      tenantId: i.tenant_id,
      createdAt: i.created_at,
      updatedAt: i.updated_at,
    }));
  }

  private async fetchRecipeDeltas(
    tenantId: string,
    sinceDate: Date | null,
  ): Promise<InboundSyncRecipeDto[]> {
    const qb = this.recipeRepository
      .createQueryBuilder('recipe')
      .where('recipe.tenant_id = :tenantId', { tenantId });

    if (sinceDate) {
      qb.andWhere('recipe.updated_at > :sinceDate', { sinceDate });
    }

    const items = await qb.getMany();
    return items.map((r) => ({
      id: r.id,
      productId: r.productId,
      ingredientId: r.ingredientId,
      ingredientType: r.ingredientType,
      quantity: Number(r.quantity),
      tenantId: r.tenant_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  private async fetchRecipeVersionDeltas(
    tenantId: string,
    sinceDate: Date | null,
    now: Date,
  ): Promise<InboundSyncRecipeVersionDto[]> {
    const qb = this.recipeVersionRepository
      .createQueryBuilder('rv')
      .where('rv.tenant_id = :tenantId', { tenantId })
      .andWhere('rv.is_active = true')
      .andWhere('rv.publication_state = :publicationState', {
        publicationState: RecipePublicationState.PUBLISHED,
      })
      .andWhere('rv.fecha_inicio_vigencia <= :now', { now })
      .andWhere(
        '(rv.fecha_fin_vigencia IS NULL OR rv.fecha_fin_vigencia > :now)',
        {
          now,
        },
      );

    if (sinceDate) {
      qb.andWhere(
        '(rv.created_at > :sinceDate OR rv.published_at > :sinceDate OR rv.fecha_inicio_vigencia > :sinceDate)',
        { sinceDate },
      );
    }

    const items = await qb.getMany();
    const productIds = new Set<string>();
    for (const version of items) {
      if (productIds.has(version.product_id)) {
        throw new BadRequestException(
          'Ambiguous effective recipe versions are not eligible for inbound sync',
        );
      }
      productIds.add(version.product_id);
    }

    const versionIds = items.map((rv) => rv.id);
    const versionIdSet = new Set(versionIds);
    const components = versionIds.length
      ? await this.recipeDetailRepository
          .createQueryBuilder('detail')
          .where('detail.recipe_version_id IN (:...versionIds)', {
            versionIds,
          })
          .getMany()
      : [];
    const componentsByVersionId = new Map<string, RecipeDetail[]>();
    for (const component of components) {
      if (
        component.tenant_id !== tenantId ||
        !versionIdSet.has(component.recipe_version_id)
      ) {
        throw new BadRequestException(
          'Foreign recipe version component is not eligible for inbound sync',
        );
      }
      const matching =
        componentsByVersionId.get(component.recipe_version_id) ?? [];
      matching.push(component);
      componentsByVersionId.set(component.recipe_version_id, matching);
    }

    const componentInsumoIds = [
      ...new Set(components.map((component) => component.insumo_id)),
    ];
    if (componentInsumoIds.length) {
      const componentInsumos = await this.insumoRepository
        .createQueryBuilder('componentInsumo')
        .where('componentInsumo.tenant_id = :tenantId', { tenantId })
        .andWhere('componentInsumo.id IN (:...componentInsumoIds)', {
          componentInsumoIds,
        })
        .getMany();
      const eligibleInsumoIds = new Set(
        componentInsumos
          .filter((insumo) => insumo.tenant_id === tenantId)
          .map((insumo) => insumo.id),
      );
      if (componentInsumoIds.some((id) => !eligibleInsumoIds.has(id))) {
        throw new BadRequestException(
          'Recipe version component insumo is not eligible for inbound sync',
        );
      }
    }

    return items.map((rv) => ({
      id: rv.id,
      // Components link to this immutable identity, never to a mutable Recipe row.
      recipeVersionId: rv.id,
      tenantId: rv.tenant_id,
      productId: rv.product_id,
      recipeDocumentId: rv.pos_document_id ?? null,
      productName: rv.product_name ?? null,
      versionNumber: rv.version_number,
      isActive: rv.is_active,
      publicationState: RecipePublicationState.PUBLISHED,
      effectiveAt: rv.fecha_inicio_vigencia,
      effectiveUntil: rv.fecha_fin_vigencia ?? null,
      yieldQuantity: Number(rv.yield_quantity),
      technicalShrinkPct: Number(rv.technical_shrink_pct),
      versionNote: rv.version_note ?? null,
      publishedAt: rv.published_at ?? null,
      posCreatedAt: rv.pos_created_at ?? null,
      origin: rv.origin ?? RecipeOrigin.MANUAL,
      suggestionState: rv.suggestion_state ?? RecipeSuggestionState.CONFIRMED,
      createdAt: rv.created_at,
      components: (componentsByVersionId.get(rv.id) ?? [])
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((detail, componentOrdinal) => ({
          id: detail.id,
          tenantId: detail.tenant_id,
          recipeVersionId: detail.recipe_version_id,
          componentOrdinal,
          insumoId: detail.insumo_id,
          quantityPerSaleUnit: Number(detail.quantity),
          grossQuantity: Number(detail.gross_quantity),
          technicalShrinkPct: Number(detail.technical_shrink_pct),
          ingredientName: detail.ingredient_name ?? null,
          ingredientType: detail.ingredient_type,
          componentUom: detail.component_uom ?? null,
          referenceVersionId: detail.reference_version_id ?? null,
        })),
    }));
  }

  private async fetchUserDeltas(
    tenantId: string,
    sinceDate: Date | null,
  ): Promise<InboundSyncUserDto[]> {
    const qb = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.security_profile', 'security_profile')
      .addSelect('security_profile.pin_hash')
      .where('user.tenant_id = :tenantId', { tenantId });

    if (sinceDate) {
      qb.andWhere(
        '(user.updated_at > :sinceDate OR security_profile.updated_at > :sinceDate)',
        { sinceDate },
      );
    }

    const items = await qb.getMany();
    return items.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email ?? null,
      role: u.role,
      isActive: u.is_active,
      createdAt: u.created_at,
      updatedAt: u.updated_at,
      securityProfile: u.security_profile
        ? {
            isPinEnabled: u.security_profile.is_pin_enabled,
            isTotpEnabled: u.security_profile.is_totp_enabled,
            pinHash: u.security_profile.pin_hash ?? null,
          }
        : null,
    }));
  }
}
