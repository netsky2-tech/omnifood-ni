import { Suspense, lazy, useState } from "react";
import { FreshnessBadge } from "@/components/freshness-badge";
import { DateRangePicker, type DateRangeValue } from "@/components/date-range-picker";
import { useSalesDashboard } from "@/features/sales/use-sales-reports";
import { KpiStrip } from "./kpi-strip";

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

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency: "NIO",
    minimumFractionDigits: 2,
  }).format(amount);
}

function todayRange(): DateRangeValue {
  const iso = formatLocalDate(new Date());
  return { startDate: iso, endDate: iso };
}

export function DashboardPage() {
  const [range, setRange] = useState<DateRangeValue>(todayRange);
  const { data, isLoading, error } = useSalesDashboard(range.startDate, range.endDate);

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
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {data && <FreshnessBadge generatedAt={data.generatedAt} />}
          <DateRangePicker value={range} onChange={setRange} />
        </div>
      </div>

      {/* Dashboard V2 Batch 4: regime-aware executive KPI strip (FR-KPI-01..05,
          FR-FISCAL-01..04). Legacy grossSales is no longer rendered as the
          "Ventas Brutas" hero here; it remains in "Resumen de Ventas" below
          while existing consumers migrate (arch spec §7.3). */}
      <KpiStrip
        range={{ start: range.startDate, end: range.endDate }}
      />

      {/* Dashboard V2 Batch 5b: performance band — sales trend, hourly demand,
          top products and payment mix (PRD §§14–17, §24 drill-down; lazy chunk). */}
      <Suspense fallback={<PerformanceBandSkeleton />}>
        <PerformanceBand range={{ start: range.startDate, end: range.endDate }} />
      </Suspense>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-card-foreground">
            Métodos de Pago
          </h2>
          <div className="space-y-3">
            {[
              { label: "Efectivo NIO", value: data?.paymentMethodsBreakdown.cashNio ?? 0 },
              { label: "Efectivo USD", value: data?.paymentMethodsBreakdown.cashUsd ?? 0 },
              { label: "Tarjeta NIO", value: data?.paymentMethodsBreakdown.cardNio ?? 0 },
              { label: "Tarjeta USD", value: data?.paymentMethodsBreakdown.cardUsd ?? 0 },
              { label: "Otros", value: data?.paymentMethodsBreakdown.other ?? 0 },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{item.label}</span>
                <span className="font-medium tabular-nums text-card-foreground">
                  {formatCurrency(item.value)}
                </span>
              </div>
            ))}
            <div className="border-t border-border pt-3">
              <div className="flex items-center justify-between text-sm font-semibold">
                <span className="text-foreground">Total NIO</span>
                <span className="tabular-nums text-foreground">
                  {formatCurrency(data?.paymentMethodsBreakdown.totalNio ?? 0)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-card-foreground">
            Resumen de Ventas
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Ventas Netas Gravables</span>
              <span className="font-medium tabular-nums text-card-foreground">
                {formatCurrency(data?.netTaxableSales ?? 0)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Impuestos</span>
              <span className="font-medium tabular-nums text-card-foreground">
                {formatCurrency(data?.totalTax ?? 0)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Descuentos</span>
              <span className="font-medium tabular-nums text-destructive">
                -{formatCurrency(data?.totalDiscounts ?? 0)}
              </span>
            </div>
            <div className="border-t border-border pt-3">
              <div className="flex items-center justify-between text-sm font-semibold">
                <span className="text-foreground">Ventas Brutas</span>
                <span className="tabular-nums text-foreground">
                  {formatCurrency(data?.grossSales ?? 0)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {data?.startDate && data?.endDate && (
        <p className="text-xs text-muted-foreground">
          Periodo: {data.startDate} — {data.endDate}
        </p>
      )}
    </div>
  );
}
