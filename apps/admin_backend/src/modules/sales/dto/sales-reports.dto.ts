import { IsOptional, IsString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class SalesDashboardQueryDto {
  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

export class HourlySalesQueryDto {
  @IsOptional()
  @IsString()
  date?: string;
}

export class TopProductsQueryDto {
  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;
}

export class CashierPerformanceQueryDto {
  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

/**
 * Daily Sales Trend query (PRD §14, Dashboard V2 Batch 5a). Both bounds are
 * required: a range shorter than 2 days must use the hourly route, and the
 * service enforces the 2–60 day inclusive window.
 */
export class DailySeriesQueryDto {
  @IsString()
  startDate!: string;

  @IsString()
  endDate!: string;
}

export interface PaymentMethodsBreakdownDto {
  cashNio: number;
  cashUsd: number;
  cardNio: number;
  cardUsd: number;
  other: number;
  totalNio: number;
}

/**
 * V2 reporting period metadata (spec §7.2). The reporting timezone is fixed to
 * America/Managua (PRD §8). The local bounds are the normalized Managua
 * calendar dates (YYYY-MM-DD) actually applied to the query; a side is null
 * when the corresponding query bound was not supplied (the route remains
 * unbounded on that side rather than fabricating a default).
 */
export interface ReportingPeriodMetadataDto {
  timezone: 'America/Managua';
  localStartDate: string | null;
  localEndDate: string | null;
}

export interface SalesDashboardReportDto {
  /**
   * @deprecated Legacy ambiguous field: post-discount AND post-tax. Dashboard
   * V2 work must use `netSalesNio` instead (spec §7.2/§7.3). Retained until
   * all known existing consumers migrate.
   */
  grossSales: number;
  /**
   * @deprecated Legacy ambiguous name: post-discount, PRE-tax sum of
   * `subtotal`. Retained for existing consumers (spec §7.3).
   */
  netTaxableSales: number;
  totalTax: number;
  totalDiscounts: number;
  invoiceCount: number;
  /**
   * @deprecated Legacy average is post-tax (`grossSales / invoiceCount`);
   * Dashboard V2 must use `averageTicketNetNio` (PRD §7.5). Retained for
   * existing consumers (spec §7.3).
   */
  ticketAverage: number;

  // V2 explicit semantics (spec §7.2) — additive, never redefine legacy fields.
  /** Net Sales: Σ invoice.subtotal (post-discount, pre-tax, credit notes net in as persisted). */
  netSalesNio: number;
  /** Pre-discount Sales: netSalesNio + totalDiscountsNio (PRD §7.3). */
  preDiscountSalesNio: number;
  /** Completed Tickets: finalized, not canceled/void documents (PRD §7.1). */
  completedTicketCount: number;
  /** Average Ticket = netSalesNio / completedTicketCount; null when count is 0 (PRD §7.5). */
  averageTicketNetNio: number | null;
  /** V2 tax total (same aggregation as legacy `totalTax`, explicit currency-qualified name). */
  totalTaxNio: number;
  /** V2 discount total (same aggregation as legacy `totalDiscounts`). */
  totalDiscountsNio: number;

  paymentMethodsBreakdown: PaymentMethodsBreakdownDto;
  reportingPeriod: ReportingPeriodMetadataDto;
  startDate?: string;
  endDate?: string;
  generatedAt: string;
}

export interface HourlySalesBucketDto {
  hour: number;
  invoiceCount: number;
  totalSales: number;
}

export interface HourlySalesReportDto {
  date: string;
  totalSales: number;
  totalInvoices: number;
  generatedAt: string;
  hourly: HourlySalesBucketDto[];
}

export interface TopProductItemDto {
  productId: string;
  productName: string;
  totalQuantity: number;
  totalRevenue: number;
}

export interface TopProductsReportDto {
  startDate?: string;
  endDate?: string;
  generatedAt: string;
  products: TopProductItemDto[];
}

export interface CashierPerformanceItemDto {
  userId: string;
  cashierName: string;
  invoiceCount: number;
  totalSales: number;
  ticketAverage: number;
}

export interface CashierPerformanceReportDto {
  startDate?: string;
  endDate?: string;
  generatedAt: string;
  cashiers: CashierPerformanceItemDto[];
}

/** One daily bucket of the Sales Trend chart (PRD §14, spec §7.2 semantics). */
export interface DailySeriesPointDto {
  /** Managua local calendar day (YYYY-MM-DD) the bucket belongs to. */
  date: string;
  /** Net Sales for the day: Σ invoice.subtotal over completed rows (spec §7.2). */
  netSalesNio: number;
  completedTicketCount: number;
  /** Net Sales / tickets; null on a zero-ticket day (PRD §7.5: "—"). */
  averageTicketNetNio: number | null;
}

export interface DailySeriesReportDto {
  /**
   * Every calendar day of the requested range, in order. Zero-sales days are
   * present with netSalesNio 0 and a null average (continuous chart x-axis).
   */
  days: DailySeriesPointDto[];
  reportingPeriod: ReportingPeriodMetadataDto;
  generatedAt: string;
}
