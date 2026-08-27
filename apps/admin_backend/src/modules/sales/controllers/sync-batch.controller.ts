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
import { AuthGuard } from '../../identity/guards/auth.guard';
import { SyncBatchEnvelopeDto } from '../dto/sync-batch.dto';
import { SyncCreditNoteAuthGuard } from '../guards/sync-credit-note-auth.guard';
import { InvoicesService } from '../services/invoices.service';

@Controller('v1/sync')
@UseGuards(AuthGuard, SyncCreditNoteAuthGuard)
@UseInterceptors(TenantInterceptor)
export class SyncBatchController {
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
    const result = await this.invoicesService.syncBatch(
      validTenantId,
      envelope.records,
    );
    return { status: 'success', ...result };
  }
}
