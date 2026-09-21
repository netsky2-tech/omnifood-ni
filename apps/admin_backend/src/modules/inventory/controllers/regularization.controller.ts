import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  Req,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { KardexRegularizationService } from '../services/kardex-regularization.service';
import { ApproveRegularizationDto } from '../dto/approve-regularization.dto';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { Roles } from '../../../core/decorators/roles.decorator';
import { UserRole } from '../../identity/entities/user.entity';
import { SyncTransportGuard } from '../../identity/guards/sync-transport.guard';
import { RequireSyncScopes } from '../../identity/decorators/sync-scopes.decorator';

import { SyncRegularizationCorrectionsDto } from '../dto/sync-regularization-corrections.dto';

interface AuthenticatedUserRequest extends Request {
  user?: {
    sub?: string;
    id?: string;
    role?: string;
  };
}

@Controller('inventory/regularization')
@UseInterceptors(TenantInterceptor)
export class RegularizationController {
  constructor(
    private readonly regularizationService: KardexRegularizationService,
  ) {}

  /**
   * Fail-closed tenant binding for the device transport route: the tenant
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

  @Get('pending')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getPending(@GetTenantId() tenantId: string) {
    return this.regularizationService.getPendingQueue(tenantId);
  }

  @Post('approve')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async approve(
    @GetTenantId() tenantId: string,
    @Body() dto: ApproveRegularizationDto,
    @Req() request: AuthenticatedUserRequest,
  ) {
    // ST-06 founder decision: the human approve handler fails closed. The
    // guard-populated principal must supply a non-empty authenticated user id
    // and role; no fail-open defaults and no privileged-role substitution.
    const userId = request.user?.sub || request.user?.id;
    const role = request.user?.role;

    if (!userId?.trim() || !role?.trim()) {
      throw new BadRequestException(
        'Authenticated actor principal is required',
      );
    }

    return this.regularizationService.approveRegularization(tenantId, {
      queueId: dto.queueId,
      approvedByUserId: userId,
      role,
      authMethod: dto.authMethod,
    });
  }

  @Post('sync')
  // Device transport (ST-06): this write is transmitted by the POS
  // background sync pass, where no human session is guaranteed. The human
  // role gate that used to cover this handler is gone: the actor fields on
  // each document (authorizedByUserId, authorizedByRole, authorizationMethod)
  // are self-reported at authoring time and remain an explicit dependency on
  // the DSI-6/OHAC offline-human-authorization workstream (founder decision,
  // 2026-09-21). Device identity alone is not recorded as sufficient
  // authority; authorization is captured at authoring time, not at transmit
  // time.
  @UseGuards(SyncTransportGuard)
  @RequireSyncScopes('sync:push')
  async syncCorrections(
    @GetTenantId() tenantId: string | undefined,
    @Body() dto: SyncRegularizationCorrectionsDto,
  ) {
    return this.regularizationService.syncCorrections(
      this.requireTenant(tenantId),
      dto.corrections,
    );
  }
}
