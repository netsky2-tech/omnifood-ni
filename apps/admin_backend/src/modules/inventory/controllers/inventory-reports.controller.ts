import {
  Controller,
  Get,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { InventoryReportsService } from '../services/inventory-reports.service';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { Roles } from '../../../core/decorators/roles.decorator';
import { UserRole } from '../../identity/entities/user.entity';
import { MovementType } from '../entities/inventory-movement.entity';
import {
  CogsReportDto,
  InventoryAlertsSummaryDto,
  InventoryValuationReportDto,
  KardexReportDto,
} from '../dto/inventory-reports.dto';

@Controller('inventory/reports')
@UseGuards(AuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class InventoryReportsController {
  constructor(private readonly reportsService: InventoryReportsService) {}

  @Get('valuation')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getValuationReport(
    @GetTenantId() tenantId: string,
  ): Promise<InventoryValuationReportDto> {
    return this.reportsService.getValuationReport(tenantId);
  }

  @Get('cogs')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getCogsReport(
    @GetTenantId() tenantId: string,
    @Query('from') fromDate?: string,
    @Query('to') toDate?: string,
  ): Promise<CogsReportDto> {
    return this.reportsService.getCogsReport(tenantId, fromDate, toDate);
  }

  @Get('kardex')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getKardexReport(
    @GetTenantId() tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('insumoId') insumoId?: string,
    @Query('type') type?: MovementType,
    @Query('warehouseId') warehouseId?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ): Promise<KardexReportDto> {
    return this.reportsService.getKardexReport(tenantId, {
      from,
      to,
      insumoId,
      type,
      warehouseId,
      limit: limit != null ? Number(limit) : undefined,
      offset: offset != null ? Number(offset) : undefined,
    });
  }

  @Get('alerts')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getAlertsSummaryReport(
    @GetTenantId() tenantId: string,
  ): Promise<InventoryAlertsSummaryDto> {
    return this.reportsService.getAlertsSummaryReport(tenantId);
  }
}
