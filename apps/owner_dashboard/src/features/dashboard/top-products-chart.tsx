/**
 * TopProducts — compact product contribution card (Dashboard V2 Batch 5b).
 *
 * Authority: PRD §16 (FR-PRODUCT-01..03), §23, §24, §25.3.
 *
 * Consumes GET /sales/reports/top-products (Batch 5c-backend reconciled
 * contract):
 * - units: the endpoint's `totalQuantity` is a real units field — rendered.
 * - share %: computed client-side against the endpoint's authoritative
 *   denominator and DELIBERATELY NOT CLAMPED to 100. Because the denominator is
 *   Net Sales net of refunds while each numerator is one product's own net
 *   revenue, a heavily refunded sibling can legitimately push another product
 *   above 100 % (A C$1,000 against A C$1,000 + B C$800 − C$900 refund = 111.1 %).
 *   Clamping would assert a share the data does not support — the same
 *   fabrication this batch removes elsewhere — so the number stays true and the
 *   note says which denominator it uses and why it can exceed 100 % (finding
 *   S1, owner decision).
 *   `periodNetSalesNio` (period Net Sales over the SAME invoice set the
 *   aggregates come from), so a truncated Top-N cannot inflate shares; a
 *   missing/zero denominator renders shares as an em-dash (fail closed).
 * - revenue: `netRevenueNio` is post-discount, pre-tax Net Sales, reconciled
 *   line-by-line with the executive KPI `netSalesNio` (FR-PRODUCT-01). The
 *   Batch 5b tax-inclusive disclaimer is gone: the card now matches the KPI
 *   basis exactly.
 */
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { buildTopProductRows, formatNio } from "./chart-domain";
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
    const { rows } = buildTopProductRows(
      query.data.products,
      undefined,
      // Denominator co-located with the numerator: the backend computes it
      // over the same invoice set and period as the product aggregates.
      query.data.periodNetSalesNio,
    );
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
                <span
                  className="w-14 whitespace-nowrap text-right text-xs font-medium tabular-nums text-muted-foreground"
                  title={`Participación de ${row.name} sobre las Ventas Netas del período (netas de devoluciones)`}
                >
                  {formatShare(row.sharePercent)}
                </span>
              </li>
            ))}
          </ul>
          <div role="img" aria-label="Ingresos por producto">
            <ResponsiveContainer width="100%" height={rows.length * 28 + 16}>
              <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                {/* WU9: the money axis uses the shared formatNio so its ticks
                    carry the C$ unit (the product-name YAxis and the units
                    count stay unitless). */}
                <XAxis type="number" tickFormatter={formatNio} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
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
            Participación sobre las Ventas Netas del período (post-descuento, pre-IVA, netas de
            devoluciones). Un producto puede superar el 100&nbsp;% cuando las devoluciones de otros
            reducen ese total.
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
