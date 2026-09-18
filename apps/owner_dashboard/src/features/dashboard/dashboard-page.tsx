import { useState } from "react";
import { KpiCard } from "@/components/kpi-card";
import { FreshnessBadge } from "@/components/freshness-badge";
import { DateRangePicker, type DateRangeValue } from "@/components/date-range-picker";
import { useSalesDashboard } from "@/features/sales/use-sales-reports";

import { formatLocalDate } from "@/lib/utils";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency: "NIO",
    minimumFractionDigits: 2,
  }).format(amount);
}

function todayRange(): DateRangeValue {
  const iso = formatLocalDate(new Date());
  return { startDate: iso, endDate: iso };
}

export function DashboardPage() {
  const [range, setRange] = useState<DateRangeValue>(todayRange);
  const { data, isLoading, error } = useSalesDashboard(range.startDate, range.endDate);

  if (isLoading && !data) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-center">
        <p className="text-sm font-medium text-destructive">
          Error al cargar el dashboard. Verifique su conexión o vuelva a intentar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && data && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          No se pudieron actualizar los datos más recientes. Mostrando información en caché.
        </div>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Métricas clave de facturación y resumen de operaciones
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
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
