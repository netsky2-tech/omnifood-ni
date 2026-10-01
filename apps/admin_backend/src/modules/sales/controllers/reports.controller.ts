import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { AuthoritativeCurrentUserGuard } from '../../identity/guards/authoritative-current-user.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { Roles } from '../../../core/decorators/roles.decorator';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { UserRole } from '../../identity/entities/user.entity';
import { SalesReportsService } from '../services/sales-reports.service';
import { FiscalReportsService } from '../services/fiscal-reports.service';
import { SalesExportService } from '../services/sales-export.service';
import {
  CashierPerformanceQueryDto,
  CashierPerformanceReportDto,
  DailySeriesQueryDto,
  DailySeriesReportDto,
  HourlySalesQueryDto,
  HourlySalesReportDto,
  SalesDashboardQueryDto,
  SalesDashboardReportDto,
  TopProductsQueryDto,
  TopProductsReportDto,
} from '../dto/sales-reports.dto';
import {
  FiscalSequenceAuditReportDto,
  MonthlyFiscalSummaryQueryDto,
  MonthlyFiscalSummaryReportDto,
  SequenceAuditQueryDto,
  VoidedInvoicesQueryDto,
  VoidedInvoicesReportDto,
  XReportDto,
  XReportQueryDto,
  ZReportDto,
  ZReportQueryDto,
} from '../dto/fiscal-reports.dto';
import {
  ExportSalesBookQueryDto,
  ExportZReportsQueryDto,
  SalesBookExportDto,
  ZReportsExportDto,
} from '../dto/sales-export.dto';

@Controller('sales/reports')
@UseGuards(AuthGuard, AuthoritativeCurrentUserGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class ReportsController {
  constructor(
    private readonly salesReportsService: SalesReportsService,
    private readonly fiscalReportsService: FiscalReportsService,
    private readonly salesExportService: SalesExportService,
  ) {}

  @Get('dashboard')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getDashboard(
    @GetTenantId() tenantId: string,
    @Query() query: SalesDashboardQueryDto,
  ): Promise<SalesDashboardReportDto> {
    return this.salesReportsService.getDashboard(tenantId, query);
  }

  @Get('dashboard/daily-series')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getDashboardDailySeries(
    @GetTenantId() tenantId: string,
    @Query() query: DailySeriesQueryDto,
  ): Promise<DailySeriesReportDto> {
    return this.salesReportsService.getDashboardDailySeries(tenantId, query);
  }

  @Get('hourly-sales')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getHourlySales(
    @GetTenantId() tenantId: string,
    @Query() query: HourlySalesQueryDto,
  ): Promise<HourlySalesReportDto> {
    return this.salesReportsService.getHourlySales(tenantId, query);
  }

  @Get('top-products')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getTopProducts(
    @GetTenantId() tenantId: string,
    @Query() query: TopProductsQueryDto,
  ): Promise<TopProductsReportDto> {
    return this.salesReportsService.getTopProducts(tenantId, query);
  }

  @Get('cashier-performance')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getCashierPerformance(
    @GetTenantId() tenantId: string,
    @Query() query: CashierPerformanceQueryDto,
  ): Promise<CashierPerformanceReportDto> {
    return this.salesReportsService.getCashierPerformance(tenantId, query);
  }

  @Get('fiscal/monthly-summary')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getMonthlyFiscalSummary(
    @GetTenantId() tenantId: string,
    @Query() query: MonthlyFiscalSummaryQueryDto,
  ): Promise<MonthlyFiscalSummaryReportDto> {
    return this.fiscalReportsService.getMonthlySummary(tenantId, query);
  }

  @Get('fiscal/voided-invoices')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getVoidedInvoices(
    @GetTenantId() tenantId: string,
    @Query() query: VoidedInvoicesQueryDto,
  ): Promise<VoidedInvoicesReportDto> {
    return this.fiscalReportsService.getVoidedInvoices(tenantId, query);
  }

  @Get('fiscal/sequence-audit')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getSequenceAudit(
    @GetTenantId() tenantId: string,
    @Query() query: SequenceAuditQueryDto,
  ): Promise<FiscalSequenceAuditReportDto> {
    return this.fiscalReportsService.getSequenceAudit(tenantId, query);
  }

  @Get('export/sales-book')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async exportSalesBook(
    @GetTenantId() tenantId: string,
    @Query() query: ExportSalesBookQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SalesBookExportDto | string | Buffer> {
    const result = await this.salesExportService.exportSalesBook(
      tenantId,
      query,
    );
    if (result.format !== 'json') {
      res.setHeader('Content-Type', result.contentType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${result.filename}"`,
      );
      if (result.buffer) {
        return result.buffer;
      }
      return result.content ?? '';
    }
    return result.data;
  }

  @Get('export/z-reports')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async exportZReports(
    @GetTenantId() tenantId: string,
    @Query() query: ExportZReportsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ZReportsExportDto | string | Buffer> {
    const result = await this.salesExportService.exportZReports(
      tenantId,
      query,
    );
    if (result.format !== 'json') {
      res.setHeader('Content-Type', result.contentType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${result.filename}"`,
      );
      if (result.buffer) {
        return result.buffer;
      }
      return result.content ?? '';
    }
    return result.data;
  }

  /**
   * G1 (issue #522 Finding 1): real Corte X — partial reading of the
   * tenant's OPEN shift(s), explicitly non-closing (`closesShift: false`).
   * Tenant scoping rides TenantInterceptor + @GetTenantId; aggregation is
   * keyed on the shift, never on a fiscal day (open question P8).
   * DEC-03's manager-PIN-on-variance is a close-flow concern, not this
   * report. RBAC: OWNER/MANAGER only (unchanged from the stub).
   */
  @Get('x')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getXReport(
    @GetTenantId() tenantId: string,
    @Query() query: XReportQueryDto,
  ): Promise<XReportDto> {
    return this.salesExportService.getXReport(tenantId, query);
  }

  /**
   * G1 (issue #522 Finding 1): real Corte Z — definitive close view for
   * CLOSED shifts in the date range, with the DEC-04 reconciliation
   * blocker as a per-shift SIGNAL (reporting never hard-fails; the hard
   * block belongs to CashShiftService.closeShiftWithZReport). Shares the
   * single getZReportRows aggregation path with export/z-reports. RBAC:
   * OWNER/MANAGER only (unchanged from the stub).
   */
  @Get('z')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getZReport(
    @GetTenantId() tenantId: string,
    @Query() query: ZReportQueryDto,
  ): Promise<ZReportDto> {
    return this.salesExportService.getZReport(tenantId, query);
  }
}
