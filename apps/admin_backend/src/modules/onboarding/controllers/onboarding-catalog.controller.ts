import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Request } from 'express';
import { OnboardingCatalogService } from '../services/onboarding-catalog.service';
import { CreateManualProductDto } from '../dto/onboarding-catalog.dto';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { PermissionsGuard } from '../../identity/guards/permissions.guard';
import { Roles } from '../../../core/decorators/roles.decorator';
import { RequirePermissions } from '../../identity/decorators/permissions.decorator';
import { AppPermission } from '../../identity/security/permissions.enum';
import { UserRole } from '../../identity/entities/user.entity';

interface RequestWithUser extends Request {
  user?: {
    sub?: string;
    userId?: string;
    email?: string;
    role?: string;
    tenant_id?: string;
    tenantId?: string;
    custom_permissions?: string[];
  };
}

@Controller('onboarding/catalog')
@UseGuards(AuthGuard, RolesGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
export class OnboardingCatalogController {
  constructor(private readonly catalogService: OnboardingCatalogService) {}

  private requireTenant(tenantId?: string): string {
    if (!tenantId?.trim()) {
      throw new UnauthorizedException('Tenant context is required');
    }
    return tenantId.trim();
  }

  @Post('manual-product')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @RequirePermissions(AppPermission.ONBOARDING_PRODUCT_IMPORT_MANAGE)
  async createManualProduct(
    @Body() dto: CreateManualProductDto,
    @Req() req: RequestWithUser,
    @GetTenantId() tenantIdParam?: string,
  ) {
    const tenantId = this.requireTenant(
      tenantIdParam ?? req.user?.tenant_id ?? req.user?.tenantId,
    );
    const userId = req.user?.sub ?? req.user?.userId;
    return this.catalogService.createManualProduct(tenantId, dto, userId);
  }

  @Get('summary')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @RequirePermissions(AppPermission.ONBOARDING_READ)
  async getCatalogSummary(
    @Req() req: RequestWithUser,
    @GetTenantId() tenantIdParam?: string,
  ) {
    const tenantId = this.requireTenant(
      tenantIdParam ?? req.user?.tenant_id ?? req.user?.tenantId,
    );
    return this.catalogService.getCatalogSummary(tenantId);
  }
}
