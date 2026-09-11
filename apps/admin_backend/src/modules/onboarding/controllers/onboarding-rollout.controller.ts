import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  Req,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { IsInt, Min, Max } from 'class-validator';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { PermissionsGuard } from '../../identity/guards/permissions.guard';
import { RequirePermissions } from '../../identity/decorators/permissions.decorator';
import { AppPermission } from '../../identity/security/permissions.enum';
import { Roles } from '../../../core/decorators/roles.decorator';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { UserRole } from '../../identity/entities/user.entity';
import {
  OnboardingFeatureRolloutService,
  OnboardingFeatureFlag,
} from '../services/onboarding-feature-rollout.service';

export class ApplyCutoverStageDto {
  @IsInt()
  @Min(1)
  @Max(10)
  stage!: number;
}

interface RequestWithUser extends Request {
  user?: {
    sub?: string;
    userId?: string;
    tenantId?: string;
    tenant_id?: string;
    role?: string;
  };
}

@Controller('onboarding/rollout')
@UseGuards(AuthGuard, RolesGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
export class OnboardingRolloutController {
  constructor(
    private readonly rolloutService: OnboardingFeatureRolloutService,
  ) {}

  private getTenantId(req: RequestWithUser): string {
    const tenantId = req.user?.tenantId || req.user?.tenant_id;
    if (!tenantId?.trim()) {
      throw new UnauthorizedException('Tenant context is required');
    }
    return tenantId.trim();
  }

  private buildFlagMap(tenantId: string): Record<string, boolean> {
    const map: Record<string, boolean> = {};
    for (const flag of Object.values(OnboardingFeatureFlag)) {
      map[flag] = this.rolloutService.isEnabled(tenantId, flag);
    }
    return map;
  }

  @Get('status')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @RequirePermissions(AppPermission.ONBOARDING_READ)
  getStatus(@Req() req: RequestWithUser) {
    const tenantId = this.getTenantId(req);
    return {
      tenantId,
      flags: this.buildFlagMap(tenantId),
    };
  }

  @Post('stage')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.OWNER)
  @RequirePermissions(AppPermission.ONBOARDING_START)
  applyStage(
    @Req() req: RequestWithUser,
    @Body() dto: ApplyCutoverStageDto,
  ) {
    const tenantId = this.getTenantId(req);
    this.rolloutService.applyCutoverStage(tenantId, dto.stage);
    return {
      tenantId,
      stage: dto.stage,
      flags: this.buildFlagMap(tenantId),
    };
  }

  @Post('rollback')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.OWNER)
  @RequirePermissions(AppPermission.ONBOARDING_START)
  rollback(@Req() req: RequestWithUser) {
    const tenantId = this.getTenantId(req);
    this.rolloutService.rollbackAll(tenantId);
    return {
      tenantId,
      status: 'ROLLED_BACK',
      flags: this.buildFlagMap(tenantId),
    };
  }
}
