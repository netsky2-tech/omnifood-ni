import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { CreateInstallTokenDto } from '../dto/create-install-token.dto';
import {
  CreateInstallTokenResult,
  InstallKitService,
  InstallTokenListItem,
} from '../services/install-kit.service';

interface RequestWithUser extends Request {
  user?: {
    id?: string;
    sub?: string;
    tenantId?: string;
    tenant_id?: string;
  };
}

/**
 * Tenant-scoped management endpoints for POS Install Kit tokens (issue #958).
 * Mounted under global prefix `/api` -> `/api/onboarding/install-tokens`.
 */
@Controller('onboarding/install-tokens')
@UseGuards(AuthGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
@RequirePermissions(AppPermission.ONBOARDING_ACTIVATION_MANAGE)
export class InstallTokensController {
  constructor(private readonly installKitService: InstallKitService) {}

  private getEffectiveTenantId(req: RequestWithUser): string {
    const tenantId = req.user?.tenantId || req.user?.tenant_id;
    if (!tenantId) {
      throw new UnauthorizedException('Tenant context not found in request');
    }
    return tenantId;
  }

  private getActorUserId(req: RequestWithUser): string {
    const actorUserId = req.user?.id || req.user?.sub;
    if (!actorUserId) {
      throw new UnauthorizedException('Actor context not found in request');
    }
    return actorUserId;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createToken(
    @Req() req: RequestWithUser,
    @Body() dto: CreateInstallTokenDto,
  ): Promise<CreateInstallTokenResult> {
    const tenantId = this.getEffectiveTenantId(req);
    const actorUserId = this.getActorUserId(req);
    return await this.installKitService.createToken(tenantId, actorUserId, {
      label: dto.label,
      revokePrevious: dto.revokePrevious,
    });
  }

  @Get()
  async listTokens(
    @Req() req: RequestWithUser,
  ): Promise<InstallTokenListItem[]> {
    const tenantId = this.getEffectiveTenantId(req);
    return await this.installKitService.listTokens(tenantId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeToken(
    @Req() req: RequestWithUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    const tenantId = this.getEffectiveTenantId(req);
    await this.installKitService.revokeToken(tenantId, id);
  }
}
