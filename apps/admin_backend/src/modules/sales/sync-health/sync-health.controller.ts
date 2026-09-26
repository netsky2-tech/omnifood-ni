import { Controller, Get, UseGuards, UseInterceptors } from '@nestjs/common';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { AuthoritativeCurrentUserGuard } from '../../identity/guards/authoritative-current-user.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { Roles } from '../../../core/decorators/roles.decorator';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { UserRole } from '../../identity/entities/user.entity';
import { SyncHealthService } from './sync-health.service';
import { SyncFreshnessDto } from './sync-freshness.dto';

/**
 * Owner Dashboard V2 — sync freshness operational read
 * (architecture spec v0.3 §17.12): GET /operations/sync/freshness.
 *
 * Guards mirror the other dashboard-consumed endpoints (see
 * ReportsController): browser AuthGuard chain, OWNER/MANAGER report access
 * policy, and the tenant derived from the verified JWT — a client can never
 * supply or override tenant authority.
 */
@Controller('operations/sync')
@UseGuards(AuthGuard, AuthoritativeCurrentUserGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class SyncHealthController {
  constructor(private readonly syncHealthService: SyncHealthService) {}

  @Get('freshness')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getFreshness(
    @GetTenantId() tenantId: string,
  ): Promise<SyncFreshnessDto> {
    return this.syncHealthService.getFreshness(tenantId);
  }
}
