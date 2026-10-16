import { useRef, useState, useMemo } from "react";
import { Search, X, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useSafeSearchParams } from "@/lib/safe-search-params";
import { formatLocalDate } from "@/lib/utils";
import { toFiniteNumber } from "@/lib/numeric";
import { localize, alertSeverityLabels } from "@/lib/labels";
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
import { InsumosTab } from "./insumos-tab";
import { SuppliersTab } from "./suppliers-tab";
import { PurchasesTab } from "./purchases-tab";
import type { MovementType, AlertSeverity, KardexFilters } from "./types";

type TabId =
  | "valuation"
  | "insumos"
  | "suppliers"
  | "purchases"
  | "cogs"
  | "kardex"
  | "alerts";

const TABS: { id: TabId; label: string }[] = [
  { id: "valuation", label: "Valoración" },
  { id: "insumos", label: "Insumos" },
  { id: "purchases", label: "Compras" },
  { id: "suppliers", label: "Proveedores" },
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
  VALUATION_WRITEDOWN: "Castigo por valuación",
  INITIAL_STOCK: "Stock inicial",
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
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{toFiniteNumber(item.costPercentage).toFixed(1)}%</td>
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

type KardexSortKey = "date" | "item" | "type" | "qty" | "cost";

const KARDEX_SORT_COLUMNS: { key: KardexSortKey; label: string; align?: "right" }[] = [
  { key: "date", label: "Fecha" },
  { key: "item", label: "Ítem" },
  { key: "type", label: "Tipo" },
  { key: "qty", label: "Cant.", align: "right" },
  { key: "cost", label: "Costo Unit.", align: "right" },
];

function KardexTab({ startDate, endDate }: { startDate?: string; endDate?: string }) {
  const [filters, setFilters] = useState<KardexFilters>({});
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<KardexSortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const activeFilters: KardexFilters = {
    ...filters,
    from: startDate,
    to: endDate,
    limit: 1000,
  };
  const { data, isLoading } = useKardex(activeFilters);

  const handleTypeFilter = (type: MovementType | "") => {
    setFilters((prev) => ({ ...prev, type: type || undefined }));
    setCurrentPage(1);
  };

  const term = search.trim().toLowerCase();

  const filteredMovements = useMemo(() => {
    if (!data?.movements) return [];
    let items = data.movements;

    if (term) {
      items = items.filter((m) => {
        const name = (m.insumoName || "").toLowerCase();
        const reason = (m.reason || "").toLowerCase();
        const typeLabel = (MOVEMENT_LABELS[m.type] || "").toLowerCase();
        return name.includes(term) || reason.includes(term) || typeLabel.includes(term);
      });
    }

    const direction = sortDir === "asc" ? 1 : -1;
    return [...items].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "date":
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case "item":
          cmp = (a.insumoName || "").localeCompare(b.insumoName || "");
          break;
        case "type":
          cmp = (MOVEMENT_LABELS[a.type] || "").localeCompare(MOVEMENT_LABELS[b.type] || "");
          break;
        case "qty":
          cmp = (a.quantity || 0) - (b.quantity || 0);
          break;
        case "cost":
          cmp = (a.unitCostNio || 0) - (b.unitCostNio || 0);
          break;
      }
      return cmp * direction;
    });
  }, [data?.movements, term, sortKey, sortDir]);

  const totalFiltered = filteredMovements.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const pagedMovements = filteredMovements.slice(startIndex, startIndex + pageSize);

  const toggleSort = (key: KardexSortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "date" ? "desc" : "asc");
    }
    setCurrentPage(1);
  };

  if (isLoading) return <LoadingState message="Cargando movimientos de kardex..." />;
  if (!data) return <EmptyState message="Sin datos de kardex" />;

  return (
    <div className="space-y-4">
      {/* Type filter chips */}
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={() => handleTypeFilter("")}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2 ${
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
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2 ${
              filters.type === type
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {MOVEMENT_LABELS[type]}
          </button>
        ))}
      </div>

      {/* Multiclass search field (§13) */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative max-w-md w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Label htmlFor="kardex-search-input" className="sr-only">
            Buscar por insumo o motivo
          </Label>
          <Input
            id="kardex-search-input"
            data-testid="kardex-search-input"
            placeholder="Buscar por insumo o motivo..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-9 pr-8 text-sm"
          />
          {search && (
            <button
              type="button"
              data-testid="kardex-search-clear"
              aria-label="Limpiar búsqueda"
              onClick={() => {
                setSearch("");
                setCurrentPage(1);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Page size selector (§15) */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Label htmlFor="kardex-page-size" className="text-xs text-muted-foreground whitespace-nowrap">
            Filas por página
          </Label>
          <select
            id="kardex-page-size"
            aria-label="Filas por página"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 cursor-pointer"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </div>
      </div>

      {/* Main data table or Empty State */}
      {totalFiltered === 0 && term ? (
        <EmptyState
          title={`No se encontraron movimientos para “${search}”`}
          description="Pruebe con otro nombre de insumo o motivo."
          icon={AlertTriangle}
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSearch("");
                setCurrentPage(1);
              }}
            >
              Limpiar búsqueda
            </Button>
          }
        />
      ) : totalFiltered === 0 ? (
        <EmptyState
          title="Sin movimientos registrados"
          description="No hay registros de kardex para el rango y filtros seleccionados."
        />
      ) : (
        <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
            <p className="text-xs sm:text-sm font-medium text-muted-foreground">
              Mostrando {startIndex + 1}–{startIndex + pagedMovements.length} de {totalFiltered} movimientos
            </p>
          </div>
          <div className="overflow-x-auto w-full">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60">
                  {KARDEX_SORT_COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className={`px-4 py-3 uppercase text-xs text-muted-foreground font-semibold ${
                        col.align === "right" ? "text-right" : "text-left"
                      }`}
                      aria-sort={
                        sortKey === col.key
                          ? sortDir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className={`inline-flex items-center gap-1 font-semibold hover:text-foreground cursor-pointer ${
                          sortKey === col.key ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {col.label}
                        {sortKey === col.key && (
                          <span aria-hidden="true">
                            {sortDir === "asc" ? "↑" : "↓"}
                          </span>
                        )}
                      </button>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right font-semibold uppercase text-xs text-muted-foreground">
                    Antes
                  </th>
                  <th className="px-4 py-3 text-right font-semibold uppercase text-xs text-muted-foreground">
                    Después
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagedMovements.map((m) => {
                  const isValuation = m.type === "VALUATION_WRITEDOWN";
                  return (
                    <tr
                      key={m.id}
                      className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors"
                    >
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                        {new Date(m.createdAt).toLocaleDateString("es-NI")}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        <div>
                          <span>{m.insumoName}</span>
                          {m.reason && (
                            <span className="block text-xs text-muted-foreground font-normal">
                              {m.reason}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            isValuation
                              ? "bg-warning-50 text-warning-700 border border-warning/30"
                              : "bg-muted text-foreground"
                          }`}
                        >
                          {MOVEMENT_LABELS[m.type] || m.type}
                        </span>
                      </td>
                      <td
                        className={`px-4 py-3 text-right tabular-nums font-medium ${
                          m.quantity < 0
                            ? "text-destructive-700"
                            : m.quantity === 0
                            ? "text-muted-foreground"
                            : "text-foreground"
                        }`}
                      >
                        {formatNumber(m.quantity)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">
                        {m.unitCostNio != null ? formatCurrency(m.unitCostNio) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {formatNumber(m.stockBefore)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">
                        {formatNumber(m.stockAfter)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination controls (§15) */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-card">
              <span className="text-xs text-muted-foreground">
                Página {safePage} de {totalPages}
              </span>
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <FreshnessBadge generatedAt={data.generatedAt} />
    </div>
  );
}
function AlertsTab({ initialSeverity }: { initialSeverity?: string }) {
  const [selectedSeverity, setSelectedSeverity] = useState<string | undefined>(initialSeverity);
  const { data, isLoading } = useAlerts();

  if (isLoading) return <LoadingState message="Cargando alertas de inventario..." />;
  if (!data) return <EmptyState message="Sin datos de alertas" />;

  const displayedAlerts = selectedSeverity
    ? data.alerts.filter((a) => a.severity.toUpperCase() === selectedSeverity.toUpperCase())
    : data.alerts;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Alertas" value={String(data.totalAlertsCount)} />
        <StatCard label="Críticas" value={String(data.criticalCount)} accent={data.criticalCount > 0} />
        <StatCard label="Advertencias" value={String(data.warningCount)} />
        <StatCard label="Stock Negativo" value={String(data.negativeCount)} accent={data.negativeCount > 0} />
      </div>

      {selectedSeverity && (
        <div className="flex items-center justify-between rounded-md border border-border bg-muted/50 px-3 py-2 text-xs">
          <span>
            Mostrando alertas con severidad: <strong className="font-semibold">{selectedSeverity}</strong> ({displayedAlerts.length})
          </span>
          <button
            type="button"
            onClick={() => setSelectedSeverity(undefined)}
            className="rounded font-medium text-primary hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2"
          >
            Mostrar todas ({data.alerts.length})
          </button>
        </div>
      )}

      {displayedAlerts.length === 0 ? (
        <EmptyState message={selectedSeverity ? `No hay alertas con severidad ${selectedSeverity}` : "No hay alertas activas en este momento"} />
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
                {displayedAlerts.map((alert) => (
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
                        {localize(alert.severity, alertSeverityLabels)}
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
  const [searchParams, setSearchParams] = useSafeSearchParams();
  const tabParam = searchParams.get("tab") as TabId | null;
  const initialTab: TabId =
    tabParam && ["valuation", "insumos", "purchases", "cogs", "kardex", "alerts"].includes(tabParam)
      ? tabParam
      : "valuation";
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

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const severityFilter =
    searchParams.get("status") || searchParams.get("severity") || undefined;

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

  // Range edits ride the URL (§9.4): refresh and copied support links keep
  // the financial scope of the purchases/COGS/kardex tabs.
  const handleRangeChange = (nextRange: DateRangeValue) => {
    setRange(nextRange);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("startDate", nextRange.startDate);
        next.set("endDate", nextRange.endDate);
        return next;
      },
      { replace: true },
    );
  };

  // Roving-tabindex arrow-key traversal (§46), matching Settings parity.
  const handleTabKeyDown = (event: React.KeyboardEvent, index: number) => {
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    const target = next !== null ? TABS[next] : undefined;
    if (target) {
      event.preventDefault();
      handleTabChange(target.id);
      tabRefs.current[TABS.indexOf(target)]?.focus();
    }
  };

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
          <DateRangePicker value={range} onChange={handleRangeChange} />
        </div>
      </div>

      <div className="border-b border-border">
        <nav
          className="-mb-px flex gap-4 sm:gap-6 overflow-x-auto pb-1 sm:pb-0"
          aria-label="Secciones de inventario"
          role="tablist"
        >
          {TABS.map((tab, index) => (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              id={`tab-${tab.id}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              tabIndex={activeTab === tab.id ? 0 : -1}
              data-testid={`inventory-tab-${tab.id}`}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              onKeyDown={(e) => handleTabKeyDown(e, index)}
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

      <div
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        tabIndex={0}
      >
        {activeTab === "valuation" && <ValuationTab />}
        {activeTab === "insumos" && <InsumosTab />}
        {activeTab === "suppliers" && <SuppliersTab />}
        {activeTab === "purchases" && (
          <PurchasesTab startDate={range.startDate} endDate={range.endDate} />
        )}
        {activeTab === "cogs" && (
          <CogsTab startDate={range.startDate} endDate={range.endDate} />
        )}
        {activeTab === "kardex" && (
          <KardexTab startDate={range.startDate} endDate={range.endDate} />
        )}
        {activeTab === "alerts" && <AlertsTab initialSeverity={severityFilter} />}
      </div>
    </div>
  );
}
