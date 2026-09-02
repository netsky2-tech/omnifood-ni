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
import { RecipeVersionSnapshotResponseDto } from './dto/recipe-version-response.dto';
import { GetTenantId } from '../../core/decorators/tenant.decorator';
import { CurrentUser, CurrentUserPayload } from '../../core/decorators/current-user.decorator';
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
  constructor(private readonly recipeService: RecipeService) {}

  private requireTenant(tenantId?: string): string {
    if (!tenantId) {
      throw new Error('Tenant context is required');
    }
    return tenantId;
  }

  private mapSnapshotToResponse(snapshot: {
    recipeVersion: any;
    components: any[];
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
        technical_shrink_pct: Number(snapshot.recipeVersion.technical_shrink_pct),
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
    @CurrentUser() user?: CurrentUserPayload,
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
      })),
      effectiveAt: dto.effectiveAt ? new Date(dto.effectiveAt) : undefined,
    });

    const snapshot = await this.recipeService.getSnapshot(
      createdVersion.id,
      normalizedTenantId,
      productId,
    );

    return this.mapSnapshotToResponse(snapshot);
  }
}