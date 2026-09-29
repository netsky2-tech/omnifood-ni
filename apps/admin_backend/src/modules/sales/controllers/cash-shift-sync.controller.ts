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
import { CashShiftSyncBatchDto } from '../dto/cash-shift-sync.dto';
import { CashShiftSyncIngestionService } from '../services/cash-shift-sync-ingestion.service';

/**
 * Device sync transport surface for outbound cash shift sessions and cash
 * movements (Batch 5 slice 5c, finding H3). Deliberately separate from the
 * human `CashShiftController` so the route transport registry keeps one
 * transport class per surface: this controller is device-only, the human
 * controller stays human-only. DGI-neutral: no invoice or fiscal data flows
 * through this surface.
 */
@Controller('sales/shifts')
@UseGuards(SyncTransportGuard)
@UseInterceptors(TenantInterceptor)
export class CashShiftSyncController {
  constructor(
    private readonly ingestionService: CashShiftSyncIngestionService,
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
  async syncCashShifts(
    @GetTenantId() tenantId: string | undefined,
    @Body() dto: CashShiftSyncBatchDto,
  ) {
    return this.ingestionService.ingestCashShiftBatch(
      this.requireTenant(tenantId),
      { sessions: dto.sessions, movements: dto.movements },
    );
  }
}
