import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { SyncTransportGuard } from '../../identity/guards/sync-transport.guard';
import { RequireSyncScopes } from '../../identity/decorators/sync-scopes.decorator';
import {
  InboundSyncQueryDto,
  InboundSyncResponseDto,
} from '../dto/inbound-sync.dto';
import { FiscalAckDto } from '../../onboarding/dto/fiscal-config-version.dto';
import { InboundSyncService } from '../services/inbound-sync.service';

@Controller('v1/sync/inbound')
@UseGuards(SyncTransportGuard)
@RequireSyncScopes('sync:pull')
export class InboundSyncController {
  constructor(private readonly inboundSyncService: InboundSyncService) {}

  private requireTenant(tenantId?: string): string {
    if (!tenantId?.trim()) {
      throw new UnauthorizedException('Tenant context is required');
    }
    return tenantId;
  }

  @Get('deltas')
  @RequireSyncScopes('sync:pull')
  async getDeltas(
    @GetTenantId() tenantId: string | undefined,
    @Query() query: InboundSyncQueryDto,
  ): Promise<InboundSyncResponseDto> {
    return this.inboundSyncService.getInboundDeltas(
      this.requireTenant(tenantId),
      query,
    );
  }

  @Get('catalog')
  @RequireSyncScopes('sync:pull')
  async getCatalog(
    @GetTenantId() tenantId: string | undefined,
    @Query() query: InboundSyncQueryDto,
  ): Promise<InboundSyncResponseDto> {
    return this.inboundSyncService.getInboundDeltas(
      this.requireTenant(tenantId),
      query,
    );
  }

  @Get()
  @RequireSyncScopes('sync:pull')
  async getRootInbound(
    @GetTenantId() tenantId: string | undefined,
    @Query() query: InboundSyncQueryDto,
  ): Promise<InboundSyncResponseDto> {
    return this.inboundSyncService.getInboundDeltas(
      this.requireTenant(tenantId),
      query,
    );
  }

  @Post('fiscal/ack')
  @RequireSyncScopes('sync:pull')
  async acknowledgeFiscalConfig(
    @GetTenantId() tenantId: string | undefined,
    @Body() ackDto: FiscalAckDto,
  ) {
    return this.inboundSyncService.recordFiscalAck(
      this.requireTenant(tenantId),
      ackDto,
    );
  }
}
