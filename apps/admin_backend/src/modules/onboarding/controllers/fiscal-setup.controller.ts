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
import { Roles } from '../../../core/decorators/roles.decorator';
import { UserRole } from '../../identity/entities/user.entity';

interface RequestWithUser extends Request {
  user?: {
    sub?: string;
    email?: string;
    role?: string;
  };
}

@Controller('onboarding/fiscal-setup')
@UseGuards(AuthGuard, RolesGuard)
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
  async getFiscalSetup(@GetTenantId() tenantId?: string) {
    const validTenantId = this.requireTenant(tenantId);
    return this.fiscalSetupService.getFiscalSetup(validTenantId);
  }

  @Post()
  @Roles(UserRole.OWNER, UserRole.MANAGER)
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
