/**
 * SalesTrend — daily Net Sales trend with optional comparison series
 * (Dashboard V2 Batch 5b).
 *
 * Authority: PRD §14 (FR-CHART-01..04), §23, §24, §25.2/25.3.
 *
 * - current-range daily series from the frozen daily-series contract; when a
 *   comparison range is supplied (Batch 2 resolver), the previous series is
 *   fetched and rendered dashed (§25.3: comparison uses neutral gray, never
 *   color-alone — the text legend carries the meaning).
 * - single-day ranges hide the trend entirely: hourly granularity is that
 *   card's job (FR-CHART-02).
 * - an all-zero range renders an explicit no-sales state, never a flat zero
 *   line (FR-CHART-04).
 */
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DotItemDotProps } from "recharts";
import { useNavigate } from "react-router-dom";
import { buildTrendRows, formatNio, isZeroSeries } from "./chart-domain";
import { ChartCard, EmptyNote, WidgetError, WidgetSkeleton } from "./chart-card";
import { useDailySeries } from "./use-dashboard-charts";
import { buildDashboardDrilldownUrl } from "./domain/navigation-context";

/**
 * NHILOS standard §21: date chips are es-NI, locale-stable; “19 de septiembre”
 * reads as a day, not a bucket label. UTC calendar math on the YYYY-MM-DD key
 * (same technique as chart-domain.trendBucketLabel) keeps it deterministic.
 */
function dayLongLabel(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return new Intl.DateTimeFormat("es-NI", { day: "numeric", month: "long", timeZone: "UTC" }).format(d);
}

export interface SalesTrendChartProps {
  currentStart: string;
  currentEnd: string;
  previousStart?: string;
  previousEnd?: string;
}

export function SalesTrendChart({
  currentStart,
  currentEnd,
  previousStart,
  previousEnd,
}: SalesTrendChartProps) {
  const isSingleDay = currentStart === currentEnd;
  const navigate = useNavigate();

  const currentQuery = useDailySeries(currentStart, currentEnd, !isSingleDay);
  const previousQuery = useDailySeries(
    previousStart ?? "",
    previousEnd ?? "",
    !isSingleDay && previousStart != null && previousEnd != null,
  );

  const drilldownUrl = buildDashboardDrilldownUrl(
    "/sales",
    {
      source: "dashboard",
      sourceWidget: "sales-trend",
      startDate: currentStart,
      endDate: currentEnd,
    },
    { tab: "summary" },
  );

  /** §15/§28.F.6: a day point drills down to that single day's summary. */
  const dayDrilldownUrl = (date: string) =>
    buildDashboardDrilldownUrl(
      "/sales",
      {
        source: "dashboard",
        sourceWidget: "sales-trend",
        startDate: date,
        endDate: date,
      },
      { tab: "summary" },
    );

  const openDay = (date: string) => navigate(dayDrilldownUrl(date));

  /** §28.F.6: every clickable day point carries its own accessible label. */
  const clickableDot = (props: DotItemDotProps) => {
    // DotItemDotProps carries chart-internal fields (points/index/payload/
    // dataKey/value) that are not valid circle attributes — strip them before
    // spreading the SVG geometry props.
    const { payload, points, index, dataKey, value, ...rest } = props;
    void points;
    void index;
    void dataKey;
    void value;
    const date = String(payload?.date ?? "");
    return (
      <circle
        {...rest}
        r={4}
        strokeWidth={1}
        role="button"
        tabIndex={0}
        data-testid={`trend-dot-${date}`}
        aria-label={`Ver ventas del ${dayLongLabel(date)}`}
        className="cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        onClick={() => openDay(date)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openDay(date);
          }
        }}
      />
    );
  };

  // When isSingleDay is true, keep the card visible so the grid structure
  // remains stable (pairing 2:1 with AttentionBand).
  if (isSingleDay) {
    return (
      <ChartCard
        title="Evolución de ventas"
        testId="trend-card"
        to={drilldownUrl}
        linkAriaLabel="Ver resumen detallado de ventas"
      >
        <EmptyNote testId="trend-empty">
          Seleccione un rango de 2 o más días para ver la evolución
        </EmptyNote>
      </ChartCard>
    );
  }

  if (currentQuery.isPending) {
    return (
      <ChartCard
        title="Evolución de ventas"
        testId="trend-card"
        to={drilldownUrl}
        linkAriaLabel="Ver resumen detallado de ventas"
      >
        <WidgetSkeleton testId="trend-skeleton" />
      </ChartCard>
    );
  }

  if (currentQuery.isError || !currentQuery.data) {
    return (
      <ChartCard
        title="Evolución de ventas"
        testId="trend-card"
        to={drilldownUrl}
        linkAriaLabel="Ver resumen detallado de ventas"
      >
        <WidgetError
          testId="trend-error"
          message="No se pudieron cargar la serie de ventas diarias. El resto del dashboard sigue disponible."
        />
      </ChartCard>
    );
  }

  const currentDays = currentQuery.data.days;
  if (isZeroSeries(currentDays) && (previousQuery.data === undefined || isZeroSeries(previousQuery.data?.days ?? null))) {
    return (
      <ChartCard
        title="Evolución de ventas"
        testId="trend-card"
        to={drilldownUrl}
        linkAriaLabel="Ver resumen detallado de ventas"
      >
        <EmptyNote testId="trend-empty">No hay ventas en este período</EmptyNote>
      </ChartCard>
    );
  }

  const rows = buildTrendRows(currentDays, previousQuery.data?.days ?? null);

  return (
    <ChartCard
      title="Evolución de ventas"
      testId="trend-card"
      to={drilldownUrl}
      linkAriaLabel="Ver resumen detallado de ventas"
    >
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1" data-testid="trend-legend">
        <span className="flex items-center gap-1.5 text-xs text-card-foreground">
          <span aria-hidden="true" className="inline-block h-0.5 w-4 bg-[#013a57]" />
          Ventas netas — periodo actual
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span aria-hidden="true" className="inline-block border-t-2 border-dashed border-muted-foreground" style={{ width: 16 }} />
          Periodo anterior (comparación)
        </span>
      </div>
      {previousQuery.isError && (
        <p data-testid="trend-comparison-error" className="mb-1 text-xs text-amber-700 dark:text-amber-300">
          No se pudo cargar la comparación del periodo anterior.
        </p>
      )}
      <div role="group" aria-label="Evolución de ventas netas por día">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} tickLine={false} axisLine={false} />
            {/* WU9: money ticks use the shared formatNio (full "C$48,520.50"
                labels), so the axis grows 48 -> 88 instead of dropping the
                currency prefix. */}
            <YAxis tickFormatter={formatNio} width={88} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip
              formatter={(value) => formatNio(Number(value))}
              labelFormatter={(label) => String(label)}
            />
            {/* §15/§28.F.6: the current-series points are drill-down controls
                (role=button, labelled, keyboard-operable). The comparison
                series stays decorative — its context is the range, not a day. */}
            <Line
              type="monotone"
              dataKey="current"
              name="Ventas netas — periodo actual"
              stroke="var(--color-primary, #013a57)"
              strokeWidth={2}
              dot={clickableDot}
              activeDot={false}
            />
            <Line
              type="monotone"
              dataKey="previous"
              name="Periodo anterior (comparación)"
              stroke="var(--color-muted-foreground, #64748b)"
              strokeWidth={1.5}
              strokeDasharray="6 4"
              dot={false}
              activeDot={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
