import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { PermissionsGuard } from '../../identity/guards/permissions.guard';
import { RequirePermissions } from '../../identity/decorators/permissions.decorator';
import { AppPermission } from '../../identity/security/permissions.enum';
import {
  CompleteReactivationDto,
  ConfirmReactivationCredentialDto,
  DeviceLookupDto,
  InitiateTerminalReactivationDto,
  ReactivationChallengeStatusDto,
} from '../dto/terminal-reactivation.dto';
import {
  ActiveReactivationChallengeItem,
  CompleteReactivationResult,
  ConfirmReactivationCredentialResult,
  DeviceLookupResult,
  InitiateTerminalReactivationResult,
  IssueRecoveryCodeResult,
  ReactivationChallengeStatusResult,
  TerminalReactivationService,
} from '../services/terminal-reactivation.service';
import { TerminalReactivationChallenge } from '../entities/terminal-reactivation-challenge.entity';
import { TerminalReactivationRateLimiter } from '../utils/terminal-reactivation-rate-limiter';

interface RequestWithUser extends Request {
  user?: {
    id?: string;
    sub?: string;
    tenantId?: string;
    tenant_id?: string;
  };
}

/**
 * Terminal Reactivation endpoints (issue #566).
 *
 * Combines:
 * - Pre-auth seams (`device-lookup`, `reactivation/:challengeId/status`,
 *   `reactivation/:challengeId/complete`, `reactivation/:challengeId/confirm`)
 *   protected by hardware fingerprint binding, dual-key rate limiting, and
 *   mandatory human approval (dashboard OR one-time 6-digit recovery code).
 * - Human-auth dashboard seams (`reactivation-challenges`,
 *   `reactivation-challenges/:id/approve`, `reactivation-challenges/:id/cancel`,
 *   `terminals/:terminalId/reactivate`, `terminals/:terminalId/recovery-code`)
 *   protected by AuthGuard + PermissionsGuard + TenantInterceptor.
 */
@Controller('onboarding/activation')
export class TerminalReactivationController {
  constructor(
    private readonly reactivationService: TerminalReactivationService,
    private readonly rateLimiter: TerminalReactivationRateLimiter,
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

  @Post('device-lookup')
  @HttpCode(HttpStatus.OK)
  async deviceLookup(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: DeviceLookupDto,
  ): Promise<DeviceLookupResult> {
    const decision = this.rateLimiter.consume(
      req.ip ?? 'unknown',
      dto.hardwareFingerprint,
    );
    if (!decision.allowed) {
      res.setHeader('Retry-After', String(decision.retryAfterSeconds));
      throw new HttpException(
        {
          code: 'RATE_LIMIT_EXCEEDED',
          message:
            'Demasiados intentos de verificación. Intentá de nuevo en un minuto.',
          retryAfterSeconds: decision.retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return await this.reactivationService.lookupDevice(dto.hardwareFingerprint);
  }

  @Post('reactivation/:challengeId/status')
  @HttpCode(HttpStatus.OK)
  async getChallengeStatus(
    @Param('challengeId') challengeId: string,
    @Body() dto: ReactivationChallengeStatusDto,
  ): Promise<ReactivationChallengeStatusResult> {
    return await this.reactivationService.getChallengeStatus(
      challengeId,
      dto.hardwareFingerprint,
    );
  }

  @Post('reactivation/:challengeId/complete')
  @HttpCode(HttpStatus.OK)
  async completeReactivation(
    @Param('challengeId') challengeId: string,
    @Body() dto: CompleteReactivationDto,
  ): Promise<CompleteReactivationResult> {
    return await this.reactivationService.completeReactivation(
      challengeId,
      dto,
    );
  }

  @Post('reactivation/:challengeId/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmReactivationCredential(
    @Param('challengeId') challengeId: string,
    @Body() dto: ConfirmReactivationCredentialDto,
  ): Promise<ConfirmReactivationCredentialResult> {
    return await this.reactivationService.confirmReactivationCredential(
      challengeId,
      dto,
    );
  }

  @Get('reactivation-challenges')
  @UseGuards(AuthGuard, PermissionsGuard)
  @UseInterceptors(TenantInterceptor)
  @RequirePermissions(AppPermission.ONBOARDING_ACTIVATION_MANAGE)
  async listActiveChallenges(
    @Req() req: RequestWithUser,
  ): Promise<ActiveReactivationChallengeItem[]> {
    const tenantId = this.getEffectiveTenantId(req);
    return await this.reactivationService.listActiveChallenges(tenantId);
  }

  @Post('reactivation-challenges/:id/approve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, PermissionsGuard)
  @UseInterceptors(TenantInterceptor)
  @RequirePermissions(AppPermission.ONBOARDING_ACTIVATION_MANAGE)
  async approveChallenge(
    @Req() req: RequestWithUser,
    @Param('id') challengeId: string,
  ): Promise<TerminalReactivationChallenge> {
    const tenantId = this.getEffectiveTenantId(req);
    const actorUserId = this.getActorUserId(req);
    return await this.reactivationService.approveChallenge(
      tenantId,
      challengeId,
      actorUserId,
    );
  }

  @Post('reactivation-challenges/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, PermissionsGuard)
  @UseInterceptors(TenantInterceptor)
  @RequirePermissions(AppPermission.ONBOARDING_ACTIVATION_MANAGE)
  async cancelChallenge(
    @Req() req: RequestWithUser,
    @Param('id') challengeId: string,
  ): Promise<TerminalReactivationChallenge> {
    const tenantId = this.getEffectiveTenantId(req);
    const actorUserId = this.getActorUserId(req);
    return await this.reactivationService.cancelChallenge(
      tenantId,
      challengeId,
      actorUserId,
    );
  }

  @Post('terminals/:terminalId/reactivate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, PermissionsGuard)
  @UseInterceptors(TenantInterceptor)
  @RequirePermissions(AppPermission.ONBOARDING_ACTIVATION_MANAGE)
  async initiateTerminalReactivation(
    @Req() req: RequestWithUser,
    @Param('terminalId') terminalId: string,
    @Body() dto: InitiateTerminalReactivationDto,
  ): Promise<InitiateTerminalReactivationResult> {
    const tenantId = this.getEffectiveTenantId(req);
    const actorUserId = this.getActorUserId(req);
    return await this.reactivationService.initiateTerminalReactivation(
      tenantId,
      terminalId,
      actorUserId,
      dto,
    );
  }

  @Post('terminals/:terminalId/recovery-code')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard, PermissionsGuard)
  @UseInterceptors(TenantInterceptor)
  @RequirePermissions(AppPermission.ONBOARDING_ACTIVATION_MANAGE)
  async issueRecoveryCode(
    @Req() req: RequestWithUser,
    @Param('terminalId') terminalId: string,
  ): Promise<IssueRecoveryCodeResult> {
    const tenantId = this.getEffectiveTenantId(req);
    const actorUserId = this.getActorUserId(req);
    return await this.reactivationService.issueRecoveryCode(
      tenantId,
      terminalId,
      actorUserId,
    );
  }
}
