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
import { buildHourlyBars, compactNio, formatNio } from "./chart-domain";
import { ChartCard, EmptyNote, WidgetError, WidgetSkeleton } from "./chart-card";
import { useHourlyReport } from "./use-dashboard-charts";

export function HourlySalesChart({ start, end }: { start: string; end: string }) {
  const query = useHourlyReport(start, end);

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
          <div role="img" aria-label="Ventas por hora del día">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={bars} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10 }}
                  interval={2}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis tickFormatter={compactNio} width={48} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: "var(--color-muted, #f1f5f9)" }}
                  formatter={(value) => formatNio(Number(value))}
                  labelFormatter={(label) => String(label)}
                />
                <Bar dataKey="sales" fill="var(--color-primary, #013a57)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      );
    }
  }

  return (
    <ChartCard title="Ventas por hora" testId="hourly-card">
      {body}
    </ChartCard>
  );
}
