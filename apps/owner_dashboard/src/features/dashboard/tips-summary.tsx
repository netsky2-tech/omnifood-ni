/**
 * Voluntary-tip summary card (Dashboard V2 Batch 7, PRD §21).
 *
 * Authority:
 * - PRD §21.2 KPI set: Total Tips, Tipped Ticket Participation, Average Tip,
 *   Tip Rate (denominators fixed at sale time — never recomputed).
 * - PRD §21.3: tips are never merged into any sales figure; this card is the
 *   tips-only surface in the "Flujos separados de ventas" band
 *   (ui_wireframe_reference.md §1 row 5).
 * - PRD §21.4 (inapplicable profile): when the tip data path has no coverage
 *   in the period (legacy NULL rows / empty period / summary unavailable),
 *   the card is omitted entirely — zero placeholders are never rendered.
 *
 * The applicability gate is data-driven (isTipsSummaryApplicable); the
 * backend tipCoverage metadata decides, so a genuine all-declined period
 * (full coverage, zero tips) still renders with real zeros while legacy
 * NULL-only periods render nothing.
 */
import { isTipsSummaryApplicable, tipParticipationPercent } from "./kpi-deltas";
import type { TipsSummaryWire } from "./dashboard-api";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency: "NIO",
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

export interface TipsSummaryCardProps {
  /** Current-period tips summary from the V2 dashboard report. */
  summary: TipsSummaryWire | null;
}

export function TipsSummaryCard({ summary }: TipsSummaryCardProps) {
  // PRD §21.4: no zero-value placeholders for inapplicable/no-coverage data.
  if (!isTipsSummaryApplicable(summary)) {
    return null;
  }

  const participation = tipParticipationPercent(
    summary.tippedTicketCount,
    summary.tipCoverage.totalInvoicesCount,
  );

  return (
    <div
      data-testid="tips-summary-card"
      className="rounded-lg border border-border bg-card p-6 shadow-sm"
    >
      <h2 className="mb-4 text-lg font-semibold text-card-foreground">Propinas</h2>
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Total Propinas</span>
          <span className="font-medium tabular-nums text-card-foreground">
            {summary.totalTipsNio === null ? "—" : formatCurrency(summary.totalTipsNio)}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Tasa de Propina</span>
          <span className="font-medium tabular-nums text-card-foreground">
            {formatPercent(summary.tipRate)}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Ticket promedio de propina</span>
          <span className="font-medium tabular-nums text-card-foreground">
            {summary.averageTipNio === null ? "—" : formatCurrency(summary.averageTipNio)}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Participación</span>
          <span className="font-medium tabular-nums text-card-foreground">
            {formatPercent(participation)}
          </span>
        </div>
      </div>
    </div>
  );
}
