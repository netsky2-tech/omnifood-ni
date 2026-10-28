import {
  Body,
  Controller,
  Get,
  Post,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { PermissionsGuard } from '../../identity/guards/permissions.guard';
import { Roles } from '../../../core/decorators/roles.decorator';
import { RequirePermissions } from '../../identity/decorators/permissions.decorator';
import { AppPermission } from '../../identity/security/permissions.enum';
import { UserRole } from '../../identity/entities/user.entity';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { UploadCompanyLogoDto } from '../dto/company-logo.dto';
import {
  CompanyLogoService,
  CompanyLogoView,
} from '../services/company-logo.service';

/**
 * Company identity parity P3, slice 1 (odd/tasks/identidad-empresa-paridad.md,
 * S5) — the dashboard's logo surface: read the current original and upload a
 * replacement. Same guard stack and permission shape as the fiscal setup
 * endpoint it sits beside; GET may be read by anyone who can read onboarding,
 * POST is a configuration act (ONBOARDING_FISCAL_CONFIGURE) because it bumps
 * the versioned snapshot the terminals consume.
 */
@Controller('onboarding/company-logo')
@UseGuards(AuthGuard, RolesGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
export class CompanyLogoController {
  constructor(private readonly companyLogoService: CompanyLogoService) {}

  private requireTenant(tenantId?: string): string {
    if (!tenantId?.trim()) {
      throw new UnauthorizedException('Tenant context is required');
    }
    return tenantId.trim();
  }

  @Get()
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @RequirePermissions(AppPermission.ONBOARDING_READ)
  async getCompanyLogo(
    @GetTenantId() tenantId?: string,
  ): Promise<CompanyLogoView | null> {
    return this.companyLogoService.getLogo(this.requireTenant(tenantId));
  }

  @Post()
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @RequirePermissions(AppPermission.ONBOARDING_FISCAL_CONFIGURE)
  async uploadCompanyLogo(
    @Body() dto: UploadCompanyLogoDto,
    @GetTenantId() tenantId?: string,
  ): Promise<CompanyLogoView> {
    return this.companyLogoService.uploadLogo(
      this.requireTenant(tenantId),
      dto,
    );
  }
}
