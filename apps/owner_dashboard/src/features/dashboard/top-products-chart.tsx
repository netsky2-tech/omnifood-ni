/**
 * TopProducts — compact product contribution card (Dashboard V2 Batch 5b).
 *
 * Authority: PRD §16 (FR-PRODUCT-01..03), §23, §24, §25.3.
 *
 * Consumes the existing GET /sales/reports/top-products route. Contract
 * findings surfaced honestly on the card (Batch 5b scope 4):
 * - units: the endpoint's `totalQuantity` is a real units field — rendered.
 * - share %: the endpoint provides none; the share is computed client-side
 *   over the listed rows' revenue and labeled as a listed-share.
 * - revenue basis: `totalRevenue` sums tax-inclusive invoice line totals, so
 *   the card carries a visible note that it is not pre-tax Net Sales
 *   (FR-PRODUCT-01 reconciliation gap — flagged, not invented away).
 */
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { buildTopProductRows, compactNio, formatNio } from "./chart-domain";
import { ChartCard, EmptyNote, WidgetError, WidgetSkeleton } from "./chart-card";
import { useTopProductsReport } from "./use-dashboard-charts";

function formatShare(percent: number | null): string {
  return percent === null ? "—" : `${percent.toFixed(1)}%`;
}

export function TopProductsChart({ start, end }: { start: string; end: string }) {
  const query = useTopProductsReport(start, end);

  let body;
  if (query.isPending) {
    body = <WidgetSkeleton testId="top-products-skeleton" />;
  } else if (query.isError || !query.data) {
    body = (
      <WidgetError
        testId="top-products-error"
        message="No se pudieron cargar los top productos. El resto del dashboard sigue disponible."
      />
    );
  } else {
    const { rows, revenueBasisNote } = buildTopProductRows(query.data.products);
    if (rows.length === 0) {
      body = <EmptyNote testId="top-products-empty">sin datos de productos en este periodo</EmptyNote>;
    } else {
      body = (
        <>
          <ul className="mb-3 space-y-1.5" data-testid="top-products-rows">
            {rows.map((row) => (
              <li key={row.name} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-card-foreground" title={row.name}>
                  {row.name}
                </span>
                <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                  {row.units} u
                </span>
                <span className="w-24 whitespace-nowrap text-right text-sm font-medium tabular-nums text-card-foreground">
                  {formatNio(row.revenue)}
                </span>
                <span className="w-14 whitespace-nowrap text-right text-xs font-medium tabular-nums text-muted-foreground">
                  {formatShare(row.sharePercent)}
                </span>
              </li>
            ))}
          </ul>
          <div role="img" aria-label="Ingresos por producto">
            <ResponsiveContainer width="100%" height={rows.length * 28 + 16}>
              <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                <XAxis type="number" tickFormatter={compactNio} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" width={0} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: "var(--color-muted, #f1f5f9)" }}
                  formatter={(value) => formatNio(Number(value))}
                />
                <Bar dataKey="revenue" fill="var(--color-primary, #013a57)" radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p data-testid="top-products-note" className="mt-2 text-xs text-muted-foreground">
            {revenueBasisNote} Participación calculada sobre los productos listados.
          </p>
        </>
      );
    }
  }

  return (
    <ChartCard title="Top productos" testId="top-products-card">
      {body}
    </ChartCard>
  );
}
