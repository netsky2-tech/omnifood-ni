/**
 * Shared Sales reporting semantics (Owner Dashboard V2 architecture spec
 * §7.1). Pure functions over historical persisted invoice rows so the KPI,
 * trend, hourly and product reports cannot drift apart.
 *
 * Approved historical semantics (documented per the Batch 1 contract):
 *
 * - Reporting predicates: three deliberately distinct, explicitly named
 *   predicates govern which rows enter which aggregate (WU10, owner-ratified).
 *   Do NOT collapse them into one shared "isRelevantSale" helper: a single
 *   predicate would create a false equivalence between revenue evidence,
 *   customer tickets and cost evidence.
 *
 *   1. isRevenueAffectingDocument — any non-canceled document whose persisted
 *      amounts must flow into Net Sales / tax / discount totals, INCLUDING
 *      credit notes with their persisted (negative) sign, so Net Sales keeps
 *      netting exactly as it always has.
 *   2. isCompletedTicketDocument — a non-canceled document that is a real
 *      customer ticket. Credit notes are refund documents, NOT tickets, and
 *      never count toward completedTicketCount nor contribute to the
 *      average-ticket numerator (issue #624).
 *   3. isCogsCoverageRelevantSale — a non-canceled regular sale whose direct
 *      cost the inventory module must be able to prove. Credit notes are not
 *      cost evidence. Defined here, pure and inventory-independent, so sales
 *      reporting and inventory coverage share one definition.
 *
 *   The asymmetry is intentional contract: a credit note appears in EXACTLY
 *   ONE of the three (revenue only), a canceled document in NONE, a regular
 *   sale in ALL THREE.
 *
 *   NOTE on predicates 2 and 3: today they COINCIDE in extent (both exclude
 *   canceled rows and credit notes) — that is current policy, not redundancy.
 *   They answer different questions and are expected to diverge the moment a
 *   ticket needs no cost evidence: a sale with an explicit
 *   `costingMode = NONE` declaration, for example, is still a real customer
 *   ticket (predicate 2 TRUE) but requires no provable direct cost
 *   (predicate 3 FALSE). Deleting either predicate as "duplicate" would fuse
 *   ticket counting with cost-coverage policy; keep them separate.
 * - Net Sales: SUM(invoice.subtotal) over ALL revenue-affecting rows
 *   (isRevenueAffectingDocument above), INCLUDING credit-note documents.
 *   No current reporting query filters by invoice `type`, so credit notes
 *   net into every total exactly as persisted (negative subtotal rows reduce
 *   the total; positive-subtotal credit-note rows add as persisted). This
 *   keeps Net Sales reconciled with grossSales, hourly and top-product
 *   revenue, which net credit notes in as well.
 * - Pre-discount Sales: Net Sales + Total Discounts (PRD §7.3).
 * - Average Ticket: completedTicketsNetNio / Completed Tickets, or null when
 *   the ticket count is zero (PRD §7.5 — "—", never C$0.00). The numerator is
 *   the Net Sales of EXACTLY the documents counted as completed tickets
 *   (issue #624): numerator and denominator are over the same document set,
 *   so refund netting can never make the average negative. `netSalesNio`
 *   keeps its own refund-netting semantics and is NOT the average-ticket
 *   numerator.
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
  /**
   * Persisted invoice discriminator (`invoices.type`): 'creditNote' for
   * refund documents, 'regular' for sales (the entity default).
   *
   * OPTIONAL for backwards compatibility: rows without this field (existing
   * callers and fixtures written before the field existed) are treated as
   * regular sales. Silently dropping untyped legacy rows from revenue would
   * be a worse regression than the ticket-count defect this field fixes
   * (WU10 owner decision).
   */
  type?: string;
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
  /**
   * Persisted voluntary tip amount in NIO (`invoices.tip_amount_nio`,
   * nullable — Batch 7 Slice 1, PRD §21, AD-10). NULL means "unknown / legacy
   * pre-remediation": historical rows are never backfilled to zero, so a
   * genuine zero-tip sale is 0, never NULL.
   */
  tipAmountNio?: number | string | null;
  /**
   * Persisted sale-time tip-eligible base in NIO
   * (`invoices.tip_eligible_base_nio`, nullable — PRD §21.1: the base is
   * snapshotted at sale time and never recomputed from current rules).
   */
  tipEligibleBaseNio?: number | string | null;
}

export interface SalesReportingTotals {
  netSalesNio: number;
  preDiscountSalesNio: number;
  completedTicketCount: number;
  /**
   * Σ subtotals over exactly the rows counted as completed tickets
   * (isCompletedTicketDocument): the numerator basis of averageTicketNetNio
   * (issue #624). Refund netting stays out of here — it belongs to
   * netSalesNio only.
   */
  completedTicketsNetNio: number;
  averageTicketNetNio: number | null;
  totalTaxNio: number;
  totalDiscountsNio: number;
}

/** PRD §21.1 / spec §18.7 tip-coverage metadata for one reporting period. */
export interface SalesReportingTipCoverage {
  /** Completed invoices with a recorded (non-NULL) V2 tip snapshot. */
  recordedInvoicesCount: number;
  /** All completed invoices in the period (legacy NULL rows included). */
  totalInvoicesCount: number;
  /** recordedInvoicesCount / totalInvoicesCount; null when the period has no completed invoices. */
  coverageRatio: number | null;
}

/** Aggregated voluntary-tip metrics over completed invoice rows (PRD §21.2). */
export interface SalesReportingTipsSummary {
  /** Σ tip amounts over tip-recorded rows; null when no tip was recorded (never a fabricated 0). */
  totalTipsNio: number | null;
  /** Completed invoices with tipAmountNio > 0 (PRD §21.2 tipped tickets). */
  tippedTicketCount: number;
  /** Σ sale-time tip-eligible bases over tip-recorded rows; null when none recorded. */
  tipEligibleBaseNio: number | null;
  /** totalTipsNio / tippedTicketCount; null when no ticket tipped (PRD §21.2: "—"). */
  averageTipNio: number | null;
  /** totalTipsNio / tipEligibleBaseNio × 100; null when the base is 0 (PRD §21.2). */
  tipRate: number | null;
  /** Coverage metadata distinguishing legacy NULL rows from genuine zero-tip sales (AD-10). */
  tipCoverage: SalesReportingTipCoverage;
}

const round2 = (value: number): number =>
  Number((Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2));

/**
 * Shared average-ticket rule (issue #624): the numerator is the net of the
 * documents counted as completed tickets — the same document set as the
 * denominator. Rounded to 2 decimals; null when the ticket count is zero
 * (PRD §7.5: "—", never C$0.00).
 */
function averageTicketFrom(
  ticketsNetNio: number,
  completedTicketCount: number,
): number | null {
  return completedTicketCount > 0
    ? round2(ticketsNetNio / completedTicketCount)
    : null;
}

/** Discriminator value persisted for credit-note (refund) documents. */
const CREDIT_NOTE_TYPE = 'creditNote';

/** True when the row is a persisted credit-note (refund) document. */
function isCreditNoteRow(row: SalesReportingInvoiceRow): boolean {
  return row.type === CREDIT_NOTE_TYPE;
}

/**
 * Revenue predicate (WU10 #1): any non-canceled document whose persisted
 * amounts flow into Net Sales / tax / discount totals. Credit notes ARE
 * revenue-affecting — their persisted negative subtotal must keep netting —
 * but they are NOT tickets or cost evidence. See the module header for the
 * deliberate asymmetry between the three predicates.
 */
export function isRevenueAffectingDocument(
  row: SalesReportingInvoiceRow,
): boolean {
  return !row.isCanceled;
}

/**
 * Ticket predicate (WU10 #2): a non-canceled document that is a real
 * customer ticket. Credit notes are refund documents, not tickets, so they
 * never inflate completedTicketCount or the averageTicketNetNio denominator.
 */
export function isCompletedTicketDocument(
  row: SalesReportingInvoiceRow,
): boolean {
  return !row.isCanceled && !isCreditNoteRow(row);
}

/**
 * Cost-coverage predicate (WU10 #3): a non-canceled regular sale whose
 * direct cost the inventory module must be able to prove. Defined here —
 * pure and inventory-independent — so sales reporting and inventory
 * coverage (consumed by the inventory coverage reporting) share one
 * definition. Credit notes are not cost evidence; canceled documents are
 * not sales.
 *
 * Today this coincides in extent with isCompletedTicketDocument (same
 * exclusions), but they are NOT redundant: this predicate answers "whose
 * cost must we be able to prove?" while the ticket predicate answers "who
 * was served?". They diverge for a ticket that needs no cost evidence
 * (e.g. an explicit costingMode = NONE sale: ticket TRUE, coverage FALSE).
 */
export function isCogsCoverageRelevantSale(
  row: SalesReportingInvoiceRow,
): boolean {
  return !row.isCanceled && !isCreditNoteRow(row);
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

/** Aggregates the §7.2 KPI set over the WU10 reporting predicates. */
export function computeSalesReportingTotals(
  rows: readonly SalesReportingInvoiceRow[],
): SalesReportingTotals {
  let netSalesNio = 0;
  let totalTaxNio = 0;
  let totalDiscountsNio = 0;
  let completedTicketCount = 0;
  let completedTicketsNetNio = 0;

  for (const row of rows) {
    if (!isRevenueAffectingDocument(row)) {
      continue;
    }
    netSalesNio = round2(netSalesNio + salesRowNetSales(row));
    totalTaxNio = round2(totalTaxNio + Number(row.totalTax ?? 0));
    totalDiscountsNio = round2(totalDiscountsNio + salesRowDiscounts(row));
    // Deliberate split: the amount nets (revenue predicate) but the credit
    // note never counts as a ticket (ticket predicate) — and since issue
    // #624 it stays out of the average-ticket numerator as well, so that
    // numerator and denominator cover the same document set.
    if (isCompletedTicketDocument(row)) {
      completedTicketCount += 1;
      completedTicketsNetNio = round2(
        completedTicketsNetNio + salesRowNetSales(row),
      );
    }
  }

  const preDiscountSalesNio = round2(netSalesNio + totalDiscountsNio);
  const averageTicketNetNio = averageTicketFrom(
    completedTicketsNetNio,
    completedTicketCount,
  );

  return {
    netSalesNio,
    preDiscountSalesNio,
    completedTicketCount,
    completedTicketsNetNio,
    averageTicketNetNio,
    totalTaxNio,
    totalDiscountsNio,
  };
}

/**
 * A completed row with a recorded (non-NULL) V2 tip snapshot. Legacy rows
 * stay out of every tip total: NULL is "unknown", never zero (AD-10).
 */
function isTipRecordedRow(row: SalesReportingInvoiceRow): boolean {
  return row.tipAmountNio !== null && row.tipAmountNio !== undefined;
}

/**
 * Aggregates the §21.2 tip KPI set over completed (non-void) invoice rows
 * (Dashboard V2 Batch 7 Slice 3).
 *
 * Semantics:
 * - Only completed ticket rows (isCompletedTicketDocument) contribute;
 *   canceled documents and credit notes are never reported.
 * - A row participates in tip totals when its tip snapshot is recorded
 *   (tipAmountNio non-NULL). Legacy NULL rows are excluded from the sums but
 *   remain in tipCoverage.totalInvoicesCount, so PARTIAL coverage is visible
 *   instead of legacy data silently reading as "no tips" (PRD §21.1,
 *   spec §18.7, AD-10).
 * - tipEligibleBaseNio sums the sale-time eligible base of tip-recorded rows
 *   — including rows where the customer declined (tip 0, base recorded) —
 *   because §21.2 fixes the denominator to the base the POS TipEngine used
 *   when the sale closed, not to the tickets that accepted.
 * - PRD §21.3: tips NEVER enter Net Sales; computeSalesReportingTotals does
 *   not read tip fields at all.
 */
export function computeSalesReportingTipsSummary(
  rows: readonly SalesReportingInvoiceRow[],
): SalesReportingTipsSummary {
  let totalTipsNio = 0;
  let tipEligibleBaseNio = 0;
  let recordedInvoicesCount = 0;
  let tippedTicketCount = 0;
  let totalInvoicesCount = 0;

  for (const row of rows) {
    if (!isCompletedTicketDocument(row)) {
      continue;
    }
    totalInvoicesCount += 1;
    if (!isTipRecordedRow(row)) {
      continue;
    }
    const tip = Number(row.tipAmountNio ?? 0);
    totalTipsNio = round2(totalTipsNio + tip);
    tipEligibleBaseNio = round2(
      tipEligibleBaseNio + Number(row.tipEligibleBaseNio ?? 0),
    );
    recordedInvoicesCount += 1;
    if (tip > 0) {
      tippedTicketCount += 1;
    }
  }

  const hasRecordedTips = recordedInvoicesCount > 0;
  return {
    totalTipsNio: hasRecordedTips ? totalTipsNio : null,
    tippedTicketCount,
    tipEligibleBaseNio: hasRecordedTips ? tipEligibleBaseNio : null,
    averageTipNio:
      hasRecordedTips && tippedTicketCount > 0
        ? round2(totalTipsNio / tippedTicketCount)
        : null,
    tipRate:
      hasRecordedTips && tipEligibleBaseNio > 0
        ? round2((totalTipsNio / tipEligibleBaseNio) * 100)
        : null,
    tipCoverage: {
      recordedInvoicesCount,
      totalInvoicesCount,
      coverageRatio:
        totalInvoicesCount > 0
          ? Math.round((recordedInvoicesCount / totalInvoicesCount) * 100) /
            100
          : null,
    },
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
  /** Ticket-scoped net / completedTicketCount of the day; null on a zero-ticket day (PRD §7.5, issue #624). */
  averageTicketNetNio: number | null;
}

/**
 * Daily Sales Trend buckets (PRD §14) under the §7.2 cross-widget invariant:
 * the same reporting predicates and the same per-row Net Sales expression as
 * `computeSalesReportingTotals`, never grossSales — amounts use the revenue
 * predicate, ticket counts the ticket predicate, and since issue #624 the
 * per-day average-ticket numerator is the per-day ticket-scoped net, the
 * same basis as the KPI tile.
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
  const ticketsNetByDay = new Map<string, number>();
  const countByDay = new Map<string, number>();

  for (const row of rows) {
    if (!isRevenueAffectingDocument(row)) {
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
    if (isCompletedTicketDocument(row)) {
      countByDay.set(bucket, (countByDay.get(bucket) ?? 0) + 1);
      // Ticket-scoped net for the day's average ticket (issue #624): the
      // same numerator basis as computeSalesReportingTotals.
      ticketsNetByDay.set(
        bucket,
        round2((ticketsNetByDay.get(bucket) ?? 0) + salesRowNetSales(row)),
      );
    }
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
      averageTicketNetNio: averageTicketFrom(
        ticketsNetByDay.get(cursor) ?? 0,
        completedTicketCount,
      ),
    });
    cursor = addLocalDays(cursor, 1);
  }
  return days;
}
