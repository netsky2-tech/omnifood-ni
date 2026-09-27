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

/**
 * Hourly Sales query. Legacy mode: an optional `date` (defaults to today).
 * Range mode (Dashboard V2 Batch 5c-backend, FR-HOURLY-01): optional
 * `startDate`/`endDate` (both required together, mutually exclusive with
 * `date`); the service enforces the same 2–60 day inclusive window as the
 * daily series and rejects a 1-day range (use `date` instead).
 */
export class HourlySalesQueryDto {
  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
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

/**
 * PRD §21.1 / spec §18.7 tip-coverage metadata: distinguishes historical NULL
 * legacy rows (never backfilled, AD-10) from genuine zero-tip sales so the
 * dashboard never interprets missing tip data as "no tips".
 */
export interface TipCoverageDto {
  /** Completed invoices with a recorded (non-NULL) V2 tip snapshot. */
  recordedInvoicesCount: number;
  /** All completed invoices in the period (legacy NULL rows included). */
  totalInvoicesCount: number;
}

/**
 * Voluntary-tip KPI summary (PRD §21.2, spec §18.7, Dashboard V2 Batch 7).
 * Tips are NEVER merged into Net Sales or any other sales total (PRD §21.3).
 */
export interface TipsSummaryDto {
  /** Σ tip amounts; null when no tip was recorded in the period (never a fabricated 0). */
  totalTipsNio: number | null;
  /** Completed invoices with tip > 0 (PRD §21.2 tipped tickets). */
  tippedTicketCount: number;
  /** totalTipsNio / tippedTicketCount; null when no ticket tipped. */
  averageTipNio: number | null;
  /** totalTipsNio / sale-time tip-eligible base × 100; null when the base is 0. */
  tipRate: number | null;
  tipCoverage: TipCoverageDto;
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

  /**
   * Voluntary-tip summary (PRD §21, Batch 7). Strictly separate from every
   * sales total (PRD §21.3). Consumers must honor tipCoverage: a period with
   * zero recorded tips is NOT evidence that tips are disabled (PRD §21.4).
   */
  tipsSummary?: TipsSummaryDto;

  paymentMethodsBreakdown: PaymentMethodsBreakdownDto;
  reportingPeriod: ReportingPeriodMetadataDto;
  startDate?: string;
  endDate?: string;
  generatedAt: string;
}

export interface HourlySalesBucketDto {
  hour: number;
  invoiceCount: number;
  /**
   * @deprecated Legacy ambiguous field: post-discount AND post-tax (Σ
   * `invoice.total` per bucket). Retained unchanged; V2 work must use
   * `netSalesNio` (spec §7.2/FR-HOURLY-03).
   */
  totalSales: number;
  /**
   * Net Sales per bucket: Σ `invoice.subtotal` (post-discount, pre-tax,
   * credit notes net in as persisted) over the same invoice set — reconciles
   * with the executive KPI (FR-HOURLY-03).
   */
  netSalesNio: number;
}

/** Range metadata for the hourly report (FR-HOURLY-01 averaged distribution). */
export interface HourlySalesReportMetaDto {
  /** Number of local calendar days aggregated (1 for a single-day query). */
  dayCount: number;
}

export interface HourlySalesReportDto {
  /**
   * Normalized Managua calendar date of the query: the requested day in
   * single-day mode; the range start in range mode.
   */
  date: string;
  totalSales: number;
  totalInvoices: number;
  /** Present since Batch 5c-backend; `{ dayCount: 1 }` in single-day mode. */
  meta: HourlySalesReportMetaDto;
  generatedAt: string;
  hourly: HourlySalesBucketDto[];
}

export interface TopProductItemDto {
  productId: string;
  productName: string;
  totalQuantity: number;
  /**
   * @deprecated Legacy ambiguous field: tax-INCLUSIVE revenue (Σ
   * `invoice_items.total`). Retained unchanged; V2 work must use
   * `netRevenueNio` (spec §7.2/FR-PRODUCT-01).
   */
  totalRevenue: number;
  /**
   * Net Sales contribution: Σ line `(total − taxAmount)` per product,
   * post-discount, pre-tax, credit notes net in as persisted, with any
   * per-invoice rounding residue allocated by largest remainder so
   * `Σ products.netRevenueNio` reconciles exactly with the KPI
   * `netSalesNio` (FR-PRODUCT-01).
   */
  netRevenueNio: number;
}

export interface TopProductsReportDto {
  startDate?: string;
  endDate?: string;
  generatedAt: string;
  /**
   * Authoritative share denominator (FR-PRODUCT-01): the period's Net Sales
   * (post-discount, pre-tax) computed with the SAME shared semantics helper
   * and over the SAME bounded invoice set the product aggregates were built
   * from, so `periodNetSalesNio` reconciles exactly with the KPI
   * `netSalesNio` and `Σ products.netRevenueNio <= periodNetSalesNio` even
   * when the Top-N list is truncated. The deprecated tax-inclusive
   * `TopProductItemDto.totalRevenue` must never be used as this denominator.
   */
  periodNetSalesNio: number;
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
