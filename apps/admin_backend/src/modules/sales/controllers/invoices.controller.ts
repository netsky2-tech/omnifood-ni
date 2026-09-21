import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { InvoicesService } from '../services/invoices.service';
import { SyncInvoiceDto } from '../dto/sync-invoice.dto';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { SyncTransportGuard } from '../../identity/guards/sync-transport.guard';
import { RequireSyncScopes } from '../../identity/decorators/sync-scopes.decorator';

/**
 * Invoice surface on the device sync transport (issue #445).
 *
 * The POS transmits invoice documents inside the background sync pass,
 * where no human session is guaranteed (offline-first). The human
 * authorization of each document is captured at authoring time; the actor
 * attestation gap created by transmitting with device identity alone is
 * declared as a dependency on the DSI-6 / OHAC offline-human-authorization
 * workstream, not silently dropped.
 */
@Controller('sales')
@UseGuards(SyncTransportGuard)
@UseInterceptors(TenantInterceptor)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  /**
   * Fail-closed tenant binding for the device transport routes: the tenant
   * always comes from the authenticated device principal the transport guard
   * attached, never from a human user. On a valid device token this is always
   * present; the check keeps an unbound request from reaching the service.
   */
  private requireTenant(tenantId?: string): string {
    if (!tenantId?.trim()) {
      throw new UnauthorizedException('Tenant context is required');
    }
    return tenantId.trim();
  }

  @Post('sync')
  @RequireSyncScopes('sync:push')
  async syncInvoices(
    @GetTenantId() tenantId: string | undefined,
    @Body() dtos: SyncInvoiceDto[],
  ) {
    await this.invoicesService.syncInvoices(
      this.requireTenant(tenantId),
      dtos,
    );
    return { status: 'success', synced: dtos.length };
  }

  @Get()
  @RequireSyncScopes('sync:pull')
  async findAll(@GetTenantId() tenantId: string | undefined) {
    return this.invoicesService.findAll(this.requireTenant(tenantId));
  }

  @Get(':id')
  @RequireSyncScopes('sync:pull')
  async findOne(
    @Param('id') id: string,
    @GetTenantId() tenantId: string | undefined,
  ) {
    return this.invoicesService.findOne(this.requireTenant(tenantId), id);
  }
}
