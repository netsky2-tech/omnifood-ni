import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Request } from 'express';
import { ActivationService } from '../services/activation.service';
import {
  CloseActivationFollowUpDto,
  DevicePrincipal,
  IngestActivationCheckDto,
  StartActivationDto,
} from '../dto/activation.dto';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { PermissionsGuard } from '../../identity/guards/permissions.guard';
import { RequirePermissions } from '../../identity/decorators/permissions.decorator';
import { AppPermission } from '../../identity/security/permissions.enum';

interface RequestWithUser extends Request {
  user?: {
    id?: string;
    sub?: string;
    email?: string;
    role?: string;
    tenant_id?: string;
    tenantId?: string;
    terminal_id?: string;
    terminalId?: string;
    custom_permissions?: string[];
  };
}

@Controller('onboarding/activation')
@UseGuards(AuthGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
export class ActivationController {
  constructor(private readonly activationService: ActivationService) {}

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

  private getDevicePrincipal(req: RequestWithUser): DevicePrincipal {
    const tenantId = this.getEffectiveTenantId(req);
    const terminalId =
      req.user?.terminalId ||
      req.user?.terminal_id ||
      (req.headers['x-device-terminal-id'] as string) ||
      (req.headers['x-terminal-id'] as string);

    if (!terminalId) {
      throw new UnauthorizedException(
        'DEVICE_PRINCIPAL_MISSING: Terminal context is required for activation evidence',
      );
    }

    return {
      tenantId,
      terminalId: terminalId.trim(),
      credentialIdentity: req.user?.id || req.user?.sub,
    };
  }

  @Post('attempts')
  @RequirePermissions(AppPermission.ONBOARDING_ACTIVATION_MANAGE)
  async startActivation(
    @Req() req: RequestWithUser,
    @Body() dto: StartActivationDto,
  ) {
    const tenantId = this.getEffectiveTenantId(req);
    const actorUserId = this.getActorUserId(req);
    return this.activationService.startActivation(tenantId, dto, actorUserId);
  }

  @Get('attempts/active')
  @RequirePermissions(AppPermission.ONBOARDING_READ)
  async getActiveAttempt(@Req() req: RequestWithUser) {
    const tenantId = this.getEffectiveTenantId(req);
    return this.activationService.getActiveAttempt(tenantId);
  }

  @Get('attempts/:id')
  @RequirePermissions(AppPermission.ONBOARDING_READ)
  async getAttempt(
    @Req() req: RequestWithUser,
    @Param('id') attemptId: string,
  ) {
    const tenantId = this.getEffectiveTenantId(req);
    return this.activationService.getAttempt(tenantId, attemptId);
  }

  @Post('attempts/:id/checks')
  async ingestCheck(
    @Req() req: RequestWithUser,
    @Param('id') attemptId: string,
    @Body() dto: IngestActivationCheckDto,
  ) {
    const devicePrincipal = this.getDevicePrincipal(req);
    return this.activationService.ingestCheck(attemptId, dto, devicePrincipal);
  }

  @Post('attempts/:id/finalize')
  @RequirePermissions(AppPermission.ONBOARDING_ACTIVATION_MANAGE)
  async finalizeActivation(
    @Req() req: RequestWithUser,
    @Param('id') attemptId: string,
  ) {
    const tenantId = this.getEffectiveTenantId(req);
    const actorUserId = this.getActorUserId(req);
    return this.activationService.finalizeActivation(
      tenantId,
      attemptId,
      actorUserId,
    );
  }

  @Get('attempts/:id/follow-ups')
  @RequirePermissions(AppPermission.ONBOARDING_READ)
  async getFollowUps(
    @Req() req: RequestWithUser,
    @Param('id') attemptId: string,
  ) {
    const tenantId = this.getEffectiveTenantId(req);
    return this.activationService.getFollowUps(tenantId, attemptId);
  }

  @Post('follow-ups/:followUpId/close')
  @RequirePermissions(AppPermission.ONBOARDING_ACTIVATION_MANAGE)
  async closeFollowUp(
    @Req() req: RequestWithUser,
    @Param('followUpId') followUpId: string,
    @Body() dto: CloseActivationFollowUpDto,
  ) {
    const tenantId = this.getEffectiveTenantId(req);
    const actorUserId = this.getActorUserId(req);
    return this.activationService.closeFollowUp(
      tenantId,
      followUpId,
      dto,
      actorUserId,
    );
  }
}
