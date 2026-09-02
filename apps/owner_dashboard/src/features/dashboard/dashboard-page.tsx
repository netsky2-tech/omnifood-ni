import { useState } from "react";
import { KpiCard } from "@/components/kpi-card";
import { FreshnessBadge } from "@/components/freshness-badge";
import { DateRangePicker, type DateRangeValue } from "@/components/date-range-picker";
import { useSalesDashboard } from "@/features/sales/use-sales-reports";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency: "NIO",
    minimumFractionDigits: 2,
  }).format(amount);
}

function todayRange(): DateRangeValue {
  const d = new Date();
  const iso = d.toISOString().slice(0, 10);
  return { startDate: iso, endDate: iso };
}

export function DashboardPage() {
  const [range, setRange] = useState<DateRangeValue>(todayRange);
  const { data, isLoading, error } = useSalesDashboard(range.startDate, range.endDate);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center">
        <p className="text-sm text-destructive">
          Error al cargar el dashboard. Verifique su conexión.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <div className="flex items-center gap-3">
          {data && <FreshnessBadge generatedAt={data.generatedAt} />}
          <DateRangePicker value={range} onChange={setRange} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Ventas Brutas"
          value={formatCurrency(data?.grossSales ?? 0)}
          subtitle={`${data?.invoiceCount ?? 0} facturas`}
        />
        <KpiCard
          label="Ticket Promedio"
          value={formatCurrency(data?.ticketAverage ?? 0)}
        />
        <KpiCard
          label="Impuestos (IVA)"
          value={formatCurrency(data?.totalTax ?? 0)}
        />
        <KpiCard
          label="Descuentos"
          value={formatCurrency(data?.totalDiscounts ?? 0)}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-card-foreground">
            Métodos de Pago
          </h2>
          <div className="space-y-3">
            {[
              { label: "Efectivo NIO", value: data?.paymentMethodsBreakdown.cashNio ?? 0 },
              { label: "Efectivo USD", value: data?.paymentMethodsBreakdown.cashUsd ?? 0 },
              { label: "Tarjeta NIO", value: data?.paymentMethodsBreakdown.cardNio ?? 0 },
              { label: "Tarjeta USD", value: data?.paymentMethodsBreakdown.cardUsd ?? 0 },
              { label: "Otros", value: data?.paymentMethodsBreakdown.other ?? 0 },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{item.label}</span>
                <span className="font-medium tabular-nums text-card-foreground">
                  {formatCurrency(item.value)}
                </span>
              </div>
            ))}
            <div className="border-t border-border pt-3">
              <div className="flex items-center justify-between text-sm font-semibold">
                <span className="text-foreground">Total NIO</span>
                <span className="tabular-nums text-foreground">
                  {formatCurrency(data?.paymentMethodsBreakdown.totalNio ?? 0)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-card-foreground">
            Resumen de Ventas
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Ventas Netas Gravables</span>
              <span className="font-medium tabular-nums text-card-foreground">
                {formatCurrency(data?.netTaxableSales ?? 0)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Impuestos</span>
              <span className="font-medium tabular-nums text-card-foreground">
                {formatCurrency(data?.totalTax ?? 0)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Descuentos</span>
              <span className="font-medium tabular-nums text-destructive">
                -{formatCurrency(data?.totalDiscounts ?? 0)}
              </span>
            </div>
            <div className="border-t border-border pt-3">
              <div className="flex items-center justify-between text-sm font-semibold">
                <span className="text-foreground">Ventas Brutas</span>
                <span className="tabular-nums text-foreground">
                  {formatCurrency(data?.grossSales ?? 0)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {data?.startDate && data?.endDate && (
        <p className="text-xs text-muted-foreground">
          Periodo: {data.startDate} — {data.endDate}
        </p>
      )}
    </div>
  );
}
