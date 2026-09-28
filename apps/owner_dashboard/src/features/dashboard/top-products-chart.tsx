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
import { Link } from "react-router-dom";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { buildTopProductRows, formatNio, type TopProductRow } from "./chart-domain";
import { ChartCard, EmptyNote, WidgetError, WidgetSkeleton } from "./chart-card";
import { useTopProductsReport } from "./use-dashboard-charts";
import { buildDashboardDrilldownUrl } from "./domain/navigation-context";

function formatShare(percent: number | null): string {
  return percent === null ? "—" : `${percent.toFixed(1)}%`;
}

/**
 * Per-cell explanation (review advisory R3-001). The card note already states
 * the basis once for the whole widget; repeating it here would be decoration.
 * What only this cell can say is its own arithmetic, so the tooltip shows the
 * numerator, the exact denominator `sharePercent` used, and the quotient — a
 * 111.1 % reading then explains itself with the numbers that produced it.
 * When the denominator is absent nothing is divided, and the text says so
 * rather than showing a bare em-dash.
 */
function shareTitle(row: TopProductRow): string {
  if (row.sharePercent === null || row.periodNetSalesNio === null) {
    return `Participación de ${row.name} no calculable: el período no tiene Ventas Netas de referencia`;
  }
  return (
    `Participación de ${row.name}: ${formatNio(row.revenue)} de ` +
    `${formatNio(row.periodNetSalesNio)} de Ventas Netas del período = ` +
    `${formatShare(row.sharePercent)}`
  );
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
            {rows.map((row) => {
              const productDrilldownUrl = buildDashboardDrilldownUrl(
                "/sales",
                {
                  source: "dashboard",
                  sourceWidget: "top-products",
                  startDate: start,
                  endDate: end,
                  entityType: "product",
                  entityId: row.productId,
                },
                { tab: "products", product: row.name },
              );
              return (
                <li key={row.name} className="flex items-center justify-between gap-2 text-sm">
                  <Link
                    to={productDrilldownUrl}
                    className="min-w-0 flex-1 truncate rounded text-card-foreground hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2"
                    title={row.name}
                  >
                    {row.name}
                  </Link>
                  <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                    {row.units} u
                  </span>
                  <span className="w-24 whitespace-nowrap text-right text-sm font-medium tabular-nums text-card-foreground">
                    {formatNio(row.revenue)}
                  </span>
                  <span
                    className="w-14 whitespace-nowrap text-right text-xs font-medium tabular-nums text-muted-foreground"
                    title={shareTitle(row)}
                  >
                    {formatShare(row.sharePercent)}
                  </span>
                </li>
              );
            })}
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

  const mainDrilldownUrl = buildDashboardDrilldownUrl(
    "/sales",
    {
      source: "dashboard",
      sourceWidget: "top-products",
      startDate: start,
      endDate: end,
    },
    { tab: "products" },
  );

  return (
    <ChartCard
      title="Top productos"
      testId="top-products-card"
      to={mainDrilldownUrl}
      linkAriaLabel="Ver reporte completo de productos más vendidos"
    >
      {body}
    </ChartCard>
  );
}
