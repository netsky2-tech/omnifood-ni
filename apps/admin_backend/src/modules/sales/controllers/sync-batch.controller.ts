import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { SyncBatchEnvelopeDto } from '../dto/sync-batch.dto';
import { SyncCreditNoteAuthGuard } from '../guards/sync-credit-note-auth.guard';
import { InvoicesService } from '../services/invoices.service';

@Controller('v1/sync')
export class SyncBatchController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post('batch')
  @UseGuards(SyncCreditNoteAuthGuard)
  async syncBatch(
    @GetTenantId() tenantId: string,
    @Body() envelope: SyncBatchEnvelopeDto,
  ) {
    const result = await this.invoicesService.syncBatch(
      tenantId,
      envelope.records,
    );
    return { status: 'success', ...result };
  }
}
