/**
 * PerformanceBand — Dashboard V2 Batch 5b chart band.
 *
 * Composes the four performance widgets under the KPI strip per the wireframe
 * (docs/dashboard/ui_wireframe_reference.md §1): trend on top, then the
 * hourly / top-products / payment-mix row. This module is lazy-loaded from
 * dashboard-page so the KPI strip never waits on chart code (recharts stays
 * in a separate chunk).
 *
 * Isolation: every widget owns its react-query error state, and each cell is
 * additionally wrapped in an error boundary so an unexpected render failure
 * in one chart can never kill its siblings (PRD FR-STATE-04).
 *
 * Layout note: the wireframe pairs the trend with "Atención requerida"
 * (2:1) — Batch 6b adds the AttentionBand in that right-hand column.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { formatLocalDate } from "@/lib/utils";
import { resolveComparisonPeriod, type LocalDateRange } from "./domain/comparison-period";
import { AttentionBand } from "./attention-band";
import { SalesTrendChart } from "./sales-trend-chart";
import { HourlySalesChart } from "./hourly-sales-chart";
import { TopProductsChart } from "./top-products-chart";
import { PaymentMixChart } from "./payment-mix-chart";

class ChartCellBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("PerformanceBand widget crashed:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
          role="alert"
        >
          Esta tarjeta no se pudo mostrar. El resto del dashboard sigue disponible.
        </div>
      );
    }
    return this.props.children;
  }
}

export interface PerformanceBandProps {
  /** Inclusive local calendar-day range (YYYY-MM-DD) selected on the page. */
  range: LocalDateRange;
  /** Injectable "today" (local YYYY-MM-DD) for deterministic tests. */
  today?: string;
}

export function PerformanceBand({ range, today }: PerformanceBandProps) {
  const period = resolveComparisonPeriod(range, today ?? formatLocalDate(new Date()));

  return (
    <section aria-label="Rendimiento del negocio" className="space-y-6">
      {/* Batch 6b: trend (2/3) + Atención Requerida (1/3) per the wireframe
          §1 2:1 row. The band's own signal isolation keeps one failed signal
          from affecting the trend cell (FR-STATE-04/05). */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCellBoundary>
            <SalesTrendChart
              currentStart={period.currentStart}
              currentEnd={period.currentEnd}
              previousStart={period.previousStart}
              previousEnd={period.previousEnd}
            />
          </ChartCellBoundary>
        </div>
        <ChartCellBoundary>
          <AttentionBand range={{ start: period.currentStart, end: period.currentEnd }} />
        </ChartCellBoundary>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <ChartCellBoundary>
          {/* Batch 5c: a single day queries with `date`; a multi-day range
              queries with `startDate`/`endDate` and the card shows the
              averaged per-hour distribution (FR-HOURLY-01/03). */}
          <HourlySalesChart start={period.currentStart} end={period.currentEnd} />
        </ChartCellBoundary>
        <ChartCellBoundary>
          <TopProductsChart start={period.currentStart} end={period.currentEnd} />
        </ChartCellBoundary>
        <ChartCellBoundary>
          <PaymentMixChart start={period.currentStart} end={period.currentEnd} />
        </ChartCellBoundary>
      </div>
    </section>
  );
}
