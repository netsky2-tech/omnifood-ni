/**
 * HourlySales — 24h demand distribution (Dashboard V2 Batch 5b).
 *
 * Authority: PRD §15 (FR-HOURLY-01..03), §23, §24, §25.3.
 *
 * Consumes GET /sales/reports/hourly-sales (Batch 5c wire contract). A single
 * day queries with `date`; a multi-day range queries with `startDate`/`endDate`
 * and the backend returns the per-hour distribution aggregated across the
 * whole range — the card displays it as an average per hour, labeled with
 * `meta.dayCount` (FR-HOURLY-01/03, no silent single-day substitution).
 *
 * A day/range with no sales renders an explicit "sin actividad" state, never
 * a meaningless flat chart.
 */
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Rectangle } from "recharts";
import type { BarShapeProps } from "recharts";
import type { ComponentProps } from "react";
import { useNavigate } from "react-router-dom";
import { buildHourlyBars, formatNio } from "./chart-domain";
import { ChartCard, EmptyNote, WidgetError, WidgetSkeleton } from "./chart-card";
import { useHourlyReport } from "./use-dashboard-charts";
import { buildDashboardDrilldownUrl } from "./domain/navigation-context";

/** Props the Bar shape renderer actually forwards; everything else is strip-geometry data. */
const BAR_SHAPE_NON_DOM_KEYS = [
  "payload",
  "value",
  "background",
  "tooltipPosition",
  "parentViewBox",
  "stackedBarStart",
  "originalDataIndex",
  "isActive",
  "index",
  "dataKey",
  "animationElapsedTime",
  "isAnimating",
  "isEntrance",
] as const;

export function HourlySalesChart({ start, end }: { start: string; end: string }) {
  const query = useHourlyReport(start, end);
  const navigate = useNavigate();

  /** §15/§28.F.6: an hour bar drills down to that hour on the hourly tab. */
  const hourDrilldownUrl = (hour: number) =>
    buildDashboardDrilldownUrl(
      "/sales",
      {
        source: "dashboard",
        sourceWidget: "hourly-sales",
        startDate: start,
        endDate: end,
      },
      { tab: "hourly", hour },
    );

  const openHour = (hour: number) => navigate(hourDrilldownUrl(hour));

  /** §28.F.6: every clickable bar carries its own accessible label. */
  const clickableBarShape = (props: BarShapeProps) => {
    const rest = {} as Record<string, unknown>;
    for (const [key, value] of Object.entries(props)) {
      if (!(BAR_SHAPE_NON_DOM_KEYS as readonly string[]).includes(key)) {
        rest[key] = value;
      }
    }
    const hour = Number((props as { payload?: { hour?: unknown } }).payload?.hour);
    return (
      <Rectangle
        {...(rest as ComponentProps<typeof Rectangle>)}
        role="button"
        tabIndex={0}
        data-testid={`hourly-bar-${hour}`}
        aria-label={`Ver ventas de las ${String(hour).padStart(2, "0")}:00`}
        className="cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openHour(hour);
          }
        }}
      />
    );
  };

  let body;
  if (query.isPending) {
    body = <WidgetSkeleton testId="hourly-skeleton" />;
  } else if (query.isError || !query.data) {
    body = (
      <WidgetError
        testId="hourly-error"
        message="No se pudieron cargar las ventas por hora. El resto del dashboard sigue disponible."
      />
    );
  } else {
    const { bars, hasActivity, firstActiveHour, lastActiveHour } = buildHourlyBars(query.data.hourly);
    if (!hasActivity) {
      body = <EmptyNote testId="hourly-empty">sin actividad</EmptyNote>;
    } else {
      const dayCount = query.data.dayCount;
      const rangeCaption =
        dayCount > 1
          ? `Promedio por hora en ${dayCount} días (${start} — ${end})`
          : `Día: ${query.data.date || start}`;
      body = (
        <>
          <p data-testid="hourly-caption" className="mb-2 text-xs text-muted-foreground">
            {rangeCaption} · Horario con actividad: {String(firstActiveHour).padStart(2, "0")}:00 –{" "}
            {String(lastActiveHour).padStart(2, "0")}:00
          </p>
          <div role="group" aria-label="Ventas por hora del día">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={bars} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10 }}
                  interval={2}
                  tickLine={false}
                  axisLine={false}
                />
                {/* WU9: money ticks use the shared formatNio (full
                    "C$48,520.50" labels), so the axis grows 48 -> 88 instead
                    of dropping the currency prefix. */}
                <YAxis tickFormatter={formatNio} width={88} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: "var(--color-muted, #f1f5f9)" }}
                  formatter={(value) => formatNio(Number(value))}
                  labelFormatter={(label) => String(label)}
                />
                {/* §15/§28.F.6: Bar-level onClick is the recharts-native click
                    route (payload carries the hour); the custom shape only adds
                    the accessible semantics and keyboard handler. */}
                <Bar
                  dataKey="sales"
                  fill="var(--color-primary, #013a57)"
                  radius={[2, 2, 0, 0]}
                  shape={clickableBarShape}
                  onClick={(data) => {
                    const hour = Number((data as { payload?: { hour?: unknown } }).payload?.hour);
                    if (Number.isInteger(hour) && hour >= 0 && hour <= 23) {
                      openHour(hour);
                    }
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      );
    }
  }

  const drilldownUrl = buildDashboardDrilldownUrl(
    "/sales",
    {
      source: "dashboard",
      sourceWidget: "hourly-sales",
      startDate: start,
      endDate: end,
    },
    { tab: "hourly" },
  );

  return (
    <ChartCard
      title="Ventas por hora"
      testId="hourly-card"
      to={drilldownUrl}
      linkAriaLabel="Ver ventas por hora en detalle"
    >
      {body}
    </ChartCard>
  );
}
