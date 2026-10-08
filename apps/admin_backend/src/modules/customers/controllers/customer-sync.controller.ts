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
import { CustomerSyncBatchDto } from '../dto/customer-sync.dto';
import { CustomerSyncIngestionService } from '../services/customer-sync-ingestion.service';

/**
 * Device sync transport surface for outbound customers created on the terminal
 * (D-1 / FU-4, odd/tasks/soho-p1-p2-remediation.md).
 * Customers created locally on the POS must sync to cloud so they are available
 * across terminals, in the backoffice and for loyalty accumulation.
 */
@Controller('customers')
@UseGuards(SyncTransportGuard)
@UseInterceptors(TenantInterceptor)
export class CustomerSyncController {
  constructor(
    private readonly ingestionService: CustomerSyncIngestionService,
  ) {}

  private requireTenant(tenantId?: string): string {
    if (!tenantId?.trim()) {
      throw new UnauthorizedException('Tenant context is required');
    }
    return tenantId.trim();
  }

  @Post('sync')
  @RequireSyncScopes('sync:push')
  async syncCustomers(
    @GetTenantId() tenantId: string | undefined,
    @Body() dto: CustomerSyncBatchDto,
  ) {
    return this.ingestionService.ingestCustomerBatch(
      this.requireTenant(tenantId),
      dto,
    );
  }
}
