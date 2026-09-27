/**
 * RentabilidadCard — Dashboard V2 management band (review round 2, WU5).
 *
 * Replaces the legacy static "Resumen de Ventas" text card in the bottom
 * band, exactly as ui_wireframe_reference.md §1 (rows 40–45) already drew it:
 * a gross-margin breakdown, not an operating-profit claim. There are no
 * declared operating expenses anywhere in the reporting contracts, so no
 * "utilidad operativa" / opex wording exists in this card — only real
 * components (net sales, COGS, gross margin, shrinkage).
 *
 * Evidence discipline (PRD §7.2 cross-widget invariant, review round 2 P0 #4):
 * - Amounts render only when the MarginGate says the COGS evidence is
 *   authoritative (COMPLETE or PARTIAL coverage). UNAVAILABLE/unknown/absent
 *   render an em-dash — never a fabricated C$0.00.
 * - The percent renders only on COMPLETE coverage (gate.ratio).
 * - Mermas carry the same evidence bar and the wireframe caption
 *   "no reduce el margen mostrado" (FR-PROFIT-03).
 *
 * AG-06 / AC-17: the caller omits this card entirely without the cost grant
 * (no placeholder, no cost numerics); the COGS fetch here is additionally
 * `enabled`-gated and shares the exact query key use-dashboard-kpis uses, so
 * react-query dedupes it to the strip's single request.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useTenantId } from "@/lib/tenant";
import { fetchCogs } from "@/features/inventory/inventory-api";
import { fetchDashboardReport } from "./dashboard-api";
import type { GrossMargin } from "./kpi-deltas";
import type { MarginGate } from "./dashboard-types";
import { PARTIAL_MARGIN_CAVEAT, marginGateNote } from "./coverage-notes";
import type { LocalDateRange } from "./domain/comparison-period";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency: "NIO",
    minimumFractionDigits: 2,
  }).format(amount);
}

export interface RentabilidadCardProps {
  /** AC-17 gate (mirrors the page-level gate; also enables the COGS read). */
  canViewCost: boolean;
  /** Selected period — same key as the strip's COGS query, so it dedupes. */
  range: LocalDateRange;
  netSalesNio: number | null;
  /** Margin from kpi-deltas (null when not computable from the wire). */
  margin: GrossMargin | null;
  /** Coverage trust gate from dashboard-types (fail-closed). */
  marginGate: MarginGate;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums text-card-foreground">{value}</span>
    </div>
  );
}

/**
 * V2 dashboard report read for the management band (FR-DISC-02 denominator).
 * Shares the exact query key use-dashboard-kpis uses for its V2 report, so
 * react-query dedupes it to the strip's single request — no extra fetch.
 */
export function useDashboardV2Report(start: string, end: string, enabled = true) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["sales", tenantId, "dashboard-v2", start, end],
    queryFn: ({ signal }) => fetchDashboardReport(start, end, { signal }),
    staleTime: 2 * 60 * 1000,
    retry: false,
    enabled,
  });
}

export function RentabilidadCard({
  canViewCost,
  range,
  netSalesNio,
  margin,
  marginGate,
}: RentabilidadCardProps) {
  const tenantId = useTenantId();
  // Same query key as use-dashboard-kpis' COGS read: one shared request.
  const cogsQuery = useQuery({
    queryKey: ["inventory", tenantId, "cogs", range.start, range.end],
    queryFn: ({ signal }) => fetchCogs(range.start, range.end, { signal }),
    staleTime: 5 * 60 * 1000,
    retry: false,
    enabled: canViewCost,
  });

  const salesCogsNio =
    cogsQuery.data && Number.isFinite(cogsQuery.data.salesCogsNio)
      ? cogsQuery.data.salesCogsNio
      : null;
  const shrinkageCogsNio =
    cogsQuery.data && Number.isFinite(cogsQuery.data.shrinkageCogsNio)
      ? cogsQuery.data.shrinkageCogsNio
      : null;

  const showAmounts = marginGate.amount;
  const costoVentas = showAmounts && salesCogsNio !== null ? formatCurrency(salesCogsNio) : "—";
  const margenBruto =
    showAmounts && margin ? formatCurrency(margin.amount) : "—";
  const margenPercent = marginGate.ratio && margin ? `${margin.percent.toFixed(1)}%` : null;
  const mermas = showAmounts && shrinkageCogsNio !== null ? formatCurrency(shrinkageCogsNio) : null;

  return (
    <div
      data-testid="rentabilidad-card"
      className="flex flex-col rounded-lg border border-border bg-card p-6 shadow-sm"
    >
      <header className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-card-foreground">
          RENTABILIDAD — Margen Bruto
        </h2>
        <Link
          to="/sales"
          className="text-xs font-medium text-primary underline-offset-2 hover:underline"
        >
          Ver →
        </Link>
      </header>
      <div className="space-y-3">
        <Row label="Ventas netas" value={netSalesNio !== null ? formatCurrency(netSalesNio) : "—"} />
        <Row label="Costo de ventas" value={costoVentas} />
        <div className="flex items-center justify-between text-sm font-semibold">
          <span className="text-foreground">Margen bruto</span>
          <span className="tabular-nums text-foreground">
            {margenBruto}
            {margenPercent && <span className="text-muted-foreground"> · {margenPercent}</span>}
          </span>
        </div>
        {mermas !== null && (
          <div className="border-t border-border pt-3">
            <Row label="Mermas (operativa)" value={mermas} />
            <p className="mt-1 text-xs text-muted-foreground">no reduce el margen mostrado</p>
          </div>
        )}
        {marginGate.gated &&
          (showAmounts ? (
            // PARTIAL: the amounts are real but only for the costed part of
            // the period. Uncosted sales add revenue without cost, so the
            // margin shown is an UPPER bound on the true one — the caveat has
            // to say that, because a bare "C$29,780.50" reads as complete.
            <div className="border-t border-border pt-3">
              <p className="text-xs text-muted-foreground">{PARTIAL_MARGIN_CAVEAT}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {marginGateNote(marginGate.reasonCodes)}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Costo de ventas no disponible</p>
          ))}
      </div>
    </div>
  );
}
