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
import { FiscalSetupService } from '../services/fiscal-setup.service';
import { FiscalSetupDto } from '../dto/fiscal-setup.dto';
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
    email?: string;
    role?: string;
    tenant_id?: string;
    tenantId?: string;
    custom_permissions?: string[];
  };
}

@Controller('onboarding/fiscal-setup')
@UseGuards(AuthGuard, RolesGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
export class FiscalSetupController {
  constructor(private readonly fiscalSetupService: FiscalSetupService) {}

  private requireTenant(tenantId?: string): string {
    if (!tenantId?.trim()) {
      throw new UnauthorizedException('Tenant context is required');
    }
    return tenantId.trim();
  }

  @Get()
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @RequirePermissions(AppPermission.ONBOARDING_READ)
  async getFiscalSetup(@GetTenantId() tenantId?: string) {
    const validTenantId = this.requireTenant(tenantId);
    return this.fiscalSetupService.getFiscalSetup(validTenantId);
  }

  @Post()
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @RequirePermissions(AppPermission.ONBOARDING_FISCAL_CONFIGURE)
  async configureFiscalSetup(
    @Body() dto: FiscalSetupDto,
    @Req() req: RequestWithUser,
    @GetTenantId() tenantId?: string,
  ) {
    const validTenantId = this.requireTenant(tenantId);
    const userId = req.user?.sub;
    return this.fiscalSetupService.configureFiscalSetup(
      validTenantId,
      dto,
      userId,
    );
  }
}
