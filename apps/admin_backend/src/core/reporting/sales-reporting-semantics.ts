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

/** Structural view of a persisted invoice row (avoids coupling core to modules). */
export interface SalesReportingInvoiceRow {
  isCanceled: boolean;
  subtotal: number | string | null;
  totalTax?: number | string | null;
  items?: ReadonlyArray<{ discount?: number | string | null }> | null;
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
