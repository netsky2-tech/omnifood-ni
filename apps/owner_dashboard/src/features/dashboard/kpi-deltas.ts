/**
 * Pure KPI delta/margin math for the Dashboard V2 executive strip.
 *
 * Authority: docs/dashboard/owner_dashboard_v2_prd_v1.0.md §9.5 and §10.2
 * (FR-KPI-01..04); docs/dashboard/owner_dashboard_v2_architecture_spec_v0.3.md
 * §AD-06 (gross margin composed client-side from netSalesNio + salesCogsNio).
 *
 * Zero-previous rule (PRD §9.5): the delta is null — the renderer shows an
 * em-dash and "Sin base comparable"; a fake +100% is never produced here.
 *
 * This module is pure data: no labels, no fetching, no React.
 */
import type { DashboardV2Report, TipsSummaryWire } from "./dashboard-api";

/** Percent change vs the previous period; null when there is no comparable base. */
export function percentDelta(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) {
    return null;
  }
  return ((current - previous) / previous) * 100;
}

export interface GrossMargin {
  amount: number;
  percent: number;
}

/** Gross margin from explicit net sales and COGS; null when not computable. */
export function grossMargin(netSales: number, cogs: number): GrossMargin | null {
  if (!Number.isFinite(netSales) || !Number.isFinite(cogs) || netSales <= 0) {
    return null;
  }
  const amount = netSales - cogs;
  return { amount, percent: (amount / netSales) * 100 };
}

/** Margin percentage-point delta; callers must pass computable margins. */
export function marginPercentDelta(current: GrossMargin, previous: GrossMargin): number {
  return current.percent - previous.percent;
}

/**
 * PRD §21.2 Tipped Ticket Participation: tickets with tip > 0 / eligible
 * completed tickets × 100. Null when there is no completed-ticket base —
 * never a fabricated 0%.
 */
export function tipParticipationPercent(
  tippedTicketCount: number,
  totalInvoicesCount: number,
): number | null {
  if (!Number.isFinite(tippedTicketCount) || !Number.isFinite(totalInvoicesCount) || totalInvoicesCount <= 0) {
    return null;
  }
  return (tippedTicketCount / totalInvoicesCount) * 100;
}

/**
 * PRD §21.4 applicability gate (data-driven): the tips widget renders only
 * when the tip data path has coverage in the period. A summary with zero
 * recorded tips is NOT evidence of genuine zero-tip sales — it means the
 * period's rows are legacy NULL (or empty), and zero placeholders are never
 * rendered for it. Profile-level (QSR/Retail) suppression stays a page-level
 * concern; this predicate only encodes what the wire can prove.
 */
export function isTipsSummaryApplicable(
  summary: TipsSummaryWire | null,
): summary is TipsSummaryWire {
  return summary !== null && summary.tipCoverage.recordedInvoicesCount > 0;
}

/** Executive strip snapshot for one period. */
export interface KpiSnapshot {
  netSalesNio: number;
  completedTicketCount: number;
  averageTicketNetNio: number | null;
  totalTaxNio: number;
  totalDiscountsNio: number;
  margin: GrossMargin | null;
  /** Batch 7: current-period tips summary; null when unavailable/inapplicable (PRD §21.4). */
  tipsSummary: TipsSummaryWire | null;
  deltas: {
    netSales: number | null;
    tickets: number | null;
    averageTicket: number | null;
    /** Only when the margin is computable for both periods (PRD §10.2). */
    marginPp: number | null;
    totalTax: number | null;
  };
}

function marginPpDelta(
  current: KpiSnapshotInput | null,
  previous: KpiSnapshotInput | null,
  margin: GrossMargin | null,
): number | null {
  if (!current || !previous || !margin) return null;
  const prevMargin = grossMargin(previous.netSalesNio, previous.salesCogsNio ?? Number.NaN);
  if (!prevMargin) return null;
  return marginPercentDelta(margin, prevMargin);
}

/** Internal shape used to build the snapshot. */
interface KpiSnapshotInput {
  netSalesNio: number;
  completedTicketCount: number;
  averageTicketNetNio: number | null;
  totalTaxNio: number;
  salesCogsNio: number | null;
}

/**
 * Builds the strip snapshot from the current/previous dashboard reports and
 * the current/previous sales COGS values (null when the COGS report is
 * unavailable). Returns null when the current report is missing.
 */
export function buildKpiSnapshot(
  current: DashboardV2Report | null,
  previous: DashboardV2Report | null,
  salesCogsCurrentNio: number | null,
  salesCogsPreviousNio: number | null,
): KpiSnapshot | null {
  if (!current) return null;

  const cur: KpiSnapshotInput = {
    netSalesNio: current.netSalesNio,
    completedTicketCount: current.completedTicketCount,
    averageTicketNetNio: current.averageTicketNetNio,
    totalTaxNio: current.totalTaxNio,
    salesCogsNio: salesCogsCurrentNio,
  };
  const prev: KpiSnapshotInput | null = previous
    ? {
        netSalesNio: previous.netSalesNio,
        completedTicketCount: previous.completedTicketCount,
        averageTicketNetNio: previous.averageTicketNetNio,
        totalTaxNio: previous.totalTaxNio,
        salesCogsNio: salesCogsPreviousNio,
      }
    : null;

  const margin =
    cur.salesCogsNio !== null ? grossMargin(cur.netSalesNio, cur.salesCogsNio) : null;

  return {
    netSalesNio: cur.netSalesNio,
    completedTicketCount: cur.completedTicketCount,
    averageTicketNetNio: cur.averageTicketNetNio,
    totalTaxNio: cur.totalTaxNio,
    totalDiscountsNio: current.totalDiscountsNio,
    margin,
    tipsSummary: current.tipsSummary,
    deltas: {
      netSales: prev ? percentDelta(cur.netSalesNio, prev.netSalesNio) : null,
      tickets: prev ? percentDelta(cur.completedTicketCount, prev.completedTicketCount) : null,
      averageTicket:
        prev && cur.averageTicketNetNio !== null && prev.averageTicketNetNio !== null
          ? percentDelta(cur.averageTicketNetNio, prev.averageTicketNetNio)
          : null,
      marginPp: marginPpDelta(cur, prev, margin),
      totalTax: prev ? percentDelta(cur.totalTaxNio, prev.totalTaxNio) : null,
    },
  };
}
