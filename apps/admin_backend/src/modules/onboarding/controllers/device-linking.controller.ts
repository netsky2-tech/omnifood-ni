import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Request } from 'express';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { PermissionsGuard } from '../../identity/guards/permissions.guard';
import { RequirePermissions } from '../../identity/decorators/permissions.decorator';
import { AppPermission } from '../../identity/security/permissions.enum';
import { DeviceLinkingService } from '../services/device-linking.service';
import { GenerateLinkingCodeDto } from '../dto/generate-linking-code.dto';
import { LinkingCodeResponseDto } from '../dto/linking-code-response.dto';
import { LinkDeviceDto } from '../dto/link-device.dto';
import { DeviceLinkingRateLimiter } from '../utils/linking-rate-limiter';
import { LINKING_CODE_GENERIC_FAILURE } from '../services/device-linking.service';

interface RequestWithUser extends Request {
  user?: {
    id?: string;
    sub?: string;
    tenantId?: string;
    tenant_id?: string;
  };
}

/**
 * Pre-auth device linking endpoints (issue #556 stage 3, founder design).
 *
 * Two seams live here, deliberately shaped differently:
 *
 * - `GET onboarding/activation/linking-codes` — HUMAN-AUTH. Tenant-scoped
 *   listing of the most recent codes (issue #569 single linking flow) so
 *   the dashboard can offer one-click activation for claimed devices.
 * - `POST onboarding/activation/linking-codes` — HUMAN-AUTH. Dashboard
 *   generates a single-use code for its tenant; the plaintext is returned
 *   exactly once. Guards, permission gate, and tenant binding follow the
 *   same pattern as ActivationController.
 * - `POST onboarding/activation/link` — PRE-AUTH. No AuthGuard: the device
 *   links BEFORE any login exists, exchanging code + deviceId for the
 *   tenant binding (tenantId + persisted slug). This placement mirrors the
 *   STEP 0 precedent: the device-sync token renewal controller is likewise
 *   a guardless POST whose authority comes from verified secret material,
 *   not from a session. The slug is pre-auth context, never authority.
 *   Lightly rate-limited per IP (in-memory, 10/min) as the single
 *   bcrypt-backed pre-auth claim seam.
 *
 * Every rejected claim collapses into ONE generic failure: no shape
 * distinguishes unknown, expired, claimed, or revoked codes.
 */
@Controller('onboarding/activation')
export class DeviceLinkingController {
  constructor(
    private readonly deviceLinkingService: DeviceLinkingService,
    private readonly rateLimiter: DeviceLinkingRateLimiter,
  ) {}

  private getEffectiveTenantId(req: RequestWithUser): string {
    const tenantId = req.user?.tenantId || req.user?.tenant_id;
    if (!tenantId) {
      throw new UnauthorizedException('Tenant context not found in request');
    }
    return tenantId;
  }

  private getActorUserId(req: RequestWithUser): string {
    return req.user?.id || req.user?.sub || 'SYSTEM';
  }

  @Post('linking-codes')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard, PermissionsGuard)
  @UseInterceptors(TenantInterceptor)
  @RequirePermissions(AppPermission.ONBOARDING_ACTIVATION_MANAGE)
  async generateLinkingCode(
    @Req() req: RequestWithUser,
    @Body() dto: GenerateLinkingCodeDto,
  ): Promise<{ code: string; expiresAt: Date }> {
    const tenantId = this.getEffectiveTenantId(req);
    const actorUserId = this.getActorUserId(req);
    return await this.deviceLinkingService.generateLinkingCode(
      tenantId,
      actorUserId,
      { expiryMinutes: dto.expiryMinutes },
    );
  }

  @Get('linking-codes')
  @UseGuards(AuthGuard, PermissionsGuard)
  @UseInterceptors(TenantInterceptor)
  @RequirePermissions(AppPermission.ONBOARDING_ACTIVATION_MANAGE)
  async listLinkingCodes(
    @Req() req: RequestWithUser,
  ): Promise<LinkingCodeResponseDto[]> {
    const tenantId = this.getEffectiveTenantId(req);
    return await this.deviceLinkingService.listLinkingCodes(tenantId);
  }

  @Post('link')
  @HttpCode(HttpStatus.OK)
  async link(
    @Req() req: Request,
    @Body() dto: LinkDeviceDto,
  ): Promise<{
    tenantId: string;
    slug: string;
    deviceId: string;
    linkedAt: Date;
  }> {
    const decision = this.rateLimiter.consume(req.ip ?? 'unknown');
    if (!decision.allowed) {
      // Same generic failure shape: rate-limit pressure must not look
      // different from an invalid code.
      throw new UnauthorizedException(LINKING_CODE_GENERIC_FAILURE);
    }
    return await this.deviceLinkingService.claimCode(dto.code, dto.deviceId);
  }
}
