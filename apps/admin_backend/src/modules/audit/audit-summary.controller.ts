import {
  Controller,
  Get,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '../identity/guards/auth.guard';
import { AuthoritativeCurrentUserGuard } from '../identity/guards/authoritative-current-user.guard';
import { RolesGuard } from '../identity/guards/roles.guard';
import { Roles } from '../../core/decorators/roles.decorator';
import { GetTenantId } from '../../core/decorators/tenant.decorator';
import { TenantInterceptor } from '../../core/database/rls.interceptor';
import { UserRole } from '../identity/entities/user.entity';
import { AuditSummaryService } from './audit-summary.service';
import { AuditExecutiveSummaryDto } from './audit-executive-summary.dto';

/**
 * Owner Dashboard V2 — audit/security executive summary read
 * (architecture spec v0.3 §16): GET /operations/audit/summary.
 *
 * Route naming: the spec's example (`/identity/audit/summary`) defers to
 * current module conventions; the dashboard-consumed operational read
 * surface established in Batch 3 is `operations/*` (SyncHealthController),
 * and this summary aggregates the audit module's own change_log stream, so
 * the route lives under operations/audit.
 *
 * Guards mirror the other dashboard-consumed endpoints and the existing
 * audit-view policy (spec §23.3; identity AuditController): browser
 * AuthGuard chain, OWNER/MANAGER, tenant derived from the verified JWT —
 * a client can never supply or override tenant authority.
 */
@Controller('operations/audit')
@UseGuards(AuthGuard, AuthoritativeCurrentUserGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class AuditSummaryController {
  constructor(private readonly auditSummaryService: AuditSummaryService) {}

  @Get('summary')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getExecutiveSummary(
    @GetTenantId() tenantId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<AuditExecutiveSummaryDto> {
    return this.auditSummaryService.getExecutiveSummary(
      tenantId,
      startDate,
      endDate,
    );
  }
}
