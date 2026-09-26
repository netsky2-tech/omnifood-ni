import { Controller, Get, UseGuards, UseInterceptors } from '@nestjs/common';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { AuthoritativeCurrentUserGuard } from '../../identity/guards/authoritative-current-user.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { Roles } from '../../../core/decorators/roles.decorator';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { UserRole } from '../../identity/entities/user.entity';
import { CardReconciliationSummaryService } from './card-reconciliation-summary.service';
import { CardReconciliationSummaryDto } from './card-reconciliation-summary.dto';

/**
 * Owner Dashboard V2 — card reconciliation summary read
 * (architecture spec v0.3 §15): GET /sales/reports/card-reconciliation-summary.
 *
 * The route is the one the spec prescribes verbatim; the handler lives in
 * the dashboard Batch 6a surface beside the sync freshness read, with the
 * same guard chain (browser AuthGuard chain, OWNER/MANAGER reporting
 * policy, tenant derived from the verified JWT). Read-only: no
 * reconciliation write workflow is introduced (spec §15).
 */
@Controller('sales/reports')
@UseGuards(AuthGuard, AuthoritativeCurrentUserGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class CardReconciliationSummaryController {
  constructor(
    private readonly cardReconciliationSummaryService: CardReconciliationSummaryService,
  ) {}

  @Get('card-reconciliation-summary')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getCardReconciliationSummary(
    @GetTenantId() tenantId: string,
  ): Promise<CardReconciliationSummaryDto> {
    return this.cardReconciliationSummaryService.getCardReconciliationSummary(
      tenantId,
    );
  }
}
