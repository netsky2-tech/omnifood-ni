import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../../inventory/entities/product.entity';
import { CatalogValue } from '../../catalog/entities/catalog-value.entity';
import { Insumo } from '../../inventory/entities/insumo.entity';
import { Recipe } from '../../inventory/entities/recipe.entity';
import { RecipeVersion } from '../../inventory/entities/recipe-version.entity';
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

@Injectable()
export class InboundSyncService {
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
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @Optional()
    @Inject(forwardRef(() => FiscalConfigVersionService))
    private readonly fiscalConfigVersionService?: FiscalConfigVersionService,
  ) {}

  async getInboundDeltas(
    tenantId: string,
    query: InboundSyncQueryDto,
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
      } catch (_err) {
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
          ? await this.fetchRecipeVersionDeltas(tenantId, sinceDate)
          : [],
      users: requestedTypes.has('users')
        ? await this.fetchUserDeltas(tenantId, sinceDate)
        : [],
      fiscalConfig,
    };

    return {
      status: 'success',
      serverTime: now.toISOString(),
      currentVersion: now.getTime(),
      deltas,
      fiscalConfig,
    };
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
      qb.andWhere('product.updated_at > :sinceDate', { sinceDate });
    }

    const items = await qb.getMany();
    return items.map((p) => ({
      id: p.id,
      name: p.name,
      uom: p.uom,
      stock: Number(p.stock),
      averageCost: Number(p.averageCost),
      sellPrice: Number(p.sellPrice),
      isActive: p.is_active,
      isPerishable: p.is_perishable,
      warehouseId: p.warehouse_id ?? null,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      tenantId: p.tenant_id,
    }));
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
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  private async fetchRecipeVersionDeltas(
    tenantId: string,
    sinceDate: Date | null,
  ): Promise<InboundSyncRecipeVersionDto[]> {
    const qb = this.recipeVersionRepository
      .createQueryBuilder('rv')
      .where('rv.tenant_id = :tenantId', { tenantId });

    if (sinceDate) {
      qb.andWhere('rv.created_at > :sinceDate', { sinceDate });
    }

    const items = await qb.getMany();
    return items.map((rv) => ({
      id: rv.id,
      productId: rv.product_id,
      versionNumber: rv.version_number,
      isActive: rv.is_active,
      yieldQuantity: Number(rv.yield_quantity),
      technicalShrinkPct: Number(rv.technical_shrink_pct),
      versionNote: rv.version_note ?? null,
      publishedAt: rv.published_at ?? null,
      createdAt: rv.created_at,
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
