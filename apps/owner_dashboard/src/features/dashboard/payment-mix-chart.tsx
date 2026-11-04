/**
 * PaymentMix — collected-payment composition (Dashboard V2 Batch 5b).
 *
 * Authority: PRD §17 (FR-PAY-01..04), §23, §24, §25.3.
 *
 * Consumes the Batch-1 dashboard report's `paymentMethodsBreakdown`, already
 * net of `changeGiven` server-side (AG-08 reporting net). NIO slots are NIO
 * amounts; USD slots keep the original collected currency (FR-PAY-03: raw USD
 * is never added to NIO). Percentages are computed over `totalNio`, the NIO
 * consolidation. Every row carries text amount + percent labels — color is
 * never the only signal (§25.3).
 */
import { Link } from "react-router-dom";
import { buildPaymentMixRows, formatNio, formatUsd } from "./chart-domain";
import { ChartCard, EmptyNote, WidgetError, WidgetSkeleton } from "./chart-card";
import { usePaymentMixReport } from "./use-dashboard-charts";
import { buildDashboardDrilldownUrl } from "./domain/navigation-context";

function formatRowAmount(currency: "NIO" | "USD", amount: number): string {
  return currency === "USD" ? formatUsd(amount) : formatNio(amount);
}

export function PaymentMixChart({ start, end }: { start: string; end: string }) {
  const query = usePaymentMixReport(start, end);

  let body;
  if (query.isPending) {
    body = <WidgetSkeleton testId="payment-mix-skeleton" />;
  } else if (query.isError || !query.data) {
    body = (
      <WidgetError
        testId="payment-mix-error"
        message="No se pudo cargar el mix de pagos. El resto del dashboard sigue disponible."
      />
    );
  } else {
    const { rows, totalNio } = buildPaymentMixRows(query.data.paymentMethodsBreakdown);
    if (rows.length === 0 || totalNio <= 0) {
      // CLOSE-03: distinguish "no payment data" (breakdown is null — the backend
      // returned no payment information at all) from "no payment activity"
      // (breakdown exists but every slot is zero — the tenant has payments
      // configured but none in this period).  The copy must name the real state
      // so the owner knows whether to investigate configuration vs. period scope.
      const hasPaymentData = query.data.paymentMethodsBreakdown != null;
      body = (
        <EmptyNote testId="payment-mix-empty">
          {hasPaymentData
            ? "sin actividad de pagos en este periodo"
            : "sin datos de pagos registrados"}
        </EmptyNote>
      );
    } else {
      const maxAmount = Math.max(...rows.map((r) => (r.currency === "NIO" ? r.amount : 0)), 0);
      const cashUsdAmount = Number(query.data.paymentMethodsBreakdown?.cashUsd ?? 0);
      body = (
        <>
          <p className="mb-2 text-xs text-muted-foreground" data-testid="payment-mix-currency-note">
            Montos netos de cambio entregado, en moneda original; consolidación en córdobas (C$).
          </p>
          {cashUsdAmount > 0 && (
            <div
              data-testid="usd-cash-monitoring-card"
              className="mb-3 rounded-md border border-emerald-200/70 bg-emerald-50/60 p-2.5 dark:border-emerald-800/50 dark:bg-emerald-950/30"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="flex h-2 w-2 rounded-full bg-emerald-600 shrink-0" aria-hidden="true" />
                  <span className="truncate text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                    Dólares físicos en caja (Arqueo)
                  </span>
                </div>
                <span
                  data-testid="usd-cash-amount"
                  className="shrink-0 text-sm font-bold tabular-nums text-emerald-800 dark:text-emerald-300"
                >
                  {formatUsd(cashUsdAmount)}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-300/80">
                Efectivo captado en USD para arqueo diario y control de tasa de cambio.
              </p>
            </div>
          )}
          <ul className="space-y-2" data-testid="payment-mix-rows">
            {rows.map((row) => {
              const paymentDrilldownUrl = buildDashboardDrilldownUrl(
                "/sales",
                {
                  source: "dashboard",
                  sourceWidget: "payment-mix",
                  startDate: start,
                  endDate: end,
                  entityType: "payment",
                },
                { tab: "summary", paymentMethod: row.key },
              );
              const isUsdCash = row.key === "cashUsd";
              return (
                <li key={row.key} className="text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Link
                        to={paymentDrilldownUrl}
                        className="truncate rounded text-card-foreground hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2"
                        title={`Ver pagos con ${row.label}`}
                      >
                        {row.label}
                      </Link>
                      {isUsdCash && (
                        <span
                          data-testid="usd-cash-badge"
                          className="shrink-0 rounded bg-emerald-100 dark:bg-emerald-900/60 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:text-emerald-200"
                        >
                          Arqueo
                        </span>
                      )}
                    </div>
                    <span className="whitespace-nowrap text-right text-sm font-medium tabular-nums text-card-foreground">
                      {formatRowAmount(row.currency, row.amount)}
                      {row.percent !== null && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {row.percent.toFixed(1)}%
                        </span>
                      )}
                    </span>
                  </div>
                  {row.currency === "NIO" && maxAmount > 0 && (
                    <div
                      aria-hidden="true"
                      className="mt-1 h-1.5 rounded-full bg-primary-50 dark:bg-muted"
                      style={{ width: `${(row.amount / maxAmount) * 100}%` }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-3 border-t border-border pt-2 text-sm font-semibold">
            <div className="flex items-center justify-between">
              <span className="text-foreground">Total NIO</span>
              <span className="tabular-nums text-foreground">{formatNio(totalNio)}</span>
            </div>
          </div>
        </>
      );
    }
  }

  const mainDrilldownUrl = buildDashboardDrilldownUrl(
    "/sales",
    {
      source: "dashboard",
      sourceWidget: "payment-mix",
      startDate: start,
      endDate: end,
    },
    { tab: "summary" },
  );

  return (
    <ChartCard
      title="Mix de pagos"
      testId="payment-mix-card"
      to={mainDrilldownUrl}
      linkAriaLabel="Ver resumen de métodos de pago"
    >
      {body}
    </ChartCard>
  );
}
