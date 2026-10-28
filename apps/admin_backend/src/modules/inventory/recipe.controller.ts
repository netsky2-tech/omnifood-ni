import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { RecipeService } from './recipe.service';
import { CreateRecipeVersionDto } from './dto/create-recipe-version.dto';
import {
  ActiveRecipeSummaryResponseDto,
  RecipeSuggestionListItemDto,
  RecipeVersionSnapshotResponseDto,
} from './dto/recipe-version-response.dto';
import { TheoreticalCostService } from './services/theoretical-cost.service';
import { RecipeVersion } from './entities/recipe-version.entity';
import { RecipeDetail } from './entities/recipe-detail.entity';
import { GetTenantId } from '../../core/decorators/tenant.decorator';
import { TenantInterceptor } from '../../core/database/rls.interceptor';
import { AuthGuard } from '../identity/guards/auth.guard';
import { AuthoritativeCurrentUserGuard } from '../identity/guards/authoritative-current-user.guard';
import { RolesGuard } from '../identity/guards/roles.guard';
import { Roles } from '../../core/decorators/roles.decorator';
import { UserRole } from '../identity/entities/user.entity';

@Controller('recipes')
@UseInterceptors(TenantInterceptor)
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.MANAGER)
export class RecipeController {
  constructor(
    private readonly recipeService: RecipeService,
    private readonly theoreticalCostService: TheoreticalCostService,
  ) {}

  private requireTenant(tenantId?: string): string {
    if (!tenantId) {
      throw new Error('Tenant context is required');
    }
    return tenantId;
  }

  private mapSnapshotToResponse(snapshot: {
    recipeVersion: RecipeVersion;
    components: RecipeDetail[];
  }): RecipeVersionSnapshotResponseDto {
    return {
      recipeVersion: {
        id: snapshot.recipeVersion.id,
        tenant_id: snapshot.recipeVersion.tenant_id,
        product_id: snapshot.recipeVersion.product_id,
        version_number: snapshot.recipeVersion.version_number,
        is_active: snapshot.recipeVersion.is_active,
        fecha_inicio_vigencia: snapshot.recipeVersion.fecha_inicio_vigencia,
        fecha_fin_vigencia: snapshot.recipeVersion.fecha_fin_vigencia,
        pos_document_id: snapshot.recipeVersion.pos_document_id,
        product_name: snapshot.recipeVersion.product_name,
        yield_quantity: Number(snapshot.recipeVersion.yield_quantity),
        technical_shrink_pct: Number(
          snapshot.recipeVersion.technical_shrink_pct,
        ),
        version_note: snapshot.recipeVersion.version_note,
        pos_created_at: snapshot.recipeVersion.pos_created_at,
        published_at: snapshot.recipeVersion.published_at,
        created_at: snapshot.recipeVersion.created_at,
      },
      components: snapshot.components.map((c) => ({
        id: c.id,
        tenant_id: c.tenant_id,
        recipe_version_id: c.recipe_version_id,
        insumo_id: c.insumo_id,
        quantity: Number(c.quantity),
        gross_quantity: Number(c.gross_quantity),
        technical_shrink_pct: Number(c.technical_shrink_pct),
        ingredient_name: c.ingredient_name,
        ingredient_type: c.ingredient_type,
        component_uom: c.component_uom,
        reference_version_id: c.reference_version_id,
      })),
    };
  }

  /**
   * Round-2 §17.6 slice S3: the governed surface behind the SUB_RECIPE
   * "Versión de Referencia" selector. Before this route the form asked the
   * operator to TYPE a version UUID (the last entry in the no-uuid-inputs
   * exception ledger); a selector over an unfetchable entity would have been
   * fake. Selected columns only.
   */
  @Get('products/:productId/versions')
  async listProductVersions(
    @Param('productId') productId: string,
    @GetTenantId() tenantId?: string,
  ): Promise<
    Array<{
      id: string;
      version_number: number;
      is_active: boolean;
      version_note: string | null;
      fecha_inicio_vigencia: Date | null;
      fecha_fin_vigencia: Date | null;
      published_at: Date | null;
    }>
  > {
    const normalizedTenantId = this.requireTenant(tenantId);
    const versions = await this.recipeService.listProductVersions(
      normalizedTenantId,
      productId,
    );
    return versions.map((version) => ({
      id: version.id,
      version_number: version.version_number,
      is_active: version.is_active,
      version_note: version.version_note ?? null,
      fecha_inicio_vigencia: version.fecha_inicio_vigencia ?? null,
      fecha_fin_vigencia: version.fecha_fin_vigencia ?? null,
      published_at: version.published_at ?? null,
    }));
  }

  @Get('products/:productId/active')
  async getActiveRecipe(
    @Param('productId') productId: string,
    @GetTenantId() tenantId?: string,
  ): Promise<RecipeVersionSnapshotResponseDto> {
    const normalizedTenantId = this.requireTenant(tenantId);
    const activeVersion = await this.recipeService.findActiveVersion(
      normalizedTenantId,
      productId,
    );

    if (!activeVersion) {
      return {
        recipeVersion: {
          id: '',
          tenant_id: '',
          product_id: productId,
          version_number: 0,
          is_active: false,
          fecha_inicio_vigencia: null,
          fecha_fin_vigencia: null,
          pos_document_id: null,
          product_name: null,
          yield_quantity: 1,
          technical_shrink_pct: 0,
          version_note: null,
          pos_created_at: null,
          published_at: null,
          created_at: new Date(),
        },
        components: [],
      };
    }

    const snapshot = await this.recipeService.getSnapshot(
      activeVersion.id,
      normalizedTenantId,
      productId,
    );

    return this.mapSnapshotToResponse(snapshot);
  }

  /**
   * #523 T4 — the review step's read side: list the recipe versions the
   * industry templates proposed and that still await human confirmation.
   * Single-segment path: it cannot collide with the two-segment
   * `:recipeVersionId/snapshot` or three-segment `products/:productId/active`
   * routes declared on this controller.
   */
  /**
   * The Recetas grid: every product that has an ACTIVE PUBLISHED recipe, with
   * the recipe's own figures (yield, ingredient count, theoretical unit cost)
   * instead of the catalog product's price/stock.
   *
   * Before this route the grid asked for the active recipe of the SELECTED
   * product only, so every other card showed the product's catalog columns
   * (0 NIO / 0 stock for a compound product that was never produced) and
   * claimed to have no recipe.
   */
  @Get('active')
  async listActiveRecipes(
    @GetTenantId() tenantId?: string,
  ): Promise<ActiveRecipeSummaryResponseDto[]> {
    const normalizedTenantId = this.requireTenant(tenantId);

    const summaries =
      await this.recipeService.listActiveRecipeSummaries(normalizedTenantId);
    if (summaries.length === 0) {
      return [];
    }

    // The theoretical cost is the same computation the "Costo por plato"
    // route exposes, so the Recetas card and the margin report can never
    // disagree. Products that cannot be priced are reported with the
    // operator-facing reason instead of a silent zero.
    const { dishes, skipped } =
      await this.theoreticalCostService.listDishMargins(normalizedTenantId);
    const costByProductId = new Map(dishes.map((d) => [d.productId, d]));
    const skipByProductId = new Map(skipped.map((s) => [s.productId, s]));

    return summaries.map((summary) => {
      const dish = costByProductId.get(summary.productId);
      const skip = skipByProductId.get(summary.productId);
      return {
        ...summary,
        estimatedCostNio: dish ? dish.unitTheoreticalCostNio : null,
        costUnavailableReason: dish ? null : (skip?.reason ?? null),
      };
    });
  }

  @Get('suggestions')
  async listPendingSuggestions(
    @GetTenantId() tenantId?: string,
  ): Promise<RecipeSuggestionListItemDto[]> {
    const normalizedTenantId = this.requireTenant(tenantId);
    return this.recipeService.listPendingTemplateSuggestions(
      normalizedTenantId,
    );
  }

  @Get(':recipeVersionId/snapshot')
  async getRecipeSnapshot(
    @Param('recipeVersionId') recipeVersionId: string,
    @GetTenantId() tenantId?: string,
  ): Promise<RecipeVersionSnapshotResponseDto> {
    const normalizedTenantId = this.requireTenant(tenantId);
    const snapshot = await this.recipeService.getSnapshot(
      recipeVersionId,
      normalizedTenantId,
    );

    return this.mapSnapshotToResponse(snapshot);
  }

  @Post('products/:productId/versions')
  @UseGuards(AuthGuard, AuthoritativeCurrentUserGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async createRecipeVersion(
    @Param('productId') productId: string,
    @Body() dto: CreateRecipeVersionDto,
    @GetTenantId() tenantId?: string,
  ): Promise<RecipeVersionSnapshotResponseDto> {
    const normalizedTenantId = this.requireTenant(tenantId);

    if (dto.productId !== productId) {
      throw new Error('Product ID in body must match URL parameter');
    }

    const createdVersion = await this.recipeService.createNewVersion({
      tenantId: normalizedTenantId,
      productId,
      components: dto.components.map((c) => ({
        insumoId: c.ingredientId,
        grossQuantity: c.grossQuantity,
        technicalShrinkPct: c.technicalShrinkPct,
        // R6 (H3): these three were dropped here, so the detail was always
        // saved as INSUMO with no unit and no sub-recipe reference.
        ingredientType: c.ingredientType,
        componentUom: c.componentUom ?? null,
        referenceVersionId: c.referenceVersionId ?? null,
        // The name is a snapshot of the referenced insumo/product. It was
        // dropped here too, so `recipe_details.ingredient_name` stayed NULL
        // and the next edit round-tripped NULL as "" into the DTO (400
        // `components.N.ingredientName should not be empty`). The service
        // resolves it authoritatively; the client copy is only a fallback.
        ingredientName: c.ingredientName ?? null,
      })),
      yieldQuantity: dto.yieldQuantity,
      technicalShrinkPct: dto.technicalShrinkPct,
      versionNote: dto.versionNote,
      effectiveAt: dto.effectiveAt ? new Date(dto.effectiveAt) : undefined,
    });

    const snapshot = await this.recipeService.getSnapshot(
      createdVersion.id,
      normalizedTenantId,
      productId,
    );

    return this.mapSnapshotToResponse(snapshot);
  }

  /**
   * #523 T2 — pure wiring: publish a template's DRAFT suggestion through the
   * existing, tenant-bound, unit-tested `publishDraftVersion` (issue #512
   * slice 2 part A). The state transitions live in the service method and
   * are deliberately NOT re-derived here; the route only makes the tested
   * confirmation step reachable. Returns the same snapshot response shape as
   * the sibling routes, using the same guard idiom as the sibling POST that
   * creates versions.
   */
  @Post(':recipeVersionId/publish')
  @UseGuards(AuthGuard, AuthoritativeCurrentUserGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async publishRecipeVersion(
    @Param('recipeVersionId') recipeVersionId: string,
    @GetTenantId() tenantId?: string,
  ): Promise<RecipeVersionSnapshotResponseDto> {
    const normalizedTenantId = this.requireTenant(tenantId);

    const published = await this.recipeService.publishDraftVersion(
      normalizedTenantId,
      recipeVersionId,
    );

    const snapshot = await this.recipeService.getSnapshot(
      published.id,
      normalizedTenantId,
      published.product_id,
    );

    return this.mapSnapshotToResponse(snapshot);
  }
}
