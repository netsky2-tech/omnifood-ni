import {
  Body,
  Controller,
  Logger,
  Post,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { SyncBatchEnvelopeDto } from '../dto/sync-batch.dto';
import { SyncCreditNoteAuthGuard } from '../guards/sync-credit-note-auth.guard';
import { InvoicesService } from '../services/invoices.service';

@Controller('v1/sync')
@UseGuards(AuthGuard, SyncCreditNoteAuthGuard)
@UseInterceptors(TenantInterceptor)
export class SyncBatchController {
  private readonly logger = new Logger(SyncBatchController.name);

  constructor(private readonly invoicesService: InvoicesService) {}

  private requireTenant(tenantId?: string): string {
    if (!tenantId?.trim()) {
      throw new UnauthorizedException('Tenant context is required');
    }
    return tenantId.trim();
  }

  @Post('batch')
  async syncBatch(
    @GetTenantId() tenantId: string | undefined,
    @Body() envelope: SyncBatchEnvelopeDto,
  ) {
    const validTenantId = this.requireTenant(tenantId);
    this.logger.log(
      `[SYNC-BATCH] tenant=${validTenantId} records=${envelope.records?.length ?? 0}`,
    );
    if (envelope.records?.length) {
      for (const r of envelope.records) {
        this.logger.log(
          `[SYNC-BATCH] record key=${r.idempotencyKey} docType=${r.documentType} flowType=${r.flowType} hasInvoice=${!!r.invoice} movements=${r.movements?.length ?? 0}`,
        );
      }
    }
    try {
      const result = await this.invoicesService.syncBatch(
        validTenantId,
        envelope.records,
      );
      this.logger.log(
        `[SYNC-BATCH] result received=${result.received} processed=${result.processed} duplicates=${result.duplicates} resultsCount=${result.results?.length ?? 0}`,
      );
      if (result.results?.length) {
        for (const r of result.results) {
          this.logger.log(
            `[SYNC-BATCH]   -> key=${r.idempotencyKey} status=${r.status} code=${r.code} message=${r.message ?? '(none)'} retryable=${r.retryable}`,
          );
        }
      }
      return { status: 'success', ...result };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[SYNC-BATCH] FAILED: ${msg}`, (error as Error)?.stack);
      throw error;
    }
  }
}
