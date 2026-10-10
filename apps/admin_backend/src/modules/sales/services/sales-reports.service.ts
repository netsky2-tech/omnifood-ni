import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  DataSource,
  FindOptionsWhere,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import {
  currentLocalDateKey,
  localDateKeySpanDays,
  parseLocalDateKey,
  ReportingPeriodValidationError,
  resolveReportingBounds,
  ResolvedReportingBounds,
} from '../../../core/reporting/reporting-period';
import {
  allocateInvoiceLineNetSales,
  computeDailySalesSeries,
  computeSalesReportingTipsSummary,
  computeSalesReportingTotals,
} from '../../../core/reporting/sales-reporting-semantics';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceItem } from '../entities/invoice-item.entity';
import { Payment } from '../entities/payment.entity';
import { User } from '../../identity/entities/user.entity';
import {
  CashierPerformanceItemDto,
  CashierPerformanceQueryDto,
  CashierPerformanceReportDto,
  DailySeriesQueryDto,
  DailySeriesReportDto,
  HourlySalesBucketDto,
  HourlySalesQueryDto,
  HourlySalesReportDto,
  PaymentMethodsBreakdownDto,
  SalesDashboardQueryDto,
  SalesDashboardReportDto,
  TopProductItemDto,
  TopProductsQueryDto,
  TopProductsReportDto,
} from '../dto/sales-reports.dto';

/** PRD §14 FR-CHART-02: daily buckets for 2–60 day inclusive ranges. */
const DAILY_SERIES_MIN_DAYS = 2;
const DAILY_SERIES_MAX_DAYS = 60;

const round2 = (value: number): number =>
  Number((Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2));

const round4 = (value: number): number =>
  Number((Math.round((value + Number.EPSILON) * 10000) / 10000).toFixed(4));

@Injectable()
export class SalesReportsService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(InvoiceItem)
    private readonly itemRepo: Repository<InvoiceItem>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    // Issue #556 stage 12d F1: the users read is bound through the
    // tenant-bound transaction manager (FORCE RLS on users fails closed
    // on a pooled connection); the pooled injection stays for module
    // wiring and as the spec's runtime-teeth tripwire.
    private readonly dataSource: DataSource,
  ) {}

  async getDashboard(
    tenantId: string,
    query?: SalesDashboardQueryDto,
  ): Promise<SalesDashboardReportDto> {
    const bounds = this.resolvePeriodBounds(query?.startDate, query?.endDate);
    const start = bounds.startInclusiveUtc;
    const end = bounds.endInclusiveUtc;
    const whereClause: FindOptionsWhere<Invoice> = {
      tenant_id: tenantId,
      isCanceled: false,
    };

    if (start && end) {
      whereClause.created_at = Between(start, end);
    } else if (start) {
      whereClause.created_at = MoreThanOrEqual(start);
    } else if (end) {
      whereClause.created_at = LessThanOrEqual(end);
    }

    // Issue #581 WU1: invoices is a direct:SIUD RLS-forced table — the
    // pooled find silently returned zero rows under the production
    // NOBYPASSRLS role. Bound read, identical query semantics.
    const invoices = await runInTenantTransaction(
      this.dataSource,
      tenantId,
      (manager) =>
        manager.getRepository(Invoice).find({
          where: whereClause,
          relations: ['items', 'payments'],
          order: { created_at: 'DESC' },
        }),
    );

    let grossSales = 0;
    let netTaxableSales = 0;
    let totalTax = 0;
    let totalDiscounts = 0;

    let cashNio = 0;
    let cashUsd = 0;
    let cardNio = 0;
    let cardUsd = 0;
    let otherPaymentsNio = 0;
    let totalPaymentsNio = 0;

    for (const inv of invoices) {
      grossSales = round2(grossSales + Number(inv.total ?? 0));
      netTaxableSales = round2(netTaxableSales + Number(inv.subtotal ?? 0));
      totalTax = round2(totalTax + Number(inv.totalTax ?? 0));

      if (inv.items && inv.items.length > 0) {
        for (const item of inv.items) {
          totalDiscounts = round2(totalDiscounts + Number(item.discount ?? 0));
        }
      }

      if (inv.payments && inv.payments.length > 0) {
        for (const p of inv.payments) {
          const method = (p.method ?? '').trim().toUpperCase();
          const currency = (p.currency ?? 'NIO').trim().toUpperCase();
          const amount = Number(p.amount ?? 0);
          const exchangeRate = Number(p.exchangeRate ?? 1.0);
          const amountNio =
            Number(p.amountNio ?? 0) > 0
              ? Number(p.amountNio)
              : currency === 'USD'
                ? round2(amount * exchangeRate)
                : amount;

          // AG-08 reporting net: tendered amounts include over-tender change,
          // which must not count as collected money. `changeGiven` defaults to
          // 0 in the schema; legacy rows without the value are treated as
          // zero (reported as an approximation until decomposed).
          const changeRaw = Number(p.changeGiven ?? 0);
          const changeCurrency = (p.changeCurrency ?? 'NIO')
            .trim()
            .toUpperCase();
          const changeNio =
            changeRaw > 0
              ? changeCurrency === 'USD'
                ? round2(changeRaw * exchangeRate)
                : changeRaw
              : 0;
          const effectiveNio = round2(amountNio - changeNio);
          const effectiveUsd =
            changeRaw > 0 && changeCurrency === 'USD'
              ? round2(amount - changeRaw)
              : amount;

          totalPaymentsNio = round2(totalPaymentsNio + effectiveNio);

          if (method === 'CASH' || method === 'EFECTIVO') {
            if (currency === 'USD') {
              cashUsd = round2(cashUsd + effectiveUsd);
            } else {
              cashNio = round2(cashNio + effectiveNio);
            }
          } else if (
            method === 'CARD' ||
            method === 'TARJETA' ||
            method === 'BAC' ||
            method === 'BANPRO'
          ) {
            if (currency === 'USD') {
              cardUsd = round2(cardUsd + effectiveUsd);
            } else {
              cardNio = round2(cardNio + effectiveNio);
            }
          } else {
            otherPaymentsNio = round2(otherPaymentsNio + effectiveNio);
          }
        }
      }
    }

    const invoiceCount = invoices.length;
    const ticketAverage =
      invoiceCount > 0 ? round2(grossSales / invoiceCount) : 0;

    // V2 explicit semantics (spec §7.1/§7.2): same completed rows the legacy
    // fields aggregate over (isCanceled = false, credit notes net in as
    // persisted), expressed through the shared semantics helper.
    const salesTotals = computeSalesReportingTotals(invoices);

    // Batch 7 Slice 3 (PRD §21): voluntary-tip aggregation over the SAME
    // completed-row set. Tips stay strictly separate from Net Sales and every
    // other sales total (PRD §21.3); tipCoverage lets clients distinguish
    // legacy NULL rows from genuine zero-tip sales (AD-10) instead of
    // interpreting missing data as "tips disabled" (PRD §21.4).
    const tipsSummary = computeSalesReportingTipsSummary(invoices);

    const paymentMethodsBreakdown: PaymentMethodsBreakdownDto = {
      cashNio: round2(cashNio),
      cashUsd: round2(cashUsd),
      cardNio: round2(cardNio),
      cardUsd: round2(cardUsd),
      other: round2(otherPaymentsNio),
      totalNio: round2(totalPaymentsNio),
    };

    return {
      // Legacy fields — retained unchanged (spec §7.2/§7.3).
      grossSales: round2(grossSales),
      netTaxableSales: round2(netTaxableSales),
      totalTax: round2(totalTax),
      totalDiscounts: round2(totalDiscounts),
      invoiceCount,
      ticketAverage,

      // V2 additive semantics fields (spec §7.2).
      netSalesNio: salesTotals.netSalesNio,
      preDiscountSalesNio: salesTotals.preDiscountSalesNio,
      completedTicketCount: salesTotals.completedTicketCount,
      averageTicketNetNio: salesTotals.averageTicketNetNio,
      totalTaxNio: salesTotals.totalTaxNio,
      totalDiscountsNio: salesTotals.totalDiscountsNio,

      // S1c-3 (additive): per-origin discount attribution computed by the
      // shared semantics helper over the SAME completed-row set as every
      // total above. The four fields reconcile exactly against
      // totalDiscountsNio; discountOriginUnattributedNio carries the
      // legacy/unknown remainder (never a fabricated zero).
      manualDiscountNio: salesTotals.manualDiscountNio,
      promotionDiscountNio: salesTotals.promotionDiscountNio,
      loyaltyDiscountNio: salesTotals.loyaltyDiscountNio,
      discountOriginUnattributedNio: salesTotals.discountOriginUnattributedNio,

      // Batch 7 (PRD §21): additive tip summary — never folded into any
      // sales total above.
      tipsSummary: {
        totalTipsNio: tipsSummary.totalTipsNio,
        tippedTicketCount: tipsSummary.tippedTicketCount,
        averageTipNio: tipsSummary.averageTipNio,
        tipRate: tipsSummary.tipRate,
        tipCoverage: {
          recordedInvoicesCount: tipsSummary.tipCoverage.recordedInvoicesCount,
          totalInvoicesCount: tipsSummary.tipCoverage.totalInvoicesCount,
        },
      },

      paymentMethodsBreakdown,
      reportingPeriod: {
        timezone: 'America/Managua',
        localStartDate: bounds.localStartDate ?? null,
        localEndDate: bounds.localEndDate ?? null,
      },
      startDate: query?.startDate,
      endDate: query?.endDate,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Daily Sales Trend (Dashboard V2 Batch 5a, PRD §14).
   *
   * §7.2 cross-widget invariant: the invoice set is selected with EXACTLY the
   * same query as getDashboard (same tenant predicate, same completed-sale
   * filter `isCanceled = false`, same inclusive `created_at` bounds), so
   * `Σ days.netSalesNio === getDashboard(tenantId, query).netSalesNio` over
   * any period. Rows are bucketed by their Managua local day
   * (resolveInvoiceLocalDayBucket: localIssueDate, legacy fallback created_at
   * → Managua); buckets outside the range are clamped to the nearest boundary
   * so the parity invariant holds unconditionally.
   *
   * Range window: 2–60 days inclusive (FR-CHART-02). A single day must use
   * the existing hourly route; longer ranges are a later roadmap batch.
   */
  async getDashboardDailySeries(
    tenantId: string,
    query?: DailySeriesQueryDto,
  ): Promise<DailySeriesReportDto> {
    const startDateStr = query?.startDate?.trim();
    const endDateStr = query?.endDate?.trim();
    if (!startDateStr || !endDateStr) {
      throw new BadRequestException(
        'startDate and endDate are both required for the daily series',
      );
    }

    const bounds = this.resolvePeriodBounds(startDateStr, endDateStr);
    // Both inputs were date keys, so both bounds and their local keys exist.
    const start = bounds.startInclusiveUtc;
    const end = bounds.endInclusiveUtc;
    const { localStartDate, localEndDate } = bounds;
    if (!start || !end || !localStartDate || !localEndDate) {
      // Unreachable: both inputs were validated calendar date keys, so
      // resolveReportingBounds always resolves both bounds (see parseDayRange).
      throw new Error(
        `Unresolvable daily-series bounds for '${startDateStr}'..'${endDateStr}'`,
      );
    }

    const dayCount = localDateKeySpanDays(localStartDate, localEndDate);
    if (dayCount < DAILY_SERIES_MIN_DAYS || dayCount > DAILY_SERIES_MAX_DAYS) {
      throw new BadRequestException(
        `Daily series supports a ${DAILY_SERIES_MIN_DAYS}-${DAILY_SERIES_MAX_DAYS} day range; got ${dayCount} day(s).` +
          ' Use the hourly-sales route for a single day.',
      );
    }

    // Issue #581 WU1 / #592: bound invoice read, identical semantics to the
    // dashboard KPI read (same where-clause, different ordering need).
    const invoices = await runInTenantTransaction(
      this.dataSource,
      tenantId,
      (manager) =>
        manager.getRepository(Invoice).find({
          where: {
            tenant_id: tenantId,
            isCanceled: false,
            created_at: Between(start, end),
          },
          order: { created_at: 'ASC' },
        }),
    );

    const days = computeDailySalesSeries(
      localStartDate,
      localEndDate,
      invoices,
    );

    return {
      days,
      reportingPeriod: {
        timezone: 'America/Managua',
        localStartDate,
        localEndDate,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Sales by Hour (PRD §14 FR-HOURLY-01/02/03, Dashboard V2 Batch 5c-backend).
   *
   * Two modes:
   *
   * - Single day (legacy): optional `date`, defaulting to today. Response
   *   shape unchanged except the additive `meta: { dayCount: 1 }` and the
   *   additive per-bucket `netSalesNio`.
   * - Range (FR-HOURLY-01): `startDate`/`endDate` (both required together,
   *   mutually exclusive with `date`), 2–60 days inclusive — the same
   *   ReportingPeriod validation and BadRequest-before-read discipline as
   *   the daily series. Buckets aggregate the WHOLE range per hour-of-day
   *   so clients can show an averaged distribution; `meta.dayCount` carries
   *   the number of aggregated days.
   *
   * FR-HOURLY-03 reconciliation: each bucket gains `netSalesNio`
   * (Σ invoice.subtotal, post-discount, pre-tax, credit notes net in as
   * persisted) over EXACTLY the same invoice set and predicate as the KPI
   * route (tenant + `isCanceled = false` + inclusive created_at bounds), so
   * `Σ buckets.netSalesNio === getDashboard(...).netSalesNio` over the same
   * window. The legacy post-tax `totalSales` fields stay byte-identical
   * (hour-of-day is still the legacy UTC hour of `created_at`).
   */
  async getHourlySales(
    tenantId: string,
    query?: HourlySalesQueryDto,
  ): Promise<HourlySalesReportDto> {
    const requestedDate = query?.date?.trim();
    const requestedStart = query?.startDate?.trim();
    const requestedEnd = query?.endDate?.trim();
    const hasRange = Boolean(
      (requestedStart && requestedStart.length > 0) ||
      (requestedEnd && requestedEnd.length > 0),
    );

    let start: Date;
    let end: Date;
    let dateKey: string;
    let dayCount: number;

    if (hasRange) {
      if (requestedDate) {
        throw new BadRequestException(
          'Provide either a single date or a startDate/endDate range, not both.',
        );
      }
      if (!requestedStart || !requestedEnd) {
        throw new BadRequestException(
          'startDate and endDate are both required for the hourly-sales range',
        );
      }

      const bounds = this.resolvePeriodBounds(requestedStart, requestedEnd);
      const rangeStart = bounds.startInclusiveUtc;
      const rangeEnd = bounds.endInclusiveUtc;
      const { localStartDate, localEndDate } = bounds;
      if (!rangeStart || !rangeEnd || !localStartDate || !localEndDate) {
        // Unreachable: both inputs were validated calendar date keys.
        throw new Error(
          `Unresolvable hourly-sales bounds for '${requestedStart}'..'${requestedEnd}'`,
        );
      }

      dayCount = localDateKeySpanDays(localStartDate, localEndDate);
      if (
        dayCount < DAILY_SERIES_MIN_DAYS ||
        dayCount > DAILY_SERIES_MAX_DAYS
      ) {
        throw new BadRequestException(
          `Hourly sales supports a ${DAILY_SERIES_MIN_DAYS}-${DAILY_SERIES_MAX_DAYS} day range; got ${dayCount} day(s).` +
            ' Use the date parameter for a single day.',
        );
      }

      start = rangeStart;
      end = rangeEnd;
      dateKey = localStartDate;
    } else {
      const parsed = this.parseDayRange(query?.date);
      start = parsed.start;
      end = parsed.end;
      dateKey = parsed.dateStr;
      dayCount = 1;
    }

    // Issue #581 WU1: bound invoice read (see getDashboard). Same predicate
    // and bounds shape as the KPI route over the same window (FR-HOURLY-03
    // parity): tenant + isCanceled = false + inclusive created_at bounds.
    const invoices = await runInTenantTransaction(
      this.dataSource,
      tenantId,
      (manager) =>
        manager.getRepository(Invoice).find({
          where: {
            tenant_id: tenantId,
            isCanceled: false,
            created_at: Between(start, end),
          },
          order: { created_at: 'ASC' },
        }),
    );

    const hourlyBuckets: HourlySalesBucketDto[] = Array.from(
      { length: 24 },
      (_, hour) => ({
        hour,
        invoiceCount: 0,
        totalSales: 0,
        netSalesNio: 0,
      }),
    );

    let totalSales = 0;
    let totalInvoices = 0;

    for (const inv of invoices) {
      const invDate = new Date(inv.created_at);
      const hour = invDate.getUTCHours();
      if (hour >= 0 && hour < 24) {
        const amount = Number(inv.total ?? 0);
        const netAmount = Number(inv.subtotal ?? 0);
        hourlyBuckets[hour].invoiceCount += 1;
        hourlyBuckets[hour].totalSales = round2(
          hourlyBuckets[hour].totalSales + amount,
        );
        hourlyBuckets[hour].netSalesNio = round2(
          hourlyBuckets[hour].netSalesNio + netAmount,
        );
        totalSales = round2(totalSales + amount);
        totalInvoices += 1;
      }
    }

    return {
      date: dateKey,
      totalSales: round2(totalSales),
      totalInvoices,
      meta: { dayCount },
      generatedAt: new Date().toISOString(),
      hourly: hourlyBuckets,
    };
  }

  async getTopProducts(
    tenantId: string,
    query?: TopProductsQueryDto,
  ): Promise<TopProductsReportDto> {
    const { startInclusiveUtc: start, endInclusiveUtc: end } =
      this.resolvePeriodBounds(query?.startDate, query?.endDate);
    const limit = query?.limit != null && query.limit > 0 ? query.limit : 10;

    const whereClause: FindOptionsWhere<Invoice> = {
      tenant_id: tenantId,
      isCanceled: false,
    };

    if (start && end) {
      whereClause.created_at = Between(start, end);
    } else if (start) {
      whereClause.created_at = MoreThanOrEqual(start);
    } else if (end) {
      whereClause.created_at = LessThanOrEqual(end);
    }

    // Issue #581 WU1: bound invoice read (see getDashboard).
    const invoices = await runInTenantTransaction(
      this.dataSource,
      tenantId,
      (manager) =>
        manager.getRepository(Invoice).find({
          where: whereClause,
          relations: ['items'],
        }),
    );

    const productAggregates = new Map<
      string,
      {
        productId: string;
        productName: string;
        totalQuantity: number;
        totalRevenue: number;
        netRevenueNio: number;
      }
    >();

    for (const inv of invoices) {
      if (inv.items && inv.items.length > 0) {
        // FR-PRODUCT-01: per-line Net Sales (post-discount, pre-tax) with
        // any per-invoice rounding residue allocated so that
        // Σ products.netRevenueNio reconciles exactly with the KPI
        // netSalesNio over the same invoice set (see
        // allocateInvoiceLineNetSales for the largest-remainder policy).
        const lineNets = allocateInvoiceLineNetSales(inv);
        inv.items.forEach((item, lineIndex) => {
          const key = item.productId || item.productName || 'unknown';
          const existing = productAggregates.get(key);
          const qty = Number(item.quantity ?? 0);
          const revenue = Number(item.total ?? 0);
          const netRevenue = lineNets[lineIndex] ?? 0;

          if (existing) {
            existing.totalQuantity = round4(existing.totalQuantity + qty);
            existing.totalRevenue = round2(existing.totalRevenue + revenue);
            existing.netRevenueNio = round2(
              existing.netRevenueNio + netRevenue,
            );
          } else {
            productAggregates.set(key, {
              productId: item.productId,
              productName: item.productName || 'Producto sin nombre',
              totalQuantity: round4(qty),
              totalRevenue: round2(revenue),
              netRevenueNio: round2(netRevenue),
            });
          }
        });
      }
    }

    const sortedProducts: TopProductItemDto[] = Array.from(
      productAggregates.values(),
    )
      .sort((a, b) => {
        if (b.totalQuantity !== a.totalQuantity) {
          return b.totalQuantity - a.totalQuantity;
        }
        return b.totalRevenue - a.totalRevenue;
      })
      .slice(0, limit);

    // FR-PRODUCT-01 authoritative share denominator: the period's Net Sales
    // over the SAME bounded invoice set read above, computed with the same
    // shared semantics helper the dashboard KPI uses — never the deprecated
    // tax-inclusive `totalRevenue` (Σ item.total) and never a second read.
    // Because the read filters `isCanceled = false`, every row is a completed
    // sale, so this equals `getDashboard(query).netSalesNio` over the window.
    const periodNetSalesNio = computeSalesReportingTotals(invoices).netSalesNio;

    return {
      startDate: query?.startDate,
      endDate: query?.endDate,
      generatedAt: new Date().toISOString(),
      periodNetSalesNio,
      products: sortedProducts,
    };
  }

  async getCashierPerformance(
    tenantId: string,
    query?: CashierPerformanceQueryDto,
  ): Promise<CashierPerformanceReportDto> {
    const { startInclusiveUtc: start, endInclusiveUtc: end } =
      this.resolvePeriodBounds(query?.startDate, query?.endDate);
    const whereClause: FindOptionsWhere<Invoice> = {
      tenant_id: tenantId,
      isCanceled: false,
    };

    if (start && end) {
      whereClause.created_at = Between(start, end);
    } else if (start) {
      whereClause.created_at = MoreThanOrEqual(start);
    } else if (end) {
      whereClause.created_at = LessThanOrEqual(end);
    }

    // Issue #581 WU1: bound invoice read (see getDashboard) — joins the
    // users read, which was already bound in issue #556 stage 12d F1.
    const invoices = await runInTenantTransaction(
      this.dataSource,
      tenantId,
      (manager) =>
        manager.getRepository(Invoice).find({
          where: whereClause,
        }),
    );

    // Issue #556 stage 12d F1: users is FORCE-RLS-protected — a pooled
    // read here silently returned zero rows and every cashier name
    // degraded to the raw id. Bound read, identical query semantics.
    const users = await runInTenantTransaction(
      this.dataSource,
      tenantId,
      (manager) =>
        manager.getRepository(User).find({
          where: { tenant_id: tenantId },
        }),
    );
    const userMap = new Map<string, string>();
    for (const u of users) {
      userMap.set(u.id, u.name);
    }

    const cashierAggregates = new Map<
      string,
      {
        userId: string;
        cashierName: string;
        invoiceCount: number;
        totalSales: number;
      }
    >();

    for (const inv of invoices) {
      const userId = inv.userId || 'unknown';
      const existing = cashierAggregates.get(userId);
      const total = Number(inv.total ?? 0);

      if (existing) {
        existing.invoiceCount += 1;
        existing.totalSales = round2(existing.totalSales + total);
      } else {
        const cashierName =
          userMap.get(userId) ||
          (userId !== 'unknown' ? userId : 'Desconocido');
        cashierAggregates.set(userId, {
          userId,
          cashierName,
          invoiceCount: 1,
          totalSales: round2(total),
        });
      }
    }

    const cashiers: CashierPerformanceItemDto[] = Array.from(
      cashierAggregates.values(),
    )
      .map((c) => ({
        ...c,
        ticketAverage:
          c.invoiceCount > 0 ? round2(c.totalSales / c.invoiceCount) : 0,
      }))
      .sort((a, b) => b.totalSales - a.totalSales);

    return {
      startDate: query?.startDate,
      endDate: query?.endDate,
      generatedAt: new Date().toISOString(),
      cashiers,
    };
  }

  /**
   * Date parsing is consolidated behind the shared ReportingPeriod resolver
   * (spec §6.1/§6.2). NOTE: InventoryReportsService still parses its own
   * dates and migrates to this resolver in a later roadmap batch (Batch 1
   * keeps the diff small by design).
   *
   * Legacy one-sided/unbounded inputs are preserved: absent or unparseable
   * bounds resolve as unbounded. Inverted or invalid calendar dates are now
   * rejected with 400 instead of silently returning empty/invalid results.
   */
  private resolvePeriodBounds(
    startDateStr?: string,
    endDateStr?: string,
  ): ResolvedReportingBounds {
    try {
      return resolveReportingBounds(startDateStr, endDateStr);
    } catch (error) {
      if (error instanceof ReportingPeriodValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  private parseDayRange(dateStr?: string): {
    dateStr: string;
    start: Date;
    end: Date;
  } {
    const requested = dateStr?.trim();
    let dateKey: string;
    if (!requested) {
      dateKey = currentLocalDateKey();
    } else {
      // Legacy tolerance: embedded timestamps were truncated at the 'T'.
      const candidate = requested.split('T')[0];
      try {
        dateKey = parseLocalDateKey(candidate);
      } catch (error) {
        if (error instanceof ReportingPeriodValidationError) {
          throw new BadRequestException(error.message);
        }
        throw error;
      }
    }

    const bounds = this.resolvePeriodBounds(dateKey, dateKey);
    const start = bounds.startInclusiveUtc;
    const end = bounds.endInclusiveUtc;
    if (!start || !end) {
      // Unreachable: a validated date key always resolves both bounds.
      throw new Error(`Unresolvable day range for '${dateKey}'`);
    }

    return {
      dateStr: dateKey,
      start,
      end,
    };
  }
}
