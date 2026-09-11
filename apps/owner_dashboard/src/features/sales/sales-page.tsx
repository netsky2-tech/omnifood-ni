import { useState } from "react";
import { FreshnessBadge } from "@/components/freshness-badge";
import { DateRangePicker, type DateRangeValue } from "@/components/date-range-picker";
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

  if (isLoading) return <LoadingState />;
  if (!data) return <EmptyState message="Sin datos de resumen" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Ventas Brutas" value={formatCurrency(data.grossSales)} />
        <StatCard label="Facturas" value={String(data.invoiceCount)} />
        <StatCard label="Ticket Promedio" value={formatCurrency(data.ticketAverage)} />
      </div>
      <div className="rounded-lg border border-border bg-card p-6">
        <h3 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
          Desglose por Método de Pago
        </h3>
        <div className="space-y-2">
          {[
            { label: "Efectivo NIO", val: data.paymentMethodsBreakdown.cashNio },
            { label: "Efectivo USD", val: data.paymentMethodsBreakdown.cashUsd },
            { label: "Tarjeta NIO", val: data.paymentMethodsBreakdown.cardNio },
            { label: "Tarjeta USD", val: data.paymentMethodsBreakdown.cardUsd },
            { label: "Otros", val: data.paymentMethodsBreakdown.other },
          ].map((item) => (
            <div key={item.label} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{item.label}</span>
              <span className="tabular-nums">{formatCurrency(item.val)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HourlyTab({ date }: { date?: string }) {
  const { data, isLoading } = useHourlySales(date ?? todayISO());

  if (isLoading) return <LoadingState />;
  if (!data) return <EmptyState message="Sin datos horarios" />;

  const maxSales = Math.max(...data.hourly.map((h) => h.totalSales), 1);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-muted-foreground">Total Ventas</p>
          <p className="text-xl font-bold tabular-nums">{formatCurrency(data.totalSales)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-muted-foreground">Total Facturas</p>
          <p className="text-xl font-bold tabular-nums">{data.totalInvoices}</p>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-card p-6">
        <h3 className="mb-4 text-sm font-semibold uppercase text-muted-foreground">
          Ventas por Hora
        </h3>
        <div className="flex items-end gap-1" style={{ height: 160 }}>
          {data.hourly.map((bucket) => (
            <div
              key={bucket.hour}
              className="flex flex-1 flex-col items-center gap-1"
              title={`${bucket.hour}:00 — ${formatCurrency(bucket.totalSales)}`}
            >
              <div
                className="w-full rounded-t bg-primary"
                style={{
                  height: `${(bucket.totalSales / maxSales) * 120}px`,
                  minHeight: bucket.totalSales > 0 ? 4 : 0,
                }}
              />
              {bucket.hour % 3 === 0 && (
                <span className="text-[10px] text-muted-foreground">{bucket.hour}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProductsTab({ startDate, endDate }: { startDate?: string; endDate?: string }) {
  const { data, isLoading } = useTopProducts(startDate, endDate);

  if (isLoading) return <LoadingState />;
  if (!data || data.products.length === 0)
    return <EmptyState message="Sin datos de productos" />;

  return (
    <div className="rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted">
            <th className="px-4 py-3 text-left font-semibold uppercase text-muted-foreground">
              Producto
            </th>
            <th className="px-4 py-3 text-right font-semibold uppercase text-muted-foreground">
              Unidades
            </th>
            <th className="px-4 py-3 text-right font-semibold uppercase text-muted-foreground">
              Ingresos
            </th>
          </tr>
        </thead>
        <tbody>
          {data.products.map((p, i) => (
            <tr key={p.productId} className="border-b border-border last:border-0 hover:bg-muted/50">
              <td className="px-4 py-3">
                <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                {p.productName}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{p.totalQuantity}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(p.totalRevenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CashiersTab({ startDate, endDate }: { startDate?: string; endDate?: string }) {
  const { data, isLoading } = useCashierPerformance(startDate, endDate);

  if (isLoading) return <LoadingState />;
  if (!data || data.cashiers.length === 0)
    return <EmptyState message="Sin datos de cajeros" />;

  return (
    <div className="rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted">
            <th className="px-4 py-3 text-left font-semibold uppercase text-muted-foreground">
              Cajero
            </th>
            <th className="px-4 py-3 text-right font-semibold uppercase text-muted-foreground">
              Facturas
            </th>
            <th className="px-4 py-3 text-right font-semibold uppercase text-muted-foreground">
              Total Ventas
            </th>
            <th className="px-4 py-3 text-right font-semibold uppercase text-muted-foreground">
              Ticket Promedio
            </th>
          </tr>
        </thead>
        <tbody>
          {data.cashiers.map((c) => (
            <tr key={c.userId} className="border-b border-border last:border-0 hover:bg-muted/50">
              <td className="px-4 py-3 font-medium">{c.cashierName}</td>
              <td className="px-4 py-3 text-right tabular-nums">{c.invoiceCount}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(c.totalSales)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(c.ticketAverage)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-card-foreground">{value}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-8 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
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

  const generatedAt =
    activeTab === "hourly" ? undefined : undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Ventas</h1>
        <div className="flex items-center gap-3">
          <DateRangePicker value={range} onChange={setRange} />
        </div>
      </div>

      <div className="border-b border-border">
        <nav className="-mb-px flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
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
