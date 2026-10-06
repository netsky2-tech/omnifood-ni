import {
  Body,
  Controller,
  Post,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { SyncTransportGuard } from '../../identity/guards/sync-transport.guard';
import { RequireSyncScopes } from '../../identity/decorators/sync-scopes.decorator';
import { PaymentReconciliationSyncBatchDto } from '../dto/payment-reconciliation-sync.dto';
import { PaymentReconciliationSyncIngestionService } from '../services/payment-reconciliation-sync-ingestion.service';

/**
 * Device sync transport surface for outbound card/voucher reconciliations
 * (backlog #68, slice S1b). A reconciliation is performed on the terminal
 * AFTER the sale synced, and re-pushing the sale is a dead end (same
 * idempotency key → DUPLICATE_REPLAY; the sale payload hash excludes
 * reconciliation fields), so this is a dedicated payment-level transport.
 * Deliberately separate from the human invoice controllers so the route
 * transport registry keeps one transport class per surface, mirroring
 * `CashShiftSyncController`. DGI-neutral: no invoice amounts, methods or
 * fiscal data are modified through this surface.
 */
@Controller('sales/payment-reconciliations')
@UseGuards(SyncTransportGuard)
@UseInterceptors(TenantInterceptor)
export class PaymentReconciliationSyncController {
  constructor(
    private readonly ingestionService: PaymentReconciliationSyncIngestionService,
  ) {}

  /**
   * Fail-closed tenant binding: the tenant always comes from the
   * authenticated device principal the transport guard attached, never
   * from a client-supplied body field.
   */
  private requireTenant(tenantId?: string): string {
    if (!tenantId?.trim()) {
      throw new UnauthorizedException('Tenant context is required');
    }
    return tenantId.trim();
  }

  @Post('sync')
  @RequireSyncScopes('sync:push')
  async syncPaymentReconciliations(
    @GetTenantId() tenantId: string | undefined,
    @Body() dto: PaymentReconciliationSyncBatchDto,
  ) {
    return this.ingestionService.ingestReconciliationBatch(
      this.requireTenant(tenantId),
      { reconciliations: dto.reconciliations },
    );
  }
}
