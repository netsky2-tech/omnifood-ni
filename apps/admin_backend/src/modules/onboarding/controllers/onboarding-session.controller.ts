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
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { PermissionsGuard } from '../../identity/guards/permissions.guard';
import { RequirePermissions } from '../../identity/decorators/permissions.decorator';
import { AppPermission } from '../../identity/security/permissions.enum';
import { Roles } from '../../../core/decorators/roles.decorator';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { UserRole } from '../../identity/entities/user.entity';
import {
  OnboardingSessionService,
  OnboardingStartSource,
} from '../services/onboarding-session.service';
import { OnboardingReadinessEvaluator } from '../services/onboarding-readiness.evaluator';
import { OnboardingStateReconciler } from '../services/onboarding-state.reconciler';
import { LegacyImportIntegrityReportService } from '../services/legacy-import-integrity-report.service';

interface RequestWithUser extends Request {
  user?: {
    sub?: string;
    userId?: string;
    tenantId?: string;
    tenant_id?: string;
    role?: string;
  };
}

export interface StartSessionDto {
  source?: OnboardingStartSource;
}

@Controller('onboarding')
@UseGuards(AuthGuard, RolesGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
export class OnboardingSessionController {
  constructor(
    private readonly sessionService: OnboardingSessionService,
    private readonly readinessEvaluator: OnboardingReadinessEvaluator,
    private readonly stateReconciler: OnboardingStateReconciler,
    @Optional()
    private readonly integrityReportService?: LegacyImportIntegrityReportService,
  ) {}

  private requireTenant(tenantId?: string): string {
    if (!tenantId?.trim()) {
      throw new UnauthorizedException('Tenant context is required');
    }
    return tenantId.trim();
  }

  @Post('session/start')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.OWNER)
  @RequirePermissions(AppPermission.ONBOARDING_START)
  async startSession(
    @Req() req: RequestWithUser,
    @Body() body: StartSessionDto,
    @GetTenantId() tenantIdParam?: string,
  ) {
    const tenantId = this.requireTenant(
      tenantIdParam ?? req.user?.tenant_id ?? req.user?.tenantId,
    );
    const actorUserId = req.user?.sub ?? req.user?.userId;
    const source = body?.source ?? OnboardingStartSource.SETUP_CENTER;

    await this.sessionService.ensureOnboardingStarted({
      tenantId,
      actorUserId,
      source,
    });

    const readiness = await this.readinessEvaluator.evaluate(tenantId);
    const session = await this.stateReconciler.reconcile(tenantId, readiness);

    return {
      session,
      readiness,
    };
  }

  @Get('session')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @RequirePermissions(AppPermission.ONBOARDING_READ)
  async getSession(
    @Req() req: RequestWithUser,
    @GetTenantId() tenantIdParam?: string,
  ) {
    const tenantId = this.requireTenant(
      tenantIdParam ?? req.user?.tenant_id ?? req.user?.tenantId,
    );

    let session = await this.sessionService.getSession(tenantId);
    if (!session) {
      session = await this.sessionService.ensureOnboardingStarted({
        tenantId,
        actorUserId: req.user?.sub ?? req.user?.userId,
        source: OnboardingStartSource.SETUP_CENTER,
      });
    }

    const readiness = await this.readinessEvaluator.evaluate(tenantId);
    session = await this.stateReconciler.reconcile(tenantId, readiness);

    return {
      session,
      readiness,
    };
  }

  @Get('readiness')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @RequirePermissions(AppPermission.ONBOARDING_READ)
  async getReadiness(
    @Req() req: RequestWithUser,
    @GetTenantId() tenantIdParam?: string,
  ) {
    const tenantId = this.requireTenant(
      tenantIdParam ?? req.user?.tenant_id ?? req.user?.tenantId,
    );
    return this.readinessEvaluator.evaluate(tenantId);
  }

  /**
   * Formally reconcile legacy baseline tenant with measurementEligible=false (ONB1.10A).
   * INVARIANT: Never fabricates or synthesizes a fake historical TTFSS (Rule 73, AC-56).
   */
  @Post('session/legacy-baseline/reconcile')
  @Roles(UserRole.OWNER)
  @RequirePermissions(AppPermission.ONBOARDING_START)
  async reconcileLegacyBaseline(
    @Req() req: RequestWithUser,
    @GetTenantId() tenantIdParam?: string,
  ) {
    const tenantId = this.requireTenant(
      tenantIdParam ?? req.user?.tenant_id ?? req.user?.tenantId,
    );
    const actorId = req.user?.sub ?? req.user?.userId;
    if (!this.integrityReportService) {
      throw new UnauthorizedException('Reconciliation service unavailable');
    }
    return this.integrityReportService.reconcileLegacyBaselineSession(
      tenantId,
      actorId,
    );
  }
}
