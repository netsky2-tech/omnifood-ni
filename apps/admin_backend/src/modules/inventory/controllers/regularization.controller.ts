import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  Req,
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

import { SyncRegularizationCorrectionsDto } from '../dto/sync-regularization-corrections.dto';

interface AuthenticatedUserRequest extends Request {
  user?: {
    sub?: string;
    id?: string;
    role?: string;
  };
}

@Controller('inventory/regularization')
@UseGuards(AuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class RegularizationController {
  constructor(
    private readonly regularizationService: KardexRegularizationService,
  ) {}

  @Get('pending')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getPending(@GetTenantId() tenantId: string) {
    return this.regularizationService.getPendingQueue(tenantId);
  }

  @Post('approve')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async approve(
    @GetTenantId() tenantId: string,
    @Body() dto: ApproveRegularizationDto,
    @Req() request: AuthenticatedUserRequest,
  ) {
    const userId = request.user?.sub || request.user?.id || 'unknown-user';
    const role = request.user?.role || 'manager';

    return this.regularizationService.approveRegularization(tenantId, {
      queueId: dto.queueId,
      approvedByUserId: userId,
      role,
      authMethod: dto.authMethod,
    });
  }

  @Post('sync')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.CASHIER)
  async syncCorrections(
    @GetTenantId() tenantId: string,
    @Body() dto: SyncRegularizationCorrectionsDto,
  ) {
    return this.regularizationService.syncCorrections(
      tenantId,
      dto.corrections,
    );
  }
}
