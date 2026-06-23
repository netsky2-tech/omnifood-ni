import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CatalogType } from './catalog-type';
import { CreateCatalogValueDto } from './dto/create-catalog-value.dto';
import { UpdateCatalogValueDto } from './dto/update-catalog-value.dto';
import { GetTenantId } from '../../core/decorators/tenant.decorator';
import { TenantInterceptor } from '../../core/database/rls.interceptor';
import { AuthGuard } from '../identity/guards/auth.guard';
import { RolesGuard } from '../identity/guards/roles.guard';
import { Roles } from '../../core/decorators/roles.decorator';
import { UserRole } from '../identity/entities/user.entity';

/**
 * Administrable master catalog API. The tablet downloads these catalogs to its
 * local cache (offline-first) and the POS UI consumes them instead of any
 * hardcoded list. Catalog types are fixed by protocol; values are per-tenant.
 */
@Controller('catalogs')
@UseGuards(AuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  private requireTenant(tenantId?: string): string {
    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required');
    }
    return tenantId;
  }

  @Post('seed-defaults')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async seedDefaults(@GetTenantId() tenantId?: string) {
    const inserted = await this.catalogService.seedDefaults(
      this.requireTenant(tenantId),
    );
    return { inserted };
  }

  @Get(':type')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async list(
    @Param('type') type: string,
    @Query('includeInactive') includeInactive?: string,
    @GetTenantId() tenantId?: string,
  ) {
    const resolved = CatalogService.resolveType(type);
    return this.catalogService.list(
      resolved,
      this.requireTenant(tenantId),
      includeInactive === 'true',
    );
  }

  @Post(':type')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async create(
    @Param('type') type: string,
    @Body() dto: CreateCatalogValueDto,
    @GetTenantId() tenantId?: string,
  ) {
    const resolved = CatalogService.resolveType(type);
    return this.catalogService.create(
      resolved,
      this.requireTenant(tenantId),
      dto,
    );
  }

  @Patch(':type/:id')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async update(
    @Param('type') type: string,
    @Param('id') id: string,
    @Body() dto: UpdateCatalogValueDto,
    @GetTenantId() tenantId?: string,
  ) {
    const resolved = CatalogService.resolveType(type);
    return this.catalogService.update(
      resolved,
      id,
      this.requireTenant(tenantId),
      dto,
    );
  }

  @Delete(':type/:id')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async deactivate(
    @Param('type') type: string,
    @Param('id') id: string,
    @GetTenantId() tenantId?: string,
  ) {
    const resolved = CatalogService.resolveType(type);
    await this.catalogService.deactivate(
      resolved,
      id,
      this.requireTenant(tenantId),
    );
    return { id, deactivated: true };
  }
}

// Re-export so callers can import the type alongside the controller if needed.
export type { CatalogType };
