import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  Req,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { PermissionsGuard } from '../../identity/guards/permissions.guard';
import { RequirePermissions } from '../../identity/decorators/permissions.decorator';
import { AppPermission } from '../../identity/security/permissions.enum';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { OnboardingTelemetryService } from '../telemetry/onboarding-telemetry.service';
import {
  IngestTelemetryEventDto,
  OnboardingTelemetryEventName,
} from '../telemetry/onboarding-telemetry.types';

interface RequestWithUser extends Request {
  user?: {
    sub?: string;
    userId?: string;
    tenantId?: string;
    tenant_id?: string;
    role?: string;
  };
}

@Controller('onboarding/telemetry')
@UseGuards(AuthGuard, RolesGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
export class OnboardingTelemetryController {
  constructor(
    private readonly telemetryService: OnboardingTelemetryService,
  ) {}

  private requireTenant(tenantId?: string): string {
    if (!tenantId?.trim()) {
      throw new UnauthorizedException('Tenant context is required');
    }
    return tenantId.trim();
  }

  @Post('events')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(AppPermission.ONBOARDING_READ)
  async recordEvent(
    @Req() req: RequestWithUser,
    @Body() body: Omit<IngestTelemetryEventDto, 'tenantId'>,
    @GetTenantId() tenantIdParam?: string,
  ) {
    const tenantId = this.requireTenant(
      tenantIdParam ?? req.user?.tenant_id ?? req.user?.tenantId,
    );

    return this.telemetryService.recordEvent({
      ...body,
      tenantId,
    });
  }

  @Get('events')
  @RequirePermissions(AppPermission.ONBOARDING_READ)
  async getEvents(
    @Req() req: RequestWithUser,
    @GetTenantId() tenantIdParam?: string,
    @Query('eventName') eventName?: OnboardingTelemetryEventName,
  ) {
    const tenantId = this.requireTenant(
      tenantIdParam ?? req.user?.tenant_id ?? req.user?.tenantId,
    );

    return this.telemetryService.getEventsByTenant(tenantId, eventName);
  }
}
