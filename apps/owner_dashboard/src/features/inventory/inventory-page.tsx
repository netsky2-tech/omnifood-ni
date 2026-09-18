import { useState } from "react";
import { formatLocalDate } from "@/lib/utils";
import { FreshnessBadge } from "@/components/freshness-badge";
import { DateRangePicker, type DateRangeValue } from "@/components/date-range-picker";
import { StatCard } from "@/components/ui/stat-card";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import {
  useValuation,
  useCogs,
  useKardex,
  useAlerts,
} from "./use-inventory-reports";
import type { MovementType, AlertSeverity, KardexFilters } from "./types";

type TabId = "valuation" | "cogs" | "kardex" | "alerts";

const TABS: { id: TabId; label: string }[] = [
  { id: "valuation", label: "Valoración" },
  { id: "cogs", label: "COGS / Margen" },
  { id: "kardex", label: "Kardex" },
  { id: "alerts", label: "Alertas" },
];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency: "NIO",
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("es-NI").format(n);
}

const MOVEMENT_LABELS: Record<MovementType, string> = {
  SALE: "Venta",
  SALE_CANCEL: "Anulación Venta",
  PURCHASE: "Compra",
  ENTRADA_COMPRA: "Entrada Compra",
  SHRINKAGE: "Mermas",
  PRODUCTION: "Producción",
  CREDIT_NOTE_RESTOCK: "Nota Crédito",
  ADJUSTMENT: "Ajuste",
  REVERSAL: "Reversión",
};

const SEVERITY_STYLES: Record<AlertSeverity, string> = {
  CRITICAL: "bg-red-100 text-red-800",
  WARNING: "bg-yellow-100 text-yellow-800",
  NEGATIVE_STOCK: "bg-red-200 text-red-900",
};

function ValuationTab() {
  const { data, isLoading } = useValuation();

  if (isLoading) return <LoadingState message="Cargando valoración de inventario..." />;
  if (!data) return <EmptyState message="Sin datos de valoración" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Valoración Total" value={formatCurrency(data.totalValuationNio)} />
        <StatCard label="Total Ítems" value={formatNumber(data.totalItemsCount)} />
        <StatCard label="Con Stock" value={formatNumber(data.itemsWithStockCount)} />
        <StatCard label="Stock Bajo" value={String(data.itemsLowStockCount)} accent={data.itemsLowStockCount > 0} />
      </div>

      {data.itemsNegativeStockCount > 0 && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-800">
            {data.itemsNegativeStockCount} ítem(s) con stock negativo
          </p>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/60">
                <th className="px-4 py-3 text-left font-semibold uppercase text-xs text-muted-foreground">
                  Ítem
                </th>
                <th className="px-4 py-3 text-left font-semibold uppercase text-xs text-muted-foreground">
                  UoM
                </th>
                <th className="px-4 py-3 text-right font-semibold uppercase text-xs text-muted-foreground">
                  Stock
                </th>
                <th className="px-4 py-3 text-right font-semibold uppercase text-xs text-muted-foreground">
                  Costo Prom.
                </th>
                <th className="px-4 py-3 text-right font-semibold uppercase text-xs text-muted-foreground">
                  Valoración
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr
                  key={item.id}
                  className={`border-b border-border last:border-0 hover:bg-muted/40 transition-colors ${
                    item.isNegativeStock ? "bg-red-50/70" : item.isLowStock ? "bg-amber-50/50" : ""
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-foreground">{item.name}</td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{item.consumptionUom}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span className={item.isNegativeStock ? "font-bold text-red-600" : "text-foreground"}>
                      {formatNumber(item.stock)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {formatCurrency(item.averageCostNio)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-foreground">
                    {formatCurrency(item.totalValuationNio)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <FreshnessBadge generatedAt={data.generatedAt} />
    </div>
  );
}

function CogsTab({ startDate, endDate }: { startDate?: string; endDate?: string }) {
  const { data, isLoading } = useCogs(startDate, endDate);

  if (isLoading) return <LoadingState message="Cargando costos de mercancía (COGS)..." />;
  if (!data) return <EmptyState message="Sin datos de COGS" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="COGS Total" value={formatCurrency(data.totalCogsNio)} />
        <StatCard label="COGS Ventas" value={formatCurrency(data.salesCogsNio)} />
        <StatCard label="COGS Mermas" value={formatCurrency(data.shrinkageCogsNio)} accent={data.shrinkageCogsNio > 0} />
      </div>

      <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/60">
                <th className="px-4 py-3 text-left font-semibold uppercase text-xs text-muted-foreground">
                  Insumo
                </th>
                <th className="px-4 py-3 text-right font-semibold uppercase text-xs text-muted-foreground">
                  UoM
                </th>
                <th className="px-4 py-3 text-right font-semibold uppercase text-xs text-muted-foreground">
                  Cant. Ventas
                </th>
                <th className="px-4 py-3 text-right font-semibold uppercase text-xs text-muted-foreground">
                  Costo Ventas
                </th>
                <th className="px-4 py-3 text-right font-semibold uppercase text-xs text-muted-foreground">
                  Cant. Mermas
                </th>
                <th className="px-4 py-3 text-right font-semibold uppercase text-xs text-muted-foreground">
                  Costo Total
                </th>
                <th className="px-4 py-3 text-right font-semibold uppercase text-xs text-muted-foreground">
                  %
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.insumoId} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{item.insumoName}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground font-mono text-xs">{item.consumptionUom}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{formatNumber(item.salesQuantity)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{formatCurrency(item.salesCostNio)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{formatNumber(item.shrinkageQuantity)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-foreground">
                    {formatCurrency(item.totalCostNio)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{item.costPercentage.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <FreshnessBadge generatedAt={data.generatedAt} />
    </div>
  );
}

function KardexTab({ startDate, endDate }: { startDate?: string; endDate?: string }) {
  const [filters, setFilters] = useState<KardexFilters>({});
  const activeFilters: KardexFilters = {
    ...filters,
    from: startDate,
    to: endDate,
  };
  const { data, isLoading } = useKardex(activeFilters);

  const handleTypeFilter = (type: MovementType | "") => {
    setFilters((prev) => ({ ...prev, type: type || undefined }));
  };

  if (isLoading) return <LoadingState message="Cargando movimientos de kardex..." />;
  if (!data) return <EmptyState message="Sin datos de kardex" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={() => handleTypeFilter("")}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
            !filters.type
              ? "bg-primary text-primary-foreground shadow-xs"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          Todos
        </button>
        {(Object.keys(MOVEMENT_LABELS) as MovementType[]).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => handleTypeFilter(type)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              filters.type === type
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {MOVEMENT_LABELS[type]}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <p className="text-xs sm:text-sm font-medium text-muted-foreground">
            {data.totalCount} movimiento(s)
          </p>
        </div>
        <div className="overflow-x-auto w-full">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/60">
                <th className="px-4 py-3 text-left font-semibold uppercase text-xs text-muted-foreground">
                  Fecha
                </th>
                <th className="px-4 py-3 text-left font-semibold uppercase text-xs text-muted-foreground">
                  Ítem
                </th>
                <th className="px-4 py-3 text-left font-semibold uppercase text-xs text-muted-foreground">
                  Tipo
                </th>
                <th className="px-4 py-3 text-right font-semibold uppercase text-xs text-muted-foreground">
                  Cant.
                </th>
                <th className="px-4 py-3 text-right font-semibold uppercase text-xs text-muted-foreground">
                  Antes
                </th>
                <th className="px-4 py-3 text-right font-semibold uppercase text-xs text-muted-foreground">
                  Después
                </th>
                <th className="px-4 py-3 text-right font-semibold uppercase text-xs text-muted-foreground">
                  Costo Unit.
                </th>
              </tr>
            </thead>
            <tbody>
              {data.movements.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                    {new Date(m.createdAt).toLocaleDateString("es-NI")}
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">{m.insumoName}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                      {MOVEMENT_LABELS[m.type]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{formatNumber(m.quantity)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{formatNumber(m.stockBefore)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">{formatNumber(m.stockAfter)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {m.unitCostNio != null ? formatCurrency(m.unitCostNio) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <FreshnessBadge generatedAt={data.generatedAt} />
    </div>
  );
}

function AlertsTab() {
  const { data, isLoading } = useAlerts();

  if (isLoading) return <LoadingState message="Cargando alertas de inventario..." />;
  if (!data) return <EmptyState message="Sin datos de alertas" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Alertas" value={String(data.totalAlertsCount)} />
        <StatCard label="Críticas" value={String(data.criticalCount)} accent={data.criticalCount > 0} />
        <StatCard label="Advertencias" value={String(data.warningCount)} />
        <StatCard label="Stock Negativo" value={String(data.negativeCount)} accent={data.negativeCount > 0} />
      </div>

      {data.alerts.length === 0 ? (
        <EmptyState message="No hay alertas activas en este momento" />
      ) : (
        <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60">
                  <th className="px-4 py-3 text-left font-semibold uppercase text-xs text-muted-foreground">
                    Insumo
                  </th>
                  <th className="px-4 py-3 text-right font-semibold uppercase text-xs text-muted-foreground">
                    Stock
                  </th>
                  <th className="px-4 py-3 text-right font-semibold uppercase text-xs text-muted-foreground">
                    Mínimo
                  </th>
                  <th className="px-4 py-3 text-center font-semibold uppercase text-xs text-muted-foreground">
                    Severidad
                  </th>
                  <th className="px-4 py-3 text-left font-semibold uppercase text-xs text-muted-foreground">
                    Mensaje
                  </th>
                  <th className="px-4 py-3 text-right font-semibold uppercase text-xs text-muted-foreground">
                    Reorden Sugerida
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.alerts.map((alert) => (
                  <tr key={alert.insumoId} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{alert.insumoName}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className={alert.severity === "NEGATIVE_STOCK" ? "font-bold text-red-600" : "text-foreground"}>
                        {formatNumber(alert.stock)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      {alert.minStock != null ? formatNumber(alert.minStock) : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${SEVERITY_STYLES[alert.severity]}`}>
                        {alert.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{alert.message}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-foreground">
                      {formatNumber(alert.suggestedReorderQuantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <FreshnessBadge generatedAt={data.generatedAt} />
    </div>
  );
}

export function InventoryPage() {
  const [activeTab, setActiveTab] = useState<TabId>("valuation");
  const [range, setRange] = useState<DateRangeValue>(() => {
    const iso = formatLocalDate(new Date());
    return { startDate: iso, endDate: iso };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Inventario</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Valoración de existencias, kardex de movimientos y alertas de stock
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DateRangePicker value={range} onChange={setRange} />
        </div>
      </div>

      <div className="border-b border-border">
        <nav className="-mb-px flex gap-4 sm:gap-6 overflow-x-auto pb-1 sm:pb-0" aria-label="Secciones de inventario">
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
        {activeTab === "valuation" && <ValuationTab />}
        {activeTab === "cogs" && (
          <CogsTab startDate={range.startDate} endDate={range.endDate} />
        )}
        {activeTab === "kardex" && (
          <KardexTab startDate={range.startDate} endDate={range.endDate} />
        )}
        {activeTab === "alerts" && <AlertsTab />}
      </div>
    </div>
  );
}
