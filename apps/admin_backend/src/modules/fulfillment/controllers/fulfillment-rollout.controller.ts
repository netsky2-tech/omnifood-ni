import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { Roles } from '../../../core/decorators/roles.decorator';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { UserRole } from '../../identity/entities/user.entity';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import {
  FulfillmentRolloutService,
  RollbackToggleDto,
} from '../services/fulfillment-rollout.service';

@Controller('fulfillment/rollout')
@UseInterceptors(TenantInterceptor)
export class FulfillmentRolloutController {
  constructor(private readonly rolloutService: FulfillmentRolloutService) {}

  private requireTenant(tenantId?: string): string {
    if (!tenantId?.trim()) {
      throw new UnauthorizedException('Tenant context is required');
    }
    return tenantId;
  }

  @Get('discrepancies')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getDiscrepancies(@GetTenantId() tenantId: string | undefined) {
    const validTenantId = this.requireTenant(tenantId);
    return this.rolloutService.scanBackfillDiscrepancies(validTenantId);
  }

  @Post('rollback-toggle')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  @HttpCode(HttpStatus.OK)
  async toggleRollback(
    @GetTenantId() tenantId: string | undefined,
    @Body() body: RollbackToggleDto,
  ) {
    const validTenantId = this.requireTenant(tenantId);
    return this.rolloutService.toggleRollback(validTenantId, body);
  }

  @Get('rollback-status')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getRollbackStatus(@GetTenantId() tenantId: string | undefined) {
    const validTenantId = this.requireTenant(tenantId);
    return this.rolloutService.getRollbackStatus(validTenantId);
  }

  @Get('dashboard')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getDashboard(@GetTenantId() tenantId: string | undefined) {
    const validTenantId = this.requireTenant(tenantId);
    return this.rolloutService.getObservabilityDashboard(validTenantId);
  }
}
