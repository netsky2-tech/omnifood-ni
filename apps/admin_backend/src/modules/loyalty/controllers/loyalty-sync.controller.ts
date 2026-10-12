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
import { LoyaltyPointTransactionSyncBatchDto } from '../dto/point-transaction-sync.dto';
import { LoyaltySyncIngestionService } from '../services/loyalty-sync-ingestion.service';

/**
 * Device sync transport surface for outbound loyalty point transactions
 * (Batch 5 slice 5b, finding H2). Deliberately separate from the human
 * `LoyaltyController` so the route transport registry keeps one transport
 * class per surface: this controller is device-only, the human controller
 * stays human-only.
 */
@Controller('loyalty')
@UseGuards(SyncTransportGuard)
@UseInterceptors(TenantInterceptor)
export class LoyaltySyncController {
  constructor(
    private readonly ingestionService: LoyaltySyncIngestionService,
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

  @Post('point-transactions/sync')
  @RequireSyncScopes('sync:push')
  async syncPointTransactions(
    @GetTenantId() tenantId: string | undefined,
    @Body() dto: LoyaltyPointTransactionSyncBatchDto,
  ) {
    return this.ingestionService.ingestPointTransactions(
      this.requireTenant(tenantId),
      dto.transactions,
    );
  }
}
