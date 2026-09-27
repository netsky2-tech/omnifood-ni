/**
 * "Flujos separados de ventas" card — Dashboard V2 management band.
 *
 * Review round 2 (WU5, owner decision): the former tips-only card became the
 * flows card the wireframe §1 bottom row already drew (change #5 in §3).
 * Descuentos moved here from the retired "Resumen de Ventas" card and is
 * ALWAYS visible; the tips block renders only when the tip data path has
 * coverage.
 *
 * Authorities:
 * - PRD §13 FR-DISC-02: the discount rate's denominator is the approved
 *   Pre-discount Sales (preDiscountSalesNio), NOT net sales — discounts come
 *   off the pre-discount base, so the rate must be read against it. With no
 *   usable base the rate degrades to an em-dash, never a fabricated percent.
 * - PRD §21.2 KPI set: Total Tips, Tipped Ticket Participation, Average Tip,
 *   Tip Rate (denominators fixed at sale time — never recomputed).
 * - PRD §21.3: tips are never merged into any sales figure — the card states
 *   it, not just implies it.
 * - PRD §21.4 (inapplicable profile): when the tip data path has no coverage
 *   in the period, only the TIPS block is omitted (zero placeholders are
 *   never rendered); the Descuentos row keeps the card alive.
 *
 * The export name and `tips-summary-card` test id are conserved on purpose:
 * dashboard-v2-tips.spec.tsx and dashboard-v2-acceptance.spec.tsx (another
 * writer's surfaces) pin them.
 *
 * NOTE (reported to the parent): snapshot.deltas has no discounts delta in
 * the shipped contract, so the wireframe's `↑0.4pp` comparison is NOT
 * rendered — a delta would be invented data. It appears when the delta
 * contract ships.
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
  /** FR-DISC-02 denominator: the period's approved pre-discount sales. */
  preDiscountSalesNio?: number | null;
  /** Period discounts (V2 explicit semantics, post-credit-note net). */
  totalDiscountsNio?: number | null;
}

export function TipsSummaryCard({
  summary,
  preDiscountSalesNio = null,
  totalDiscountsNio = null,
}: TipsSummaryCardProps) {
  const discounts =
    totalDiscountsNio !== null && Number.isFinite(totalDiscountsNio)
      ? formatCurrency(totalDiscountsNio)
      : "—";
  const discountRate =
    totalDiscountsNio !== null &&
    Number.isFinite(totalDiscountsNio) &&
    preDiscountSalesNio !== null &&
    Number.isFinite(preDiscountSalesNio) &&
    preDiscountSalesNio > 0
      ? `${((totalDiscountsNio / preDiscountSalesNio) * 100).toFixed(1)}% base`
      : "—";

  // PRD §21.4: no zero-value placeholders for inapplicable/no-coverage tips.
  const tips = isTipsSummaryApplicable(summary) ? summary : null;
  const participation = tips
    ? tipParticipationPercent(tips.tippedTicketCount, tips.tipCoverage.totalInvoicesCount)
    : null;

  return (
    <div
      data-testid="tips-summary-card"
      className="flex flex-col rounded-lg border border-border bg-card p-6 shadow-sm"
    >
      <h2 className="mb-4 text-lg font-semibold text-card-foreground">
        Flujos separados de ventas
      </h2>
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Descuentos</span>
          <span className="font-medium tabular-nums text-card-foreground">
            {discounts}
            <span className="text-muted-foreground">
              {" · "}
              {discountRate}
            </span>
          </span>
        </div>
        {tips && (
          <div className="space-y-3 border-t border-border pt-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total Propinas</span>
              <span className="font-medium tabular-nums text-card-foreground">
                {tips.totalTipsNio === null ? "—" : formatCurrency(tips.totalTipsNio)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Tasa de Propina</span>
              <span className="font-medium tabular-nums text-card-foreground">
                {formatPercent(tips.tipRate)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Ticket promedio de propina</span>
              <span className="font-medium tabular-nums text-card-foreground">
                {tips.averageTipNio === null ? "—" : formatCurrency(tips.averageTipNio)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Participación</span>
              <span className="font-medium tabular-nums text-card-foreground">
                {formatPercent(participation)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              * No incluidas en ventas (PRD §21.3: flujos separados).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
