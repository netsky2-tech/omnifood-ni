import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  StreamableFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { InventoryReportsService } from '../services/inventory-reports.service';
import { InventoryValuationService } from '../inventory-valuation.service';
import { TheoreticalCostService } from '../services/theoretical-cost.service';
import {
  ApplyValuationWritedownDto,
  SetMarketPriceDto,
} from '../dto/valuation.dto';
import { CountSessionPrintableService } from '../services/count-session-printable.service';
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
  constructor(
    private readonly reportsService: InventoryReportsService,
    private readonly countSessionPrintableService: CountSessionPrintableService,
    private readonly valuationService: InventoryValuationService,
    private readonly theoreticalCostService: TheoreticalCostService,
  ) {}

  @Get('valuation')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getValuationReport(
    @GetTenantId() tenantId: string,
  ): Promise<InventoryValuationReportDto> {
    return this.reportsService.getValuationReport(tenantId);
  }

  /**
   * R8 (H8): the cost/margin surface per dish the theoretical-cost calculator
   * never had. `GET dish-margins` prices every COMPOUND/PREPARED product with
   * an active published recipe; `GET theoretical-cost?productId=` prices one.
   */
  @Get('dish-margins')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getDishMargins(
    @GetTenantId() tenantId: string,
  ): Promise<unknown> {
    return this.theoreticalCostService.listDishMargins(tenantId);
  }

  @Get('theoretical-cost')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getTheoreticalCost(
    @GetTenantId() tenantId: string,
    @Query('productId') productId: string,
  ): Promise<unknown> {
    return this.theoreticalCostService.getProductTheoreticalCost(
      tenantId,
      productId,
    );
  }

  /**
   * R12 (S11): the live entry point the lower-of-cost-or-market capability
   * never had. `setMarketPrice` and `applyLowerOfCostWritedown` were
   * implemented and tested, with no route invoking them, so R-01 (Ley 822
   * art. 44) was not actually delivered by the system.
   */
  @Post('valuation/market-price')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async setMarketPrice(
    @GetTenantId() tenantId: string,
    @Body() dto: SetMarketPriceDto,
  ): Promise<unknown> {
    return this.valuationService.setMarketPrice({
      tenantId,
      insumoId: dto.insumoId,
      marketPriceNio: dto.marketPriceNio,
      effectiveDate: dto.effectiveDate,
      sourceNote: dto.sourceNote ?? null,
    });
  }

  @Post('valuation/writedown')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async applyValuationWritedown(
    @GetTenantId() tenantId: string,
    @Body() dto: ApplyValuationWritedownDto,
  ): Promise<unknown> {
    return this.valuationService.applyLowerOfCostWritedown({
      tenantId,
      asOfDate: dto.asOfDate,
    });
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

  /**
   * R19 T3 (S10/S14/S15-bis): the persisted count session's printable,
   * signable list as a server-side PDF. Served `inline` (not as a forced
   * download) because the document's purpose is to be printed and signed by
   * hand on every sheet (Reglamento de la Ley 822, art. 33, R-05).
   *
   * Read route on this EXISTING human controller: no new transport-registry
   * declaration is needed (the controller is already classified `human`).
   */
  @Get('count-sessions/:sessionId/printable-list')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getCountSessionPrintableList(
    @GetTenantId() tenantId: string,
    @Param('sessionId') sessionId: string,
  ): Promise<StreamableFile> {
    const result =
      await this.countSessionPrintableService.buildPrintableCountList(
        tenantId,
        sessionId,
      );
    // R13 (V12-1): returning a Buffer with a passthrough `@Res` gets
    // JSON-serialized on the wire ({"type":"Buffer","data":[…]}), so the
    // browser received JSON text with a PDF content type. StreamableFile
    // carries the raw bytes and the headers, like the menu-import template.
    return new StreamableFile(result.buffer, {
      type: result.contentType,
      disposition: `inline; filename="${result.filename}"`,
    });
  }
}
