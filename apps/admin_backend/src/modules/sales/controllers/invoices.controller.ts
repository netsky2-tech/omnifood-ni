import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { InvoicesService } from '../services/invoices.service';
import { SyncInvoiceDto } from '../dto/sync-invoice.dto';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
// Import JwtAuthGuard if it exists, or similar
// import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';

@Controller('sales')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post('sync')
  async syncInvoices(
    @GetTenantId() tenantId: string,
    @Body() dtos: SyncInvoiceDto[],
  ) {
    await this.invoicesService.syncInvoices(tenantId, dtos);
    return { status: 'success', synced: dtos.length };
  }

  @Get()
  async findAll(@GetTenantId() tenantId: string) {
    return this.invoicesService.findAll(tenantId);
  }

  @Get(':id')
  async findOne(@GetTenantId() tenantId: string, @Param('id') id: string) {
    return this.invoicesService.findOne(tenantId, id);
  }
}
