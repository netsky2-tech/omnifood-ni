/**
 * HourlySales — 24h demand distribution (Dashboard V2 Batch 5b).
 *
 * Authority: PRD §15 (FR-HOURLY-01..03), §23, §24, §25.3.
 *
 * Consumes the existing GET /sales/reports/hourly-sales route, which reports a
 * single local day. For a multi-day range the card reports the range's most
 * recent day explicitly in the caption — the backend never silently averages
 * days it does not aggregate (FR-HOURLY-03 reconciliation is a backend debt,
 * tracked outside this batch).
 *
 * A day with no sales renders an explicit "sin actividad" state, never a
 * meaningless flat chart.
 */
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { buildHourlyBars, compactNio, formatNio } from "./chart-domain";
import { ChartCard, EmptyNote, WidgetError, WidgetSkeleton } from "./chart-card";
import { useHourlyReport } from "./use-dashboard-charts";

export function HourlySalesChart({ date }: { date: string }) {
  const query = useHourlyReport(date);

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
      body = (
        <>
          <p data-testid="hourly-caption" className="mb-2 text-xs text-muted-foreground">
            Día: {date} · Horario con actividad: {String(firstActiveHour).padStart(2, "0")}:00 –{" "}
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
