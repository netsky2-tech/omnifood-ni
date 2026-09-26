/**
 * Shared Sales reporting semantics (Owner Dashboard V2 architecture spec
 * §7.1). Pure functions over historical persisted invoice rows so the KPI,
 * trend, hourly and product reports cannot drift apart.
 *
 * Approved historical semantics (documented per the Batch 1 contract):
 *
 * - Completed sale: an invoice that is NOT canceled/void. This mirrors exactly
 *   what the current reporting queries filter on (`isCanceled = false`). The
 *   current schema has no separate "finalized" column; `paymentStatus` is a
 *   payment state, not a finalization signal, and is NOT part of the
 *   predicate.
 * - Net Sales: SUM(invoice.subtotal) over ALL rows matching the predicate,
 *   INCLUDING credit-note documents. No current reporting query filters by
 *   invoice `type`, so credit notes net into every total exactly as persisted
 *   (negative subtotal rows reduce the total; positive-subtotal credit-note
 *   rows add as persisted). This keeps Net Sales reconciled with grossSales,
 *   hourly and top-product revenue, which net credit notes in as well.
 * - Pre-discount Sales: Net Sales + Total Discounts (PRD §7.3).
 * - Average Ticket: Net Sales / Completed Tickets, or null when the ticket
 *   count is zero (PRD §7.5 — "—", never C$0.00).
 *
 * All values come from historical persisted invoice data — never from current
 * catalog or tax rules (spec §7.1).
 */

import {
  addLocalDays,
  formatLocalDateKey,
  isValidLocalDateKey,
  parseLocalDateKey,
} from './reporting-period';

/** Structural view of a persisted invoice row (avoids coupling core to modules). */
export interface SalesReportingInvoiceRow {
  isCanceled: boolean;
  subtotal: number | string | null;
  totalTax?: number | string | null;
  items?: ReadonlyArray<{
    discount?: number | string | null;
    /** Tax-inclusive persisted line total (`invoice_items.total`). */
    total?: number | string | null;
    /** Persisted per-line tax (`invoice_items.tax_amount`). */
    taxAmount?: number | string | null;
  }> | null;
  /**
   * On-device local calendar date (YYYY-MM-DD) fixed at issuance, when the
   * row carries one (`invoices.local_issue_date`, nullable — D-9 no backfill).
   * Used only by daily bucketing (Batch 5a).
   */
  localIssueDate?: string | null;
  /**
   * Row creation instant (`invoices.created_at`, non-nullable): the fallback
   * bucket source for legacy rows without `localIssueDate`.
   */
  created_at?: Date | string | null;
}

export interface SalesReportingTotals {
  netSalesNio: number;
  preDiscountSalesNio: number;
  completedTicketCount: number;
  averageTicketNetNio: number | null;
  totalTaxNio: number;
  totalDiscountsNio: number;
}

const round2 = (value: number): number =>
  Number((Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2));

/**
 * Completed-sale predicate: finalized sale document that is not void/canceled.
 * Mirrors the current reporting queries (`isCanceled = false`) exactly.
 */
export function isCompletedSaleRow(row: SalesReportingInvoiceRow): boolean {
  return !row.isCanceled;
}

/** Historical persisted Net Sales contribution of one invoice row. */
export function salesRowNetSales(row: SalesReportingInvoiceRow): number {
  return round2(Number(row.subtotal ?? 0));
}

/** Historical persisted line-item discount total of one invoice row. */
export function salesRowDiscounts(row: SalesReportingInvoiceRow): number {
  let total = 0;
  if (row.items && row.items.length > 0) {
    for (const item of row.items) {
      total = round2(total + Number(item.discount ?? 0));
    }
  }
  return total;
}

/**
 * Per-line Net Sales decomposition of one invoice row (FR-PRODUCT-01,
 * Dashboard V2 Batch 5c-backend):
 *
 * A persisted invoice line carries `total` (tax-INCLUSIVE) and `taxAmount`,
 * and the invoices service derives the persisted invoice `subtotal` exactly
 * as `Σ line.total − Σ line.taxAmount` (see the credit-note path in
 * invoices.service.ts), so the post-discount, pre-tax contribution of one
 * line is `total − taxAmount`.
 *
 * Both the line cents and the invoice subtotal are persisted at scale 2
 * from scale-4 arithmetic, so the raw line nets can disagree with the
 * persisted subtotal by a small rounding residue. To keep the decomposition
 * identity `Σ line nets === salesRowNetSales(row)` EXACT (and therefore the
 * Top-Products Net Sales reconciled with the KPI Net Sales), the residue is
 * allocated deterministically by LARGEST REMAINDER: each line's share of the
 * residue is proportional to its absolute raw net, truncated toward zero,
 * and the leftover cent units go to the lines with the largest fractional
 * remainders (ties broken by descending absolute raw net, then line order).
 * When every raw net is zero, the whole residue goes to the first line.
 *
 * Returns one adjusted 2-decimal net per line, in line order; a row without
 * items decomposes to an empty array (nothing to allocate).
 */
export function allocateInvoiceLineNetSales(row: {
  subtotal?: number | string | null;
  items?: SalesReportingInvoiceRow['items'];
}): number[] {
  const items = row.items ?? [];
  const rawCents = items.map((item) =>
    Math.round((Number(item.total ?? 0) - Number(item.taxAmount ?? 0)) * 100),
  );
  const targetCents = Math.round(Number(row.subtotal ?? 0) * 100);
  const rawSumCents = rawCents.reduce((sum, cents) => sum + cents, 0);
  const residualCents = targetCents - rawSumCents;

  if (residualCents === 0) {
    return rawCents.map((cents) => cents / 100);
  }

  const allocation = new Array<number>(rawCents.length).fill(0);
  const weights = rawCents.map((cents) => Math.abs(cents));
  const weightSum = weights.reduce((sum, w) => sum + w, 0);

  if (weightSum === 0) {
    // All-zero lines: deterministic single-recipient policy (first line).
    if (rawCents.length > 0) {
      allocation[0] = residualCents;
    }
  } else {
    const floatShares = weights.map((w) => (residualCents * w) / weightSum);
    const remainders = floatShares.map((share, index) => ({
      index,
      fraction: Math.abs(share - Math.trunc(share)),
      weight: weights[index],
    }));
    remainders.sort(
      (a, b) =>
        b.fraction - a.fraction || b.weight - a.weight || a.index - b.index,
    );

    let distributed = 0;
    floatShares.forEach((share, index) => {
      const base = Math.trunc(share);
      allocation[index] = base;
      distributed += base;
    });

    // Distribute the leftover cent units one at a time, largest remainder
    // first, wrapping around until the residue is fully absorbed.
    const sign = residualCents > 0 ? 1 : -1;
    let unitsLeft = Math.abs(residualCents - distributed);
    let cursor = 0;
    while (unitsLeft > 0) {
      allocation[remainders[cursor % remainders.length].index] += sign;
      unitsLeft -= 1;
      cursor += 1;
    }
  }

  return rawCents.map((cents, index) => (cents + allocation[index]) / 100);
}

/** Aggregates the §7.2 KPI set over completed (non-void) invoice rows. */
export function computeSalesReportingTotals(
  rows: readonly SalesReportingInvoiceRow[],
): SalesReportingTotals {
  let netSalesNio = 0;
  let totalTaxNio = 0;
  let totalDiscountsNio = 0;
  let completedTicketCount = 0;

  for (const row of rows) {
    if (!isCompletedSaleRow(row)) {
      continue;
    }
    netSalesNio = round2(netSalesNio + salesRowNetSales(row));
    totalTaxNio = round2(totalTaxNio + Number(row.totalTax ?? 0));
    totalDiscountsNio = round2(totalDiscountsNio + salesRowDiscounts(row));
    completedTicketCount += 1;
  }

  const preDiscountSalesNio = round2(netSalesNio + totalDiscountsNio);
  const averageTicketNetNio =
    completedTicketCount > 0
      ? round2(netSalesNio / completedTicketCount)
      : null;

  return {
    netSalesNio,
    preDiscountSalesNio,
    completedTicketCount,
    averageTicketNetNio,
    totalTaxNio,
    totalDiscountsNio,
  };
}

/**
 * Managua local calendar day (YYYY-MM-DD) an invoice row belongs to for daily
 * trend bucketing (Dashboard V2 Batch 5a):
 *
 * - `localIssueDate` when present and a valid calendar date: the on-device
 *   issue day fixed at issuance (authoritative even when sync happened later);
 * - otherwise the legacy fallback: the `created_at` instant rendered in
 *   America/Managua (`formatLocalDateKey`). Legacy rows have no
 *   `local_issue_date` (migration 1809400000000 is additive, D-9 no backfill),
 *   so this keeps pre-migration invoices on the chart.
 *
 * Returns null only when neither source is usable (unreachable in production:
 * `created_at` is non-nullable).
 */
export function resolveInvoiceLocalDayBucket(
  row: SalesReportingInvoiceRow,
): string | null {
  if (row.localIssueDate && isValidLocalDateKey(row.localIssueDate)) {
    return row.localIssueDate;
  }
  if (row.created_at != null) {
    const instant = new Date(row.created_at);
    if (!Number.isNaN(instant.getTime())) {
      return formatLocalDateKey(instant);
    }
  }
  return null;
}

export interface DailySalesSeriesPoint {
  /** Managua local calendar day (YYYY-MM-DD). */
  date: string;
  netSalesNio: number;
  completedTicketCount: number;
  /** netSalesNio / completedTicketCount; null on a zero-ticket day (PRD §7.5). */
  averageTicketNetNio: number | null;
}

/**
 * Daily Sales Trend buckets (PRD §14) under the §7.2 cross-widget invariant:
 * the same completed-sale predicate and the same per-row Net Sales expression
 * as `computeSalesReportingTotals`, never grossSales.
 *
 * Every calendar day of [localStartDate, localEndDate] is emitted in order;
 * zero-sales days carry netSalesNio 0, count 0 and a null average so the
 * chart keeps a continuous x-axis.
 *
 * A row whose resolved bucket falls outside the requested range (possible
 * only when its on-device `localIssueDate` disagrees with the `created_at`
 * day the query range filter used) is clamped to the nearest range boundary
 * instead of being dropped, so the parity invariant
 * `Σ days.netSalesNio === computeSalesReportingTotals(rows).netSalesNio`
 * holds unconditionally over the queried row set.
 */
export function computeDailySalesSeries(
  localStartDate: string,
  localEndDate: string,
  rows: readonly SalesReportingInvoiceRow[],
): DailySalesSeriesPoint[] {
  const start = parseLocalDateKey(localStartDate);
  const end = parseLocalDateKey(localEndDate);

  const netByDay = new Map<string, number>();
  const countByDay = new Map<string, number>();

  for (const row of rows) {
    if (!isCompletedSaleRow(row)) {
      continue;
    }
    const rawBucket = resolveInvoiceLocalDayBucket(row);
    if (rawBucket == null) {
      continue;
    }
    const bucket =
      rawBucket < start ? start : rawBucket > end ? end : rawBucket;
    netByDay.set(
      bucket,
      round2((netByDay.get(bucket) ?? 0) + salesRowNetSales(row)),
    );
    countByDay.set(bucket, (countByDay.get(bucket) ?? 0) + 1);
  }

  const days: DailySalesSeriesPoint[] = [];
  let cursor = start;
  while (cursor <= end) {
    const netSalesNio = netByDay.get(cursor) ?? 0;
    const completedTicketCount = countByDay.get(cursor) ?? 0;
    days.push({
      date: cursor,
      netSalesNio,
      completedTicketCount,
      averageTicketNetNio:
        completedTicketCount > 0
          ? round2(netSalesNio / completedTicketCount)
          : null,
    });
    cursor = addLocalDays(cursor, 1);
  }
  return days;
}
