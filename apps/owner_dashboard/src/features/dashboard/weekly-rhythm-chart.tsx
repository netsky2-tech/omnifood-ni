/**
 * WeeklyRhythmChart — Consolidated Monday-to-Sunday demand rhythm.
 *
 * Authority: Issue #960 (Bloque 2: Inteligencia operativa y ritmo de negocio).
 * Consumes GET /sales/reports/dashboard/daily-series over the selected period
 * to aggregate sales by day of week (Lunes a Domingo), highlighting weekly
 * peak volume and weekend concentration.
 */
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Rectangle } from "recharts";
import type { BarShapeProps } from "recharts";
import type { ComponentProps } from "react";
import { useNavigate } from "react-router-dom";
import { buildWeeklyRhythm, formatNio, type WeeklyRhythmDay } from "./chart-domain";
import { ChartCard, EmptyNote, WidgetError, WidgetSkeleton } from "./chart-card";
import { useDailySeries } from "./use-dashboard-charts";
import { buildDashboardDrilldownUrl } from "./domain/navigation-context";

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

export interface WeeklyRhythmChartProps {
  start: string;
  end: string;
}

export function WeeklyRhythmChart({ start, end }: { start: string; end: string }) {
  const isSingleDay = start === end;
  const navigate = useNavigate();
  const query = useDailySeries(start, end, !isSingleDay);

  const drilldownUrl = buildDashboardDrilldownUrl(
    "/sales",
    {
      source: "dashboard",
      sourceWidget: "weekly-rhythm",
      startDate: start,
      endDate: end,
    },
    { tab: "summary" },
  );

  const clickableBarShape = (props: BarShapeProps) => {
    const rest = {} as Record<string, unknown>;
    for (const [key, value] of Object.entries(props)) {
      if (!(BAR_SHAPE_NON_DOM_KEYS as readonly string[]).includes(key)) {
        rest[key] = value;
      }
    }
    const payload = (props as { payload?: WeeklyRhythmDay }).payload;
    const isPeak = Boolean(payload?.isPeakDay);
    const dayName = payload?.name ?? "Día";
    return (
      <Rectangle
        {...(rest as ComponentProps<typeof Rectangle>)}
        role="button"
        tabIndex={0}
        data-testid={`weekly-bar-${payload?.dayIndex ?? 0}`}
        aria-label={`Ventas de ${dayName}`}
        fill={
          isPeak
            ? "var(--color-primary, #013a57)"
            : "color-mix(in srgb, var(--color-primary, #013a57) 70%, transparent)"
        }
        className="cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        onClick={() => navigate(drilldownUrl)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigate(drilldownUrl);
          }
        }}
      />
    );
  };

  let body;
  if (isSingleDay) {
    body = (
      <EmptyNote testId="weekly-rhythm-single-day">
        Seleccione un rango de varios días para ver el ritmo semanal
      </EmptyNote>
    );
  } else if (query.isPending) {
    body = <WidgetSkeleton testId="weekly-rhythm-skeleton" />;
  } else if (query.isError || !query.data) {
    body = (
      <WidgetError
        testId="weekly-rhythm-error"
        message="No se pudo cargar el ritmo semanal. El resto del dashboard sigue disponible."
      />
    );
  } else {
    const rhythm = buildWeeklyRhythm(query.data.days);
    if (!rhythm.hasActivity) {
      body = <EmptyNote testId="weekly-rhythm-empty">sin ventas registradas en la semana</EmptyNote>;
    } else {
      const peakText = rhythm.peakDay
        ? `Mayor afluencia: ${rhythm.peakDay.name} (${formatNio(rhythm.peakDay.averageSales)} prom.)`
        : "";
      const weekendText =
        rhythm.weekendSharePercent !== null
          ? `Vie–Dom: ${rhythm.weekendSharePercent}% de ventas`
          : "";

      body = (
        <>
          <div
            data-testid="weekly-rhythm-caption"
            className="mb-2 flex flex-wrap items-center justify-between gap-1 text-xs text-muted-foreground"
          >
            <span className="truncate">{peakText}</span>
            {weekendText && (
              <span className="shrink-0 font-medium text-foreground">{weekendText}</span>
            )}
          </div>
          <div role="group" aria-label="Afluencia y ventas por día de la semana">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={rhythm.days} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <XAxis
                  dataKey="shortName"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tickFormatter={formatNio}
                  width={88}
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  cursor={{ fill: "var(--color-muted, #f1f5f9)" }}
                  formatter={(value, _name, item) => {
                    const d = (item as unknown as { payload?: WeeklyRhythmDay })?.payload;
                    const lines = [`${formatNio(Number(value))}`, "Venta total"];
                    if (d && d.averageSales !== d.totalSales) {
                      lines[0] += ` (${formatNio(d.averageSales)}/día)`;
                    }
                    if (d?.sharePercent !== null) {
                      lines[0] += ` · ${d?.sharePercent}%`;
                    }
                    return lines;
                  }}
                  labelFormatter={(_label, payload) => {
                    const d = payload?.[0]?.payload as WeeklyRhythmDay | undefined;
                    return d?.name ?? String(_label);
                  }}
                />
                <Bar
                  dataKey="totalSales"
                  fill="var(--color-primary, #013a57)"
                  radius={[2, 2, 0, 0]}
                  shape={clickableBarShape}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      );
    }
  }

  return (
    <ChartCard
      title="Afluencia semanal"
      testId="weekly-rhythm-card"
      to={drilldownUrl}
      linkAriaLabel="Ver análisis semanal en detalle"
    >
      {body}
    </ChartCard>
  );
}
