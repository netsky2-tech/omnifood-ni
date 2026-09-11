import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { Roles } from '../../../core/decorators/roles.decorator';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { UserRole } from '../../identity/entities/user.entity';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { FulfillmentRetentionService } from '../services/fulfillment-retention.service';

export interface PurgeRetentionRequestDto {
  daysOld?: number;
}

@Controller('fulfillment')
@UseInterceptors(TenantInterceptor)
export class FulfillmentRetentionController {
  constructor(private readonly retentionService: FulfillmentRetentionService) {}

  private requireTenant(tenantId?: string): string {
    if (!tenantId?.trim()) {
      throw new UnauthorizedException('Tenant context is required');
    }
    return tenantId;
  }

  @Post('retention/purge')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  async purgeRetention(
    @GetTenantId() tenantId: string | undefined,
    @Body() body?: PurgeRetentionRequestDto,
  ) {
    const validTenantId = this.requireTenant(tenantId);
    const days = body?.daysOld && body.daysOld > 0 ? body.daysOld : 90;
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.retentionService.purgeRetentionData(validTenantId, cutoffDate);
  }

  @Get('records/:id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.CASHIER, UserRole.WAITER)
  async getFulfillmentRecord(
    @GetTenantId() tenantId: string | undefined,
    @Param('id') id: string,
  ) {
    const validTenantId = this.requireTenant(tenantId);
    const record = await this.retentionService.findFulfillmentRecord(
      validTenantId,
      id,
    );
    if (!record) {
      throw new NotFoundException(`Fulfillment record ${id} not found.`);
    }
    return record;
  }

  @Get('records/sale/:saleId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.CASHIER, UserRole.WAITER)
  async getFulfillmentRecordsBySale(
    @GetTenantId() tenantId: string | undefined,
    @Param('saleId') saleId: string,
  ) {
    const validTenantId = this.requireTenant(tenantId);
    return this.retentionService.findFulfillmentRecordsBySaleId(
      validTenantId,
      saleId,
    );
  }
}
