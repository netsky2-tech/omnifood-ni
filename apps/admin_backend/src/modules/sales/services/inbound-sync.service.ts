import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  Optional,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ProductInventoryMappingVersion } from '../../inventory/entities/product-inventory-mapping-version.entity';
import { ForensicAlert } from '../../inventory/entities/forensic-alert.entity';
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
  InboundSyncForensicAlertDto,
} from '../dto/inbound-sync.dto';
import {
  FiscalAckDto,
  FiscalConfigSnapshot,
} from '../../onboarding/dto/fiscal-config-version.dto';
import { FiscalConfigVersionService } from '../../onboarding/services/fiscal-config-version.service';
import type { DeviceSyncPrincipal } from '../../identity/security/device-sync-principal';
import { StaffPolicyEpochDeliveryService } from '../../identity/human-authorization/services/staff-policy-epoch-delivery.service';
import { StaffPolicyEpochAcknowledgementService } from '../../identity/human-authorization/services/staff-policy-epoch-acknowledgement.service';
import type { AcknowledgeStaffPolicyEpochDto } from '../dto/human-authorization-ack.dto';
import { parseHumanAuthorizationNegotiation } from '../dto/human-authorization-negotiation';
import type { HumanAuthorizationDeliveryDto } from '../dto/inbound-sync.dto';
import type { AcknowledgeStaffPolicyEpochResponseDto } from '../dto/human-authorization-ack.dto';

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
    @Optional()
    private readonly humanAuthorizationAcknowledgement?: StaffPolicyEpochAcknowledgementService,
  ) {}

  /**
   * Reads the inbound deltas for a tenant.
   *
   * When `entityManager` is supplied (a transaction-bound manager, e.g. from
   * `runInTenantTransaction`), every repository read below resolves through
   * that manager so the queries run on the transaction's own connection and
   * honor its transaction-local `app.tenant_id` RLS binding. For the
   * tenant-protected `products`, `insumos`, `recipes`, `recipe_versions`,
   * `recipe_details` and `users` tables the bound manager is mandatory
   * (issue #512 slice 1 part A for `products`/`insumos`, slice 2 part A for
   * the recipe tables, issue #581 for `users`): calls without one fail closed with a 500 instead of silently
   * reading through pooled repositories that lack the tenant binding.
   * Untenant-protected tables keep the pooled fallback.
   */
  async getInboundDeltas(
    tenantId: string,
    query: InboundSyncQueryDto,
    devicePrincipal?: DeviceSyncPrincipal,
    entityManager?: EntityManager,
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
        ? await this.fetchProductDeltas(tenantId, sinceDate, entityManager)
        : [],
      catalogValues:
        requestedTypes.has('catalogvalues') ||
        requestedTypes.has('catalog_values') ||
        requestedTypes.has('categories')
          ? await this.fetchCatalogValueDeltas(
              tenantId,
              sinceDate,
              entityManager,
            )
          : [],
      insumos: requestedTypes.has('insumos')
        ? await this.fetchInsumoDeltas(tenantId, sinceDate, entityManager)
        : [],
      recipes: requestedTypes.has('recipes')
        ? await this.fetchRecipeDeltas(tenantId, sinceDate, entityManager)
        : [],
      recipeVersions:
        requestedTypes.has('recipeversions') ||
        requestedTypes.has('recipe_versions')
          ? await this.fetchRecipeVersionDeltas(
              tenantId,
              sinceDate,
              now,
              entityManager,
            )
          : [],
      users: requestedTypes.has('users')
        ? await this.fetchUserDeltas(tenantId, sinceDate, entityManager)
        : [],
      alerts: requestedTypes.has('alerts')
        ? await this.fetchAlertDeltas(tenantId, sinceDate, entityManager)
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

  /**
   * Records a terminal's acknowledgement of an applied policy epoch (design
   * §5.3). The terminal and tenant come only from the authenticated device
   * principal, so a request body can never acknowledge on behalf of another
   * terminal or tenant.
   *
   * A rejection is answered as a conflict carrying its stable code rather
   * than a 200 with a rejection body: the acknowledgement did not happen, and
   * a terminal must be able to act on that without parsing prose. The code,
   * not the status, is what distinguishes the reasons.
   */
  async acknowledgeStaffPolicyEpoch(
    tenantId: string,
    devicePrincipal: DeviceSyncPrincipal,
    dto: AcknowledgeStaffPolicyEpochDto,
  ): Promise<AcknowledgeStaffPolicyEpochResponseDto> {
    if (!this.humanAuthorizationAcknowledgement) {
      throw new ConflictException({
        status: 'REJECTED',
        resultCode: 'UNAVAILABLE',
        sequence: dto.sequence,
      });
    }
    const outcome = await this.humanAuthorizationAcknowledgement.acknowledge({
      tenantId,
      terminalId: devicePrincipal.deviceId,
      posBuild: dto.posBuild,
      assertionSchema: dto.assertionSchema,
      idempotencyKey: dto.idempotencyKey,
      claim: {
        sequence: dto.sequence,
        digest: dto.digest,
        previousSequence: dto.previousSequence,
        previousDigest: dto.previousDigest,
      },
    });

    if (outcome.status === 'rejected') {
      throw new ConflictException({
        status: 'REJECTED',
        resultCode: outcome.resultCode,
        sequence: outcome.sequence,
      });
    }
    return {
      status: 'ACCEPTED',
      receiptId: outcome.receipt.receiptId,
      sequence: outcome.receipt.sequence,
      digest: outcome.receipt.digest,
      floorSequence: outcome.receipt.floorSequence,
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
        'alerts',
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
    entityManager?: EntityManager,
  ): Promise<InboundSyncProductDto[]> {
    // Issue #512 slice 1 part A: `products` is tenant-protected, so the read
    // must ride a tenant-bound transaction manager. All production callers
    // (device-credential inbound controllers and terminal priming) supply
    // one; failing closed beats silently reading through a pooled,
    // unbound connection.
    if (!entityManager) {
      throw new InternalServerErrorException(
        'Inbound product sync requires a tenant-bound transaction manager (app.tenant_id binding)',
      );
    }
    const productRepository = entityManager.getRepository(Product);
    const qb = productRepository
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
    // The mapping-version read follows the same availability rule as before:
    // when a mapping repository is configured, the read rides the bound
    // transaction connection. The old session-scoped set_config workaround
    // against the pooled manager is gone — the pooled fallback no longer
    // exists for this table.
    const mappingVersionRepository = this.mappingVersionRepository
      ? entityManager.getRepository(ProductInventoryMappingVersion)
      : undefined;
    const mappings = mappingVersionRepository
      ? await mappingVersionRepository
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
    entityManager?: EntityManager,
  ): Promise<InboundSyncCatalogValueDto[]> {
    const catalogValueRepository =
      entityManager?.getRepository(CatalogValue) ?? this.catalogValueRepository;
    const qb = catalogValueRepository
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
    entityManager?: EntityManager,
  ): Promise<InboundSyncInsumoDto[]> {
    // Issue #512 slice 1 part A: `insumos` is tenant-protected — require the
    // bound manager, same as fetchProductDeltas.
    if (!entityManager) {
      throw new InternalServerErrorException(
        'Inbound insumo sync requires a tenant-bound transaction manager (app.tenant_id binding)',
      );
    }
    const insumoRepository = entityManager.getRepository(Insumo);
    const qb = insumoRepository
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
    entityManager?: EntityManager,
  ): Promise<InboundSyncRecipeDto[]> {
    // Issue #512 slice 2 part A: `recipes` is tenant-protected — require the
    // bound manager, same as fetchProductDeltas. A missing manager fails
    // closed with a 500 instead of silently reading through a pooled,
    // unbound connection (under FORCE RLS an unbound read would return
    // nothing instead of failing loudly).
    if (!entityManager) {
      throw new InternalServerErrorException(
        'Inbound recipe sync requires a tenant-bound transaction manager (app.tenant_id binding)',
      );
    }
    const recipeRepository = entityManager.getRepository(Recipe);
    const qb = recipeRepository
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
    entityManager?: EntityManager,
  ): Promise<InboundSyncRecipeVersionDto[]> {
    // Issue #512 slice 2 part A: `recipe_versions` (and the `recipe_details`
    // component read inside this fetch) are tenant-protected — require the
    // bound manager, same as fetchProductDeltas. A missing manager fails
    // closed before any SQL instead of silently reading through pooled,
    // unbound repositories.
    if (!entityManager) {
      throw new InternalServerErrorException(
        'Inbound recipe version sync requires a tenant-bound transaction manager (app.tenant_id binding)',
      );
    }
    const recipeVersionRepository = entityManager.getRepository(RecipeVersion);
    // The insumo join read is tenant-protected too: it rides the same bound
    // manager, now that one is mandatory for this fetch.
    const insumoRepository = entityManager.getRepository(Insumo);
    const qb = recipeVersionRepository
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
    const recipeDetailRepository = entityManager.getRepository(RecipeDetail);
    const components = versionIds.length
      ? await recipeDetailRepository
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
      const componentInsumos = await insumoRepository
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

  /**
   * One-way cloud-to-POS projection of `forensic_alerts` (ST-05, issue #314).
   * The table carries a tenant RLS policy (issue #512 T3 slice 7) and no
   * `updated_at`, so tenant isolation comes from the bound transaction, the
   * explicit `tenant_id` predicate, and the incremental cursor is
   * `created_at` alone. The read must ride the bound
   * transaction manager: without one there is no repository to read through
   * (the entity is deliberately not registered forFeature — no module owns
   * it), and an unbound pooled read would bypass tenant isolation. Every
   * production caller (inbound controller, terminal priming) supplies one.
   * Lifecycle state is reported, never fabricated: `resolved_at` is handed
   * over verbatim for the terminal to derive status from.
   */
  private async fetchAlertDeltas(
    tenantId: string,
    sinceDate: Date | null,
    entityManager?: EntityManager,
  ): Promise<InboundSyncForensicAlertDto[]> {
    if (!entityManager) {
      return [];
    }
    const forensicAlertRepository = entityManager.getRepository(ForensicAlert);
    const qb = forensicAlertRepository
      .createQueryBuilder('alert')
      .where('alert.tenant_id = :tenantId', { tenantId });

    if (sinceDate) {
      // Inclusive on purpose: the terminal applies each delta insert-if-absent,
      // so an alert already delivered re-inserts nothing and overlap is
      // idempotent, while a strict comparison would silently drop an alert
      // created exactly at the watermark. Other delta types keep their own
      // cursor semantics; this applies to alerts only.
      qb.andWhere('alert.created_at >= :sinceDate', { sinceDate });
    }

    const items = await qb.getMany();
    return items.map((a) => ({
      id: a.id,
      alertType: a.alert_type,
      severity: a.severity,
      message: a.message,
      actorRole: a.actor_role ?? null,
      resolvedAt: a.resolved_at ?? null,
      createdAt: a.created_at,
    }));
  }

  private async fetchUserDeltas(
    tenantId: string,
    sinceDate: Date | null,
    entityManager?: EntityManager,
  ): Promise<InboundSyncUserDto[]> {
    // Issue #581: `users` is a direct:SIUD RLS-forced table, so the read
    // must ride a tenant-bound transaction manager, same as
    // fetchProductDeltas. All production callers (the inbound controller's
    // runInTenantTransaction handler and terminal priming) supply one;
    // failing closed beats silently reading through a pooled, unbound
    // connection that returns zero rows under a NOBYPASSRLS role.
    if (!entityManager) {
      throw new InternalServerErrorException(
        'Inbound user sync requires a tenant-bound transaction manager (app.tenant_id binding)',
      );
    }
    const userRepository = entityManager.getRepository(User);
    const qb = userRepository
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
