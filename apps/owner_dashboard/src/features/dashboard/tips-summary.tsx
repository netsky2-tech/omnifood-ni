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
import type { DashboardV2Report, TipsSummaryWire } from "./dashboard-api";

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

/**
 * The four wire-optional per-origin discount fields (P3). All fields are
 * optional: absent means the backend did not report the breakdown, and the
 * UI must render NOTHING for it — never a fabricated C$0.00.
 */
export type DiscountOriginBreakdown = Pick<
  DashboardV2Report,
  | "manualDiscountNio"
  | "promotionDiscountNio"
  | "loyaltyDiscountNio"
  | "discountOriginUnattributedNio"
>;

export interface TipsSummaryCardProps {
  /** Current-period tips summary from the V2 dashboard report. */
  summary: TipsSummaryWire | null;
  /** FR-DISC-02 denominator: the period's approved pre-discount sales. */
  preDiscountSalesNio?: number | null;
  /** Period discounts (V2 explicit semantics, post-credit-note net). */
  totalDiscountsNio?: number | null;
  /**
   * Per-origin discount breakdown (P3); only present when the backend
   * reported it. Rendered beneath the Descuentos total, which is unchanged.
   */
  discountOriginBreakdown?: DiscountOriginBreakdown | null;
}

export function TipsSummaryCard({
  summary,
  preDiscountSalesNio = null,
  totalDiscountsNio = null,
  discountOriginBreakdown = null,
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

  // P3: the breakdown renders ONLY when the API reports it — when the fields
  // are absent (older backend) we render nothing extra, because a fabricated
  // "C$0.00" per origin would state a fiscal fact the wire never sent.
  const breakdown =
    discountOriginBreakdown !== null && discountOriginBreakdown !== undefined
      ? discountOriginBreakdown
      : null;
  const reportedOrigins: Array<[string, number]> = breakdown
    ? (
        [
          ["Descuento manual", breakdown.manualDiscountNio],
          ["Descuento por promoción", breakdown.promotionDiscountNio],
          ["Descuento por lealtad", breakdown.loyaltyDiscountNio],
        ] as Array<[string, number | undefined]>
      ).filter((entry): entry is [string, number] => entry[1] !== undefined)
    : [];
  const unattributedNio = breakdown?.discountOriginUnattributedNio;
  // Shown only when NOT zero: a genuine 0 needs no row, but a negative value
  // is a stored-data inconsistency the owner must still see (never hidden).
  const showUnattributed = unattributedNio !== undefined && unattributedNio !== 0;
  const showOriginBreakdown = reportedOrigins.length > 0 || showUnattributed;

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
        {showOriginBreakdown && (
          // Sub-rows of Descuentos: same row anatomy/typography as the
          // neighbouring rows (standard §42.5/§42.6 — tighter grouping inside
          // one idea, tabular figures), indented one level, no new pattern.
          <div className="space-y-3 pl-4">
            {reportedOrigins.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium tabular-nums text-card-foreground">
                  {formatCurrency(value)}
                </span>
              </div>
            ))}
            {showUnattributed && unattributedNio !== undefined && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Sin origen registrado</span>
                <span className="font-medium tabular-nums text-card-foreground">
                  {formatCurrency(unattributedNio)}
                </span>
              </div>
            )}
          </div>
        )}
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
