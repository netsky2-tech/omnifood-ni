import { useMemo, useState } from "react";
import { usePurchases } from "./use-inventory-reports";
import { PurchasesForm } from "./purchases-form";
import { useSafeSearchParams } from "@/lib/safe-search-params";
import { StatCard } from "@/components/ui/stat-card";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Search, ShoppingCart, X, Plus, AlertTriangle } from "lucide-react";

/** Newest-row cap requested from the backend (server accepts up to 500). */
const TRUNCATION_LIMIT = 200;

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency: "NIO",
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("es-NI", {
    maximumFractionDigits: 4,
  }).format(n);
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("es-NI", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

interface PurchasesTabProps {
  startDate?: string;
  endDate?: string;
}

/**
 * Purchase history + manual web entry for the office (SOHO purchases).
 *
 * The owner registers received/known purchases from the web (founder
 * decision 2026-09-30 — NO purchase-order lifecycle); physical receiving
 * stays on the POS (device transport writes via `POST /inventory/purchases`).
 * This tab gives visibility: history, supplier, unit cost, CPP projection,
 * filters — plus the manual "Registrar compra" flow.
 */
export function PurchasesTab({ startDate, endDate }: PurchasesTabProps) {
  const [searchParams, setSearchParams] = useSafeSearchParams();
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState(
    () => searchParams.get("q_compras") ?? "",
  );
  const filters = useMemo(
    () => ({
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      limit: TRUNCATION_LIMIT,
    }),
    [startDate, endDate],
  );
  const { data, isLoading, error, refetch } = usePurchases(filters);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value.trim()) {
          next.set("q_compras", value);
        } else {
          next.delete("q_compras");
        }
        return next;
      },
      { replace: true },
    );
  };

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!search.trim()) return data;
    const term = search.toLowerCase();
    return data.filter(
      (doc) =>
        doc.invoice_number?.toLowerCase().includes(term) ||
        doc.insumo?.name?.toLowerCase().includes(term) ||
        doc.supplier?.name?.toLowerCase().includes(term),
    );
  }, [data, search]);

  const totals = useMemo(() => {
    const docs = filtered ?? [];
    const totalNio = docs.reduce((sum, d) => {
      const qty = Number(d.quantity) || 0;
      const unitNio = Number(d.unit_cost_nio) || 0;
      return sum + qty * unitNio;
    }, 0);
    // Each response row is a purchase LINE (one invoice buying N insumos
    // yields N rows); count distinct invoice numbers so the stat is true.
    const distinctInvoices = new Set(
      docs.map((d) => d.invoice_number).filter((v): v is string => Boolean(v)),
    ).size;
    return { count: distinctInvoices, totalNio };
  }, [filtered]);

  // The backend returns only the newest rows (take(limit)); when the page is
  // full, spend over the range may be understated — never hide that.
  const isTruncated = (data?.length ?? 0) >= TRUNCATION_LIMIT;

  if (isLoading) return <LoadingState message="Cargando historial de compras..." />;

  if (error) {
    return (
      <Alert
        variant="destructive"
        data-testid="purchases-error-alert"
        className="items-start"
      >
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>No se pudo cargar el historial de compras</AlertTitle>
        <AlertDescription>Verifique su conexión e intente de nuevo.</AlertDescription>
        <div className="pl-0 pt-1">
          <Button
            variant="outline"
            size="sm"
            data-testid="purchases-retry-btn"
            onClick={() => refetch()}
          >
            Reintentar
          </Button>
        </div>
      </Alert>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="space-y-6" data-testid="purchases-tab-container">
        <div className="flex justify-end">
          <Button data-testid="purchases-register-btn" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Registrar compra
          </Button>
        </div>
        <EmptyState
          icon={ShoppingCart}
          title="Sin compras registradas en este rango"
          message="Registra tu primera compra con el botón 'Registrar compra'; también pueden llegar desde el POS."
        />
        <PurchasesForm open={formOpen} onOpenChange={setFormOpen} />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="purchases-tab-container">
      <div className="flex justify-end">
        <Button data-testid="purchases-register-btn" onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Registrar compra
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard
          label="Documentos de Compra"
          value={formatNumber(totals.count)}
          // The stat is computed over the filtered (search-applied) set; the
          // subtitle must not lie about that scope (R2, §39).
          subtitle={
            search.trim()
              ? "Facturas distintas que coinciden con tu búsqueda"
              : "Facturas distintas en el rango seleccionado"
          }
        />
        <StatCard
          label="Total Compras (NIO)"
          value={formatCurrency(totals.totalNio)}
          subtitle="Costo unitario × cantidad"
        />
      </div>

      {isTruncated && (
        <Alert variant="warning" data-testid="purchases-truncation-notice">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Historial recortado</AlertTitle>
          <AlertDescription>
            Mostrando las {TRUNCATION_LIMIT} compras más recientes; puede haber más
            en el rango. El total refleja solo las compras mostradas.
          </AlertDescription>
        </Alert>
      )}

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          data-testid="purchases-search-input"
          placeholder="Buscar por factura, insumo o proveedor..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9 pr-8 text-sm"
        />
        {search && (
          <button
            type="button"
            data-testid="purchases-search-clear"
            aria-label="Limpiar búsqueda"
            onClick={() => handleSearchChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          message={`No se encontraron compras para "${search}"`}
        />
      ) : (
        <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60 text-muted-foreground uppercase text-xs">
                  <th className="px-4 py-3 text-left font-semibold">Fecha</th>
                  <th className="px-4 py-3 text-left font-semibold">Factura</th>
                  <th className="px-4 py-3 text-left font-semibold">Insumo</th>
                  <th className="px-4 py-3 text-left font-semibold">Proveedor</th>
                  <th className="px-4 py-3 text-right font-semibold">Cantidad</th>
                  <th className="px-4 py-3 text-right font-semibold">Costo Unit. (NIO)</th>
                  <th className="px-4 py-3 text-right font-semibold">Subtotal</th>
                  <th className="px-4 py-3 text-center font-semibold">Tipo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((doc) => {
                  const qty = Number(doc.quantity) || 0;
                  const unitNio = Number(doc.unit_cost_nio) || 0;
                  const isCorrection = doc.document_type !== "PURCHASE";
                  return (
                    <tr
                      key={doc.id}
                      data-testid={`purchase-row-${doc.id}`}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        {formatDate(doc.invoice_date)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {doc.invoice_number}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {doc.insumo?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {doc.supplier?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatNumber(qty)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatCurrency(unitNio)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">
                        {formatCurrency(qty * unitNio)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge
                          variant={isCorrection ? "secondary" : "outline"}
                          className="text-[10px]"
                        >
                          {isCorrection ? "Corrección" : "Compra"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <p>
          Puedes registrar compras aquí; la recepción física de mercadería
          sigue gestionándose en el POS.
        </p>
        {/* Plain metadata (§35): this is the newest purchase's timestamp, not a
            sync-completeness read, so it must not wear freshness-state styling. */}
        {data[0]?.created_at && (
          <p data-testid="purchases-last-created">
            Última compra registrada: {formatDate(data[0].created_at)}
          </p>
        )}
      </div>

      <PurchasesForm open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}
