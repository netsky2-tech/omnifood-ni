import { useState } from "react";
import { DateRangePicker, type DateRangeValue } from "@/components/date-range-picker";
import { StatCard } from "@/components/ui/stat-card";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import {
  useSalesDashboard,
  useHourlySales,
  useTopProducts,
  useCashierPerformance,
} from "./use-sales-reports";

type TabId = "summary" | "hourly" | "products" | "cashiers";

const TABS: { id: TabId; label: string }[] = [
  { id: "summary", label: "Resumen" },
  { id: "hourly", label: "Ventas por Hora" },
  { id: "products", label: "Top Productos" },
  { id: "cashiers", label: "Rendimiento Cajeros" },
];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency: "NIO",
    minimumFractionDigits: 2,
  }).format(amount);
}

function SummaryTab({ startDate, endDate }: { startDate?: string; endDate?: string }) {
  const { data, isLoading } = useSalesDashboard(startDate, endDate);

  if (isLoading) return <LoadingState message="Cargando resumen de ventas..." />;
  if (!data) return <EmptyState message="Sin datos de resumen" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        <StatCard label="Ventas Brutas" value={formatCurrency(data.grossSales)} />
        <StatCard label="Facturas" value={String(data.invoiceCount)} />
        <StatCard label="Ticket Promedio" value={formatCurrency(data.ticketAverage)} />
      </div>
      <div className="rounded-lg border border-border bg-card p-5 sm:p-6 shadow-xs">
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Desglose por Método de Pago
        </h3>
        <div className="space-y-2.5">
          {[
            { label: "Efectivo NIO", val: data.paymentMethodsBreakdown.cashNio },
            { label: "Efectivo USD", val: data.paymentMethodsBreakdown.cashUsd },
            { label: "Tarjeta NIO", val: data.paymentMethodsBreakdown.cardNio },
            { label: "Tarjeta USD", val: data.paymentMethodsBreakdown.cardUsd },
            { label: "Otros", val: data.paymentMethodsBreakdown.other },
          ].map((item) => (
            <div key={item.label} className="flex justify-between text-sm py-1 border-b border-border/50 last:border-0">
              <span className="text-muted-foreground">{item.label}</span>
              <span className="tabular-nums font-medium text-foreground">{formatCurrency(item.val)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HourlyTab({ date }: { date?: string }) {
  const { data, isLoading } = useHourlySales(date ?? todayISO());

  if (isLoading) return <LoadingState message="Cargando ventas por hora..." />;
  if (!data) return <EmptyState message="Sin datos horarios" />;

  const maxSales = Math.max(...data.hourly.map((h) => h.totalSales), 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-4 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Ventas</p>
          <p className="text-xl sm:text-2xl font-bold tabular-nums text-foreground mt-1">{formatCurrency(data.totalSales)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Facturas</p>
          <p className="text-xl sm:text-2xl font-bold tabular-nums text-foreground mt-1">{data.totalInvoices}</p>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-card p-5 sm:p-6 shadow-xs">
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Ventas por Hora (00:00 - 23:00)
        </h3>
        <div className="overflow-x-auto pb-2">
          <div className="flex items-end gap-1.5 min-w-[500px]" style={{ height: 160 }}>
            {data.hourly.map((bucket) => (
              <div
                key={bucket.hour}
                className="flex flex-1 flex-col items-center gap-1.5"
                title={`${bucket.hour}:00 — ${formatCurrency(bucket.totalSales)}`}
              >
                <div
                  className="w-full rounded-t bg-primary hover:bg-primary-600 transition-colors"
                  style={{
                    height: `${(bucket.totalSales / maxSales) * 120}px`,
                    minHeight: bucket.totalSales > 0 ? 4 : 0,
                  }}
                />
                {bucket.hour % 3 === 0 && (
                  <span className="text-[10px] text-muted-foreground tabular-nums">{bucket.hour}h</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductsTab({ startDate, endDate }: { startDate?: string; endDate?: string }) {
  const { data, isLoading } = useTopProducts(startDate, endDate);

  if (isLoading) return <LoadingState message="Cargando productos más vendidos..." />;
  if (!data || data.products.length === 0)
    return <EmptyState message="Sin datos de productos" />;

  return (
    <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
      <div className="overflow-x-auto w-full">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/60">
              <th className="px-4 py-3 text-left font-semibold uppercase text-xs text-muted-foreground">
                Producto
              </th>
              <th className="px-4 py-3 text-right font-semibold uppercase text-xs text-muted-foreground">
                Unidades
              </th>
              <th className="px-4 py-3 text-right font-semibold uppercase text-xs text-muted-foreground">
                Ingresos
              </th>
            </tr>
          </thead>
          <tbody>
            {data.products.map((p, i) => (
              <tr key={p.productId} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
                <td className="px-4 py-3 font-medium text-foreground">
                  <span className="mr-2 text-muted-foreground text-xs">{i + 1}.</span>
                  {p.productName}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">{p.totalQuantity}</td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold text-foreground">{formatCurrency(p.totalRevenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CashiersTab({ startDate, endDate }: { startDate?: string; endDate?: string }) {
  const { data, isLoading } = useCashierPerformance(startDate, endDate);

  if (isLoading) return <LoadingState message="Cargando rendimiento de cajeros..." />;
  if (!data || data.cashiers.length === 0)
    return <EmptyState message="Sin datos de cajeros" />;

  return (
    <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
      <div className="overflow-x-auto w-full">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/60">
              <th className="px-4 py-3 text-left font-semibold uppercase text-xs text-muted-foreground">
                Cajero
              </th>
              <th className="px-4 py-3 text-right font-semibold uppercase text-xs text-muted-foreground">
                Facturas
              </th>
              <th className="px-4 py-3 text-right font-semibold uppercase text-xs text-muted-foreground">
                Total Ventas
              </th>
              <th className="px-4 py-3 text-right font-semibold uppercase text-xs text-muted-foreground">
                Ticket Promedio
              </th>
            </tr>
          </thead>
          <tbody>
            {data.cashiers.map((c) => (
              <tr key={c.userId} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
                <td className="px-4 py-3 font-medium text-foreground">{c.cashierName}</td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">{c.invoiceCount}</td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold text-foreground">{formatCurrency(c.totalSales)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">{formatCurrency(c.ticketAverage)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SalesPage() {
  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const [range, setRange] = useState<DateRangeValue>(() => {
    const d = new Date();
    const iso = d.toISOString().slice(0, 10);
    return { startDate: iso, endDate: iso };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Ventas</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Reportes detallados de transacciones, horarios y rendimiento
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DateRangePicker value={range} onChange={setRange} />
        </div>
      </div>

      <div className="border-b border-border">
        <nav className="-mb-px flex gap-4 sm:gap-6 overflow-x-auto pb-1 sm:pb-0" aria-label="Secciones de ventas">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 px-1 py-3 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div>
        {activeTab === "summary" && (
          <SummaryTab startDate={range.startDate} endDate={range.endDate} />
        )}
        {activeTab === "hourly" && <HourlyTab date={range.startDate} />}
        {activeTab === "products" && (
          <ProductsTab startDate={range.startDate} endDate={range.endDate} />
        )}
        {activeTab === "cashiers" && (
          <CashiersTab startDate={range.startDate} endDate={range.endDate} />
        )}
      </div>
    </div>
  );
}
