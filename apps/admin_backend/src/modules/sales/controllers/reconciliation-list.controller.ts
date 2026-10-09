import { Controller, Get, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { AuthoritativeCurrentUserGuard } from '../../identity/guards/authoritative-current-user.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { Roles } from '../../../core/decorators/roles.decorator';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { UserRole } from '../../identity/entities/user.entity';
import { ReconciliationListService } from '../services/reconciliation-list.service';
import { ReconciliationListQueryDto } from '../dto/reconciliation-list-query.dto';
import { ReconciliationListResponseDto } from '../dto/reconciliation-list-item.dto';

/**
 * Paginated reconciliation drill-down list — the backend half of the
 * dashboard attention band's reconciliation tab:
 * GET /sales/reports/reconciliations.
 *
 * The route lives beside the other dashboard report reads with the same
 * guard chain (browser AuthGuard chain, OWNER/MANAGER reporting policy,
 * tenant derived from the verified JWT). Read-only: the listing surfaces
 * voucher reconciliations for drill-down navigation; no reconciliation
 * write workflow is introduced here.
 */
@Controller('sales/reports')
@UseGuards(AuthGuard, AuthoritativeCurrentUserGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class ReconciliationListController {
  constructor(
    private readonly reconciliationListService: ReconciliationListService,
  ) {}

  @Get('reconciliations')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getReconciliations(
    @Query() query: ReconciliationListQueryDto,
    @GetTenantId() tenantId: string,
  ): Promise<ReconciliationListResponseDto> {
    return this.reconciliationListService.getReconciliationList(
      tenantId,
      query,
    );
  }
}
