import {
  Controller,
  Get,
  Req,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Request } from 'express';
import { TerminalPrimingService } from '../services/terminal-priming.service';
import type { TerminalPrimingResponseDto } from '../services/terminal-priming.service';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { PermissionsGuard } from '../../identity/guards/permissions.guard';
import { RequirePermissions } from '../../identity/decorators/permissions.decorator';
import { AppPermission } from '../../identity/security/permissions.enum';

interface RequestWithUser extends Request {
  user?: {
    id?: string;
    sub?: string;
    role?: string;
    tenant_id?: string;
    tenantId?: string;
    custom_permissions?: string[];
  };
}

/**
 * L1-10a: human-authenticated terminal priming.
 *
 * One read-only endpoint that lets an authorized human session obtain the
 * tenant's catalog and fiscal snapshot in the envelope shape the POS
 * projection already consumes, before any device credential exists.
 *
 * Authorization is the ONBOARDING_ACTIVATION_MANAGE permission alone, with no
 * `@Roles(OWNER)` hardcode: a business may delegate activation to a non-OWNER
 * role that holds this permission through per-user custom permissions, so the
 * priming surface and the activation surface stay authorized identically.
 *
 * This surface never creates or accepts a device credential, never touches
 * SyncTransportGuard, the credential service or the device scope allowlist,
 * and requires no existing activation attempt.
 */
@Controller('onboarding/terminals/priming')
@UseGuards(AuthGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
export class TerminalPrimingController {
  constructor(private readonly primingService: TerminalPrimingService) {}

  @Get()
  @RequirePermissions(AppPermission.ONBOARDING_ACTIVATION_MANAGE)
  async getPrimingPayload(
    @Req() req: RequestWithUser,
  ): Promise<TerminalPrimingResponseDto> {
    const tenantId = req.user?.tenantId || req.user?.tenant_id;
    if (!tenantId) {
      throw new UnauthorizedException('Tenant context not found in request');
    }
    return this.primingService.getPrimingPayload(tenantId);
  }
}
