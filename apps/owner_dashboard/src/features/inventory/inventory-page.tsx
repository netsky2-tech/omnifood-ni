import { useState } from "react";
import { FreshnessBadge } from "@/components/freshness-badge";
import { DateRangePicker, type DateRangeValue } from "@/components/date-range-picker";
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
  ENTRY: "Entrada",
  EXIT: "Salida",
  ADJUSTMENT: "Ajuste",
  TRANSFER: "Transferencia",
  SHRINKAGE: "Mermas",
};

const SEVERITY_STYLES: Record<AlertSeverity, string> = {
  CRITICAL: "bg-red-100 text-red-800",
  WARNING: "bg-yellow-100 text-yellow-800",
  NEGATIVE_STOCK: "bg-red-200 text-red-900",
};

function ValuationTab() {
  const { data, isLoading } = useValuation();

  if (isLoading) return <LoadingState />;
  if (!data) return <EmptyState message="Sin datos de valoración" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
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

      <div className="rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="px-4 py-3 text-left font-semibold uppercase text-muted-foreground">
                Ítem
              </th>
              <th className="px-4 py-3 text-left font-semibold uppercase text-muted-foreground">
                UoM
              </th>
              <th className="px-4 py-3 text-right font-semibold uppercase text-muted-foreground">
                Stock
              </th>
              <th className="px-4 py-3 text-right font-semibold uppercase text-muted-foreground">
                Costo Prom.
              </th>
              <th className="px-4 py-3 text-right font-semibold uppercase text-muted-foreground">
                Valoración
              </th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr
                key={item.id}
                className={`border-b border-border last:border-0 hover:bg-muted/50 ${
                  item.isNegativeStock ? "bg-red-50" : item.isLowStock ? "bg-yellow-50" : ""
                }`}
              >
                <td className="px-4 py-3 font-medium">{item.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{item.consumptionUom}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <span className={item.isNegativeStock ? "font-bold text-red-600" : ""}>
                    {formatNumber(item.stock)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatCurrency(item.averageCostNio)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">
                  {formatCurrency(item.totalValuationNio)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <FreshnessBadge generatedAt={data.generatedAt} />
    </div>
  );
}

function CogsTab({ startDate, endDate }: { startDate?: string; endDate?: string }) {
  const { data, isLoading } = useCogs(startDate, endDate);

  if (isLoading) return <LoadingState />;
  if (!data) return <EmptyState message="Sin datos de COGS" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="COGS Total" value={formatCurrency(data.totalCogsNio)} />
        <StatCard label="COGS Ventas" value={formatCurrency(data.salesCogsNio)} />
        <StatCard label="COGS Mermas" value={formatCurrency(data.shrinkageCogsNio)} accent={data.shrinkageCogsNio > 0} />
      </div>

      <div className="rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="px-4 py-3 text-left font-semibold uppercase text-muted-foreground">
                Insumo
              </th>
              <th className="px-4 py-3 text-right font-semibold uppercase text-muted-foreground">
                UoM
              </th>
              <th className="px-4 py-3 text-right font-semibold uppercase text-muted-foreground">
                Cant. Ventas
              </th>
              <th className="px-4 py-3 text-right font-semibold uppercase text-muted-foreground">
                Costo Ventas
              </th>
              <th className="px-4 py-3 text-right font-semibold uppercase text-muted-foreground">
                Cant. Mermas
              </th>
              <th className="px-4 py-3 text-right font-semibold uppercase text-muted-foreground">
                Costo Total
              </th>
              <th className="px-4 py-3 text-right font-semibold uppercase text-muted-foreground">
                %
              </th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.insumoId} className="border-b border-border last:border-0 hover:bg-muted/50">
                <td className="px-4 py-3 font-medium">{item.insumoName}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{item.consumptionUom}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatNumber(item.salesQuantity)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(item.salesCostNio)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatNumber(item.shrinkageQuantity)}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">
                  {formatCurrency(item.totalCostNio)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{item.costPercentage.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
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

  if (isLoading) return <LoadingState />;
  if (!data) return <EmptyState message="Sin datos de kardex" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => handleTypeFilter("")}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            !filters.type
              ? "bg-primary text-primary-foreground"
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
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              filters.type === type
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {MOVEMENT_LABELS[type]}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm text-muted-foreground">
            {formatNumber(data.totalCount)} movimiento(s)
          </p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="px-4 py-3 text-left font-semibold uppercase text-muted-foreground">
                Fecha
              </th>
              <th className="px-4 py-3 text-left font-semibold uppercase text-muted-foreground">
                Ítem
              </th>
              <th className="px-4 py-3 text-left font-semibold uppercase text-muted-foreground">
                Tipo
              </th>
              <th className="px-4 py-3 text-right font-semibold uppercase text-muted-foreground">
                Cant.
              </th>
              <th className="px-4 py-3 text-right font-semibold uppercase text-muted-foreground">
                Antes
              </th>
              <th className="px-4 py-3 text-right font-semibold uppercase text-muted-foreground">
                Después
              </th>
              <th className="px-4 py-3 text-right font-semibold uppercase text-muted-foreground">
                Costo Unit.
              </th>
            </tr>
          </thead>
          <tbody>
            {data.movements.map((m) => (
              <tr key={m.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(m.createdAt).toLocaleDateString("es-NI")}
                </td>
                <td className="px-4 py-3 font-medium">{m.insumoName}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                    {MOVEMENT_LABELS[m.type]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{formatNumber(m.quantity)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatNumber(m.stockBefore)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatNumber(m.stockAfter)}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {m.unitCostNio != null ? formatCurrency(m.unitCostNio) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <FreshnessBadge generatedAt={data.generatedAt} />
    </div>
  );
}

function AlertsTab() {
  const { data, isLoading } = useAlerts();

  if (isLoading) return <LoadingState />;
  if (!data) return <EmptyState message="Sin datos de alertas" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total Alertas" value={String(data.totalAlertsCount)} />
        <StatCard label="Críticas" value={String(data.criticalCount)} accent={data.criticalCount > 0} />
        <StatCard label="Advertencias" value={String(data.warningCount)} />
        <StatCard label="Stock Negativo" value={String(data.negativeCount)} accent={data.negativeCount > 0} />
      </div>

      {data.alerts.length === 0 ? (
        <EmptyState message="No hay alertas activas" />
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="px-4 py-3 text-left font-semibold uppercase text-muted-foreground">
                  Insumo
                </th>
                <th className="px-4 py-3 text-right font-semibold uppercase text-muted-foreground">
                  Stock
                </th>
                <th className="px-4 py-3 text-right font-semibold uppercase text-muted-foreground">
                  Mínimo
                </th>
                <th className="px-4 py-3 text-center font-semibold uppercase text-muted-foreground">
                  Severidad
                </th>
                <th className="px-4 py-3 text-left font-semibold uppercase text-muted-foreground">
                  Mensaje
                </th>
                <th className="px-4 py-3 text-right font-semibold uppercase text-muted-foreground">
                  Reorden Sugerida
                </th>
              </tr>
            </thead>
            <tbody>
              {data.alerts.map((alert) => (
                <tr key={alert.insumoId} className="border-b border-border last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-3 font-medium">{alert.insumoName}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span className={alert.severity === "NEGATIVE_STOCK" ? "font-bold text-red-600" : ""}>
                      {formatNumber(alert.stock)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {alert.minStock != null ? formatNumber(alert.minStock) : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${SEVERITY_STYLES[alert.severity]}`}>
                      {alert.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{alert.message}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {formatNumber(alert.suggestedReorderQuantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <FreshnessBadge generatedAt={data.generatedAt} />
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${accent ? "text-red-600" : "text-card-foreground"}`}>
        {value}
      </p>
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

export function InventoryPage() {
  const [activeTab, setActiveTab] = useState<TabId>("valuation");
  const [range, setRange] = useState<DateRangeValue>(() => {
    const d = new Date();
    const iso = d.toISOString().slice(0, 10);
    return { startDate: iso, endDate: iso };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Inventario</h1>
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
