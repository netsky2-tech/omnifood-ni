import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import type { DeviceSyncPrincipal } from '../../identity/security/device-sync-principal';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';
import { SyncTransportGuard } from '../../identity/guards/sync-transport.guard';
import { RequireSyncScopes } from '../../identity/decorators/sync-scopes.decorator';
import {
  InboundSyncQueryDto,
  InboundSyncResponseDto,
} from '../dto/inbound-sync.dto';
import { FiscalAckDto } from '../../onboarding/dto/fiscal-config-version.dto';
import { InboundSyncService } from '../services/inbound-sync.service';
import { AcknowledgeStaffPolicyEpochDto } from '../dto/human-authorization-ack.dto';

interface InboundSyncRequest extends Request {
  devicePrincipal?: DeviceSyncPrincipal;
}

@Controller('v1/sync/inbound')
@UseGuards(SyncTransportGuard)
@RequireSyncScopes('sync:pull')
export class InboundSyncController {
  constructor(
    private readonly inboundSyncService: InboundSyncService,
    private readonly dataSource: DataSource,
  ) {}

  private requireTenant(tenantId?: string): string {
    if (!tenantId?.trim()) {
      throw new UnauthorizedException('Tenant context is required');
    }
    return tenantId;
  }

  @Get('deltas')
  @RequireSyncScopes('sync:pull')
  async getDeltas(
    @Req() req: InboundSyncRequest,
    @GetTenantId() tenantId: string | undefined,
    @Query() query: InboundSyncQueryDto,
  ): Promise<InboundSyncResponseDto> {
    // The terminal identity is taken from the authenticated device principal
    // the transport guard attached, never from the query or the body: the
    // principal is the canonical enrolled terminal the epoch chain binds to
    // (design §4.1 rule 2, §11.4 decision 24).
    //
    // The guard's transaction-local `app.tenant_id` binding commits before
    // this handler runs, so the service reads would otherwise go through
    // global pooled repositories that never see it (issue #470: under FORCED
    // RLS this is a 500 uuid-cast error or a silently empty catalog). Every
    // read below rides this handler's own tenant-bound transaction instead.
    const tenant = this.requireTenant(tenantId);
    return runInTenantTransaction(this.dataSource, tenant, (manager) =>
      this.inboundSyncService.getInboundDeltas(
        tenant,
        query,
        req.devicePrincipal,
        manager,
      ),
    );
  }

  @Get('catalog')
  @RequireSyncScopes('sync:pull')
  async getCatalog(
    @Req() req: InboundSyncRequest,
    @GetTenantId() tenantId: string | undefined,
    @Query() query: InboundSyncQueryDto,
  ): Promise<InboundSyncResponseDto> {
    // The terminal identity is taken from the authenticated device principal
    // the transport guard attached, never from the query or the body: the
    // principal is the canonical enrolled terminal the epoch chain binds to
    // (design §4.1 rule 2, §11.4 decision 24).
    const tenant = this.requireTenant(tenantId);
    return runInTenantTransaction(this.dataSource, tenant, (manager) =>
      this.inboundSyncService.getInboundDeltas(
        tenant,
        query,
        req.devicePrincipal,
        manager,
      ),
    );
  }

  @Get()
  @RequireSyncScopes('sync:pull')
  async getRootInbound(
    @Req() req: InboundSyncRequest,
    @GetTenantId() tenantId: string | undefined,
    @Query() query: InboundSyncQueryDto,
  ): Promise<InboundSyncResponseDto> {
    // The terminal identity is taken from the authenticated device principal
    // the transport guard attached, never from the query or the body: the
    // principal is the canonical enrolled terminal the epoch chain binds to
    // (design §4.1 rule 2, §11.4 decision 24).
    const tenant = this.requireTenant(tenantId);
    return runInTenantTransaction(this.dataSource, tenant, (manager) =>
      this.inboundSyncService.getInboundDeltas(
        tenant,
        query,
        req.devicePrincipal,
        manager,
      ),
    );
  }

  /**
   * Terminal acknowledgement of an applied policy epoch (design §5.3). The
   * terminal identity comes from the authenticated device principal and the
   * tenant from the bound context, never from the body, so an acknowledgement
   * can only ever be made for the terminal that authenticated.
   */
  @Post('human-authorization/staff-policy/ack')
  @RequireSyncScopes('sync:pull')
  async acknowledgeStaffPolicyEpoch(
    @Req() req: InboundSyncRequest,
    @GetTenantId() tenantId: string | undefined,
    @Body() dto: AcknowledgeStaffPolicyEpochDto,
  ) {
    const principal = req.devicePrincipal;
    if (!principal) {
      throw new UnauthorizedException(
        'DEVICE_PRINCIPAL_MISSING: an authenticated device is required to acknowledge an epoch',
      );
    }
    return this.inboundSyncService.acknowledgeStaffPolicyEpoch(
      this.requireTenant(tenantId),
      principal,
      dto,
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
