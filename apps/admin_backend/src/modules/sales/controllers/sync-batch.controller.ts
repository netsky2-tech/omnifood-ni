import { Body, Controller, Post } from '@nestjs/common';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { SyncBatchEnvelopeDto } from '../dto/sync-batch.dto';
import { InvoicesService } from '../services/invoices.service';

@Controller('v1/sync')
export class SyncBatchController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post('batch')
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
