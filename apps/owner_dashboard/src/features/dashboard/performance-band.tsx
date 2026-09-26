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
 * (2:1); that attention block is a later batch, so the trend spans the row.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { formatLocalDate } from "@/lib/utils";
import { resolveComparisonPeriod, type LocalDateRange } from "./domain/comparison-period";
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
      <ChartCellBoundary>
        <SalesTrendChart
          currentStart={period.currentStart}
          currentEnd={period.currentEnd}
          previousStart={period.previousStart}
          previousEnd={period.previousEnd}
        />
      </ChartCellBoundary>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <ChartCellBoundary>
          {/* The hourly route reports a single day: use the range's most
              recent day and say so in the card caption. */}
          <HourlySalesChart date={period.currentEnd} />
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
