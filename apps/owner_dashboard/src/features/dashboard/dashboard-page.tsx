import { Suspense, lazy, useState, useCallback } from "react";
import { FreshnessBadge } from "@/components/freshness-badge";
import { DateRangePicker, type DateRangeValue } from "@/components/date-range-picker";
import { useSafeSearchParams } from "@/lib/safe-search-params";
import { useSalesDashboard } from "@/features/sales/use-sales-reports";
import { useCanViewInventoryCost } from "@/features/auth/permissions";
import { KpiStrip } from "./kpi-strip";
import { useDashboardKpis } from "./use-dashboard-kpis";
import { useSyncFreshness } from "./use-sync-freshness";
import { TipsSummaryCard } from "./tips-summary";
import { RentabilidadCard, useDashboardV2Report } from "./rentabilidad-card";

// Batch 5b: the performance band (charts + recharts) lives in its own lazy
// chunk so the KPI strip never waits on chart code (PRD §25.2 bundle
// discipline; ui_wireframe_reference.md §1 band placement).
const PerformanceBand = lazy(() =>
  import("./performance-band").then((m) => ({ default: m.PerformanceBand })),
);

function PerformanceBandSkeleton() {
  return (
    <div
      data-testid="performance-band-skeleton"
      className="grid grid-cols-1 gap-6 lg:grid-cols-3"
      aria-hidden="true"
    >
      <div className="h-64 animate-pulse rounded-lg border border-border bg-muted/40 lg:col-span-3" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-56 animate-pulse rounded-lg border border-border bg-muted/40" />
      ))}
    </div>
  );
}

import { formatLocalDate } from "@/lib/utils";

// G2 (FR-FISCAL-03): quiet regime context for the dashboard header. Labels
// are keyed strictly by the backend FiscalRegime enum values (FR-FISCAL-01);
// an unknown regime produces no label at all.
const FISCAL_REGIME_LABELS: Record<string, string> = {
  CUOTA_FIJA: "Cuota Fija",
  REGIMEN_GENERAL: "Régimen General",
};

function todayRange(): DateRangeValue {
  const iso = formatLocalDate(new Date());
  return { startDate: iso, endDate: iso };
}

// Review round 2 (WU5): the management band reflows between the two-card
// grid (OWNER with the cost grant) and a single column (grant omitted).
// Complete literal class strings on purpose — Tailwind only emits utilities
// whose names appear verbatim in source.
const MANAGEMENT_BAND_TWO_CARDS = "grid grid-cols-1 gap-6 lg:grid-cols-2";
const MANAGEMENT_BAND_ONE_CARD = "grid grid-cols-1 gap-6";

function rangeFromSearchParams(sp: URLSearchParams): DateRangeValue {
  const startDate = sp.get("startDate");
  const endDate = sp.get("endDate");
  if (startDate && endDate) return { startDate, endDate };
  return todayRange();
}

export function DashboardPage() {
  const [searchParams, setSearchParams] = useSafeSearchParams();
  const [range, setRange] = useState<DateRangeValue>(() => rangeFromSearchParams(searchParams));

  const handleRangeChange = useCallback(
    (next: DateRangeValue) => {
      setRange(next);
      setSearchParams(
        (prev) => {
          const sp = new URLSearchParams(prev);
          sp.set("startDate", next.startDate);
          sp.set("endDate", next.endDate);
          return sp;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const { data, isLoading, error } = useSalesDashboard(range.startDate, range.endDate);
  // Batch 7 (PRD §21): the tips card reads the V2 report through the same
  // hook/cache the KpiStrip uses — one shared dashboard-v2 query, no extra
  // fetch. COGS reads keep the AG-06/AC-17 cost gate.
  const canViewCost = useCanViewInventoryCost();
  const { snapshot, fiscal, isFiscalPending, isFiscalFailed, marginGate } = useDashboardKpis(
    { start: range.startDate, end: range.endDate },
    undefined,
    { canViewCost },
  );
  // WU5 (FR-DISC-02): the Flujos card needs the period's approved
  // pre-discount sales as the honest discount-rate denominator. Same query
  // key as the strip's V2 report read, so react-query dedupes it — no extra
  // fetch.
  const v2Report = useDashboardV2Report(range.startDate, range.endDate);
  // G2 (FR-FISCAL-03/04): the label exists only once the backend regime is
  // confirmed. While pending, or when the fetch failed / the profile is
  // unknown, no regime claim is rendered — an absent label is honest, a
  // guessed one would contradict FR-FISCAL-04.
  const regimeLabel =
    !isFiscalPending && !isFiscalFailed && fiscal
      ? FISCAL_REGIME_LABELS[fiscal.regime]
      : undefined;
  // Dashboard V2 sync freshness (PRD §20, FR-SYNC-01..05): the badge shows
  // the real watermark-derived state; generatedAt stays technical metadata.
  const {
    data: freshness,
    isLoading: isFreshnessLoading,
  } = useSyncFreshness();

  if (isLoading && !data) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-center">
        <p className="text-sm font-medium text-destructive">
          Error al cargar el dashboard. Verifique su conexión o vuelva a intentar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && data && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          No se pudieron actualizar los datos más recientes. Mostrando información en caché.
        </div>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Métricas clave de facturación y resumen de operaciones
            {regimeLabel && (
              <span data-testid="fiscal-regime-context">
                {" · "}
                Régimen fiscal: {regimeLabel}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {data && (
            <FreshnessBadge
              freshness={freshness ?? null}
              generatedAt={data.generatedAt}
              isLoading={isFreshnessLoading}
            />
          )}
          <DateRangePicker value={range} onChange={handleRangeChange} />
        </div>
      </div>

      {/* Dashboard V2 Batch 4: regime-aware executive KPI strip (FR-KPI-01..05,
          FR-FISCAL-01..04). The legacy "Ventas Brutas" hero and the static
          "Resumen de Ventas" card were retired in review round 2 (owner P2:
          fully redundant); legacy grossSales fields remain on the wire only
          for migration (arch spec §7.3). */}
      <KpiStrip
        range={{ start: range.startDate, end: range.endDate }}
      />

      {/* Dashboard V2 Batch 5b: performance band — sales trend, hourly demand,
          top products and payment mix (PRD §§14–17, §24 drill-down; lazy chunk). */}
      <Suspense fallback={<PerformanceBandSkeleton />}>
        <PerformanceBand range={{ start: range.startDate, end: range.endDate }} />
      </Suspense>

      {/* Dashboard V2 Batch 5c: the legacy "Métodos de Pago" card was removed
          — the PaymentMixChart in the performance band above is now the single
          payment-composition surface (same paymentMethodsBreakdown, net of
          changeGiven, with original-currency USD slots and percent labels). */}
      {/* Review round 2 (WU5): management band per the wireframe §1 bottom
          rows — RENTABILIDAD (Margen Bruto breakdown, AC-17-gated; omitted
          entirely without the cost grant so the band reflows without a hole)
          next to the FLUJOS SEPARADOS DE VENTAS card (Descuentos on the
          FR-DISC-02 pre-discount base + tips outside the sales total). */}
      <div
        data-testid="management-band"
        className={canViewCost ? MANAGEMENT_BAND_TWO_CARDS : MANAGEMENT_BAND_ONE_CARD}
      >
        {canViewCost && (
          <RentabilidadCard
            canViewCost={canViewCost}
            range={{ start: range.startDate, end: range.endDate }}
            netSalesNio={snapshot?.netSalesNio ?? null}
            margin={snapshot?.margin ?? null}
            marginGate={marginGate}
          />
        )}
        <TipsSummaryCard
          summary={snapshot?.tipsSummary ?? null}
          totalDiscountsNio={snapshot?.totalDiscountsNio ?? null}
          preDiscountSalesNio={v2Report.data?.preDiscountSalesNio ?? null}
        />
      </div>

      {/* Review round 2 (WU9): the old "Periodo:" footer was removed — it
          restated the range the user controls in the date picker above, and
          that picker trigger always renders "startDate — endDate" on screen,
          so the visible period stays attributed without the duplicate. */}
    </div>
  );
}
