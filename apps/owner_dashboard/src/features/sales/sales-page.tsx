import { useState } from "react";
import { useSafeSearchParams } from "@/lib/safe-search-params";
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
import { useRbac } from "@/lib/rbac";
import { CreditNotesTab } from "./credit-notes-tab";
import { ReconciliationsTab } from "./reconciliations-tab";

type TabId =
  | "summary"
  | "hourly"
  | "products"
  | "cashiers"
  | "reconciliations"
  | "credit-notes";

const BASE_TABS: { id: TabId; label: string }[] = [
  { id: "summary", label: "Resumen" },
  { id: "hourly", label: "Ventas por Hora" },
  { id: "products", label: "Top Productos" },
  { id: "cashiers", label: "Rendimiento Cajeros" },
  { id: "reconciliations", label: "Reconciliaciones" },
];

import { formatLocalDate } from "@/lib/utils";

function todayISO(): string {
  return formatLocalDate(new Date());
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency: "NIO",
    minimumFractionDigits: 2,
  }).format(amount);
}

function SummaryTab({
  startDate,
  endDate,
  highlightPaymentMethod,
}: {
  startDate?: string;
  endDate?: string;
  highlightPaymentMethod?: string;
}) {
  const { data, isLoading } = useSalesDashboard(startDate, endDate);

  if (isLoading) return <LoadingState message="Cargando resumen de ventas..." />;
  if (!data) return <EmptyState message="Sin datos de resumen" />;

  const paymentItems = [
    { key: "CASH_NIO", label: "Efectivo NIO", val: data.paymentMethodsBreakdown.cashNio },
    { key: "CASH_USD", label: "Efectivo USD", val: data.paymentMethodsBreakdown.cashUsd },
    { key: "CARD_NIO", label: "Tarjeta NIO", val: data.paymentMethodsBreakdown.cardNio },
    { key: "CARD_USD", label: "Tarjeta USD", val: data.paymentMethodsBreakdown.cardUsd },
    { key: "OTHER", label: "Otros", val: data.paymentMethodsBreakdown.other },
  ];

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
          {paymentItems.map((item) => {
            const isHighlighted =
              highlightPaymentMethod &&
              (item.key.toLowerCase().includes(highlightPaymentMethod.toLowerCase()) ||
                item.label.toLowerCase().includes(highlightPaymentMethod.toLowerCase()));
            return (
              <div
                key={item.label}
                className={`flex justify-between text-sm py-1.5 px-2 rounded-md border-b border-border/50 last:border-0 transition-colors ${
                  isHighlighted ? "bg-primary/10 border-primary font-medium" : ""
                }`}
              >
                <span className={isHighlighted ? "text-primary font-semibold" : "text-muted-foreground"}>
                  {item.label}
                  {isHighlighted && <span className="ml-2 text-xs font-normal text-primary">● Seleccionado</span>}
                </span>
                <span className="tabular-nums font-medium text-foreground">{formatCurrency(item.val)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function HourlyTab({ date }: { date?: string }) {
  const { data, isLoading } = useHourlySales(date ?? todayISO());

  if (isLoading) return <LoadingState message="Cargando ventas por hora..." />;
  if (!data || !Array.isArray(data.hourly) || data.hourly.length === 0)
    return <EmptyState message="Sin datos horarios" />;

  const maxSales = Math.max(...data.hourly.map((h) => Number(h.totalSales) || 0), 1);

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
                role="img"
                aria-label={`${bucket.hour}:00 — ${formatCurrency(bucket.totalSales)}`}
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

function ProductsTab({
  startDate,
  endDate,
  initialProductFilter,
}: {
  startDate?: string;
  endDate?: string;
  initialProductFilter?: string;
}) {
  const [productFilter, setProductFilter] = useState<string | undefined>(initialProductFilter);
  const { data, isLoading } = useTopProducts(startDate, endDate);

  if (isLoading) return <LoadingState message="Cargando productos más vendidos..." />;
  if (!data || data.products.length === 0)
    return <EmptyState message="Sin datos de productos" />;

  const displayedProducts = productFilter
    ? data.products.filter(
        (p) =>
          p.productId.toLowerCase() === productFilter.toLowerCase() ||
          p.productName.toLowerCase().includes(productFilter.toLowerCase()),
      )
    : data.products;

  return (
    <div className="space-y-4">
      {productFilter && (
        <div className="flex items-center justify-between rounded-md border border-border bg-muted/50 px-3 py-2 text-xs">
          <span>
            Mostrando producto: <strong className="font-semibold">{productFilter}</strong> ({displayedProducts.length})
          </span>
          <button
            type="button"
            onClick={() => setProductFilter(undefined)}
            className="rounded font-medium text-primary hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2"
          >
            Mostrar todos ({data.products.length})
          </button>
        </div>
      )}

      {displayedProducts.length === 0 ? (
        <EmptyState message={`No se encontró el producto ${productFilter}`} />
      ) : (
        <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-sm min-w-[420px]">
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
                {displayedProducts.map((p, i) => (
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
      )}
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
        <table className="w-full text-sm min-w-[540px]">
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
  // D-14/#553: the credit-note tab is permission-gated (backend
  // SALES_ISSUE_CREDIT_NOTE, mirrored in rbac.ts as creditNotes.issue).
  const { canPerformAction } = useRbac();
  const canIssueCreditNote = canPerformAction("creditNotes.issue");
  const TABS: { id: TabId; label: string }[] = [
    ...BASE_TABS,
    ...(canIssueCreditNote
      ? [{ id: "credit-notes" as TabId, label: "Notas de Crédito" }]
      : []),
  ];

  const [searchParams, setSearchParams] = useSafeSearchParams();
  const tabParam = searchParams.get("tab") as TabId | null;
  const initialTab: TabId =
    tabParam && TABS.some((t) => t.id === tabParam) ? tabParam : "summary";
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  const startParam = searchParams.get("startDate");
  const endParam = searchParams.get("endDate");
  const [range, setRange] = useState<DateRangeValue>(() => {
    const iso = formatLocalDate(new Date());
    return {
      startDate: startParam || iso,
      endDate: endParam || iso,
    };
  });

  const productFilter =
    searchParams.get("product") || searchParams.get("productId") || undefined;
  const paymentMethodFilter = searchParams.get("paymentMethod") || undefined;
  const reconciliationStatusFilter =
    searchParams.get("reconciliationStatus") || undefined;

  const handleTabChange = (tabId: TabId) => {
    setActiveTab(tabId);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", tabId);
        return next;
      },
      { replace: true },
    );
  };

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
              onClick={() => handleTabChange(tab.id)}
              className={`rounded border-b-2 px-1 py-3 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2 ${
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
          <SummaryTab
            startDate={range.startDate}
            endDate={range.endDate}
            highlightPaymentMethod={paymentMethodFilter}
          />
        )}
        {activeTab === "hourly" && <HourlyTab date={range.startDate} />}
        {activeTab === "products" && (
          <ProductsTab
            startDate={range.startDate}
            endDate={range.endDate}
            initialProductFilter={productFilter}
          />
        )}
        {activeTab === "cashiers" && (
          <CashiersTab startDate={range.startDate} endDate={range.endDate} />
        )}
        {/* Deliberately no startDate/endDate: the server filters
            reconciliations by reconciled_at, which is NULL for PENDIENTE rows
            — dates would make the pending view come back empty. */}
        {activeTab === "reconciliations" && (
          <ReconciliationsTab initialStatus={reconciliationStatusFilter} />
        )}
        {activeTab === "credit-notes" && <CreditNotesTab />}
      </div>
    </div>
  );
}
