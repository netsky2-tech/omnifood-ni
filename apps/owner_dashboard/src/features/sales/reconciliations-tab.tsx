import { useQuery } from "@tanstack/react-query";
import { useTenantId } from "@/lib/tenant";
import { useSafeSearchParams } from "@/lib/safe-search-params";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  fetchReconciliations,
  type ReconciliationListRow,
} from "@/features/dashboard/dashboard-api";

/**
 * Reconciliaciones tab — read-only drill-down list for voucher
 * reconciliations (GET /sales/reports/reconciliations).
 *
 * The dashboard NEVER reconciles: the POS terminal is the source of truth
 * and the only writer (a cloud-side reconcile would never reach the POS,
 * and the next cashier push upserts by paymentId and overwrites it). For a
 * PENDIENTE row the action is instruction, not mutation — the quiet note
 * tells the owner where to reconcile.
 *
 * URL-first (nhilos experience standard §9.4): the status filter and the
 * page live in `reconciliationStatus` / `page` search params so refresh,
 * back/forward and copied support URLs keep the exact view.
 *
 * The backend's startDate/endDate filter applies to `reconciled_at`, which
 * is NULL for PENDIENTE rows — so this tab never sends dates. A date range
 * control here would rebuild the old dead end as an empty list.
 */

const STATUS_OPTIONS = [
  "PENDIENTE",
  "MANUAL_OVERRIDE",
  "CONCILIADO",
  "todos",
] as const;
type StatusFilter = (typeof STATUS_OPTIONS)[number];

const STATUS_LABELS: Record<StatusFilter, string> = {
  PENDIENTE: "Pendientes",
  MANUAL_OVERRIDE: "Overrides manuales",
  CONCILIADO: "Conciliados",
  todos: "Todos",
};

const ROW_BADGES: Record<string, { label: string; variant: "warning" | "info" | "success" }> = {
  PENDIENTE: { label: "Pendiente", variant: "warning" },
  MANUAL_OVERRIDE: { label: "Override manual", variant: "info" },
  CONCILIADO: { label: "Conciliado", variant: "success" },
};

function resolveStatus(raw: string | null, initial: string | undefined): StatusFilter {
  const candidate = raw ?? initial;
  if (candidate && (STATUS_OPTIONS as readonly string[]).includes(candidate)) {
    return candidate as StatusFilter;
  }
  return "todos";
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency: "NIO",
    minimumFractionDigits: 2,
  }).format(amount);
}

function StatusBadge({ status }: { status: string }) {
  const meta = ROW_BADGES[status];
  if (!meta) return <Badge variant="outline">{status || "—"}</Badge>;
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

function OperatorCell({ row }: { row: ReconciliationListRow }) {
  const isOverride = row.reconciliationStatus === "MANUAL_OVERRIDE";
  return (
    <div className="text-sm">
      <span className={row.operatorName ? "text-foreground" : "text-muted-foreground"}>
        {row.operatorName ?? "No verificable"}
      </span>
      {isOverride && (
        <span className="block text-xs text-muted-foreground">
          {row.overrideSupervisorRef
            ? `${row.overrideSupervisorRef} — declarado, no validado`
            : "Supervisor: No declarado"}
        </span>
      )}
    </div>
  );
}

function ReconciliationRow({ row }: { row: ReconciliationListRow }) {
  return (
    <tr
      data-testid={`reconciliation-row-${row.paymentId}`}
      className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors"
    >
      <td className="px-4 py-3">
        <StatusBadge status={row.reconciliationStatus} />
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        <span className="font-semibold text-foreground">{formatCurrency(row.amount)}</span>
        {row.currency !== "NIO" && (
          <span className="block text-xs text-muted-foreground">
            Ref. NIO: {formatCurrency(row.amountNio)}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-muted-foreground">{row.method ?? "—"}</td>
      <td className="px-4 py-3 max-w-[220px]">
        {row.voucherCode ? (
          <span
            className="block truncate font-mono text-xs text-foreground"
            title={row.voucherCode}
          >
            {row.voucherCode}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
        {row.createdAt ? new Date(row.createdAt).toLocaleDateString("es-NI") : "—"}
      </td>
      <td className="px-4 py-3">
        <OperatorCell row={row} />
      </td>
      <td className="px-4 py-3 text-muted-foreground text-xs">
        {row.terminalId ?? "Sin turno"}
      </td>
    </tr>
  );
}

export function ReconciliationsTab({ initialStatus }: { initialStatus?: string }) {
  const [searchParams, setSearchParams] = useSafeSearchParams();
  const tenantId = useTenantId();

  const status = resolveStatus(
    searchParams.get("reconciliationStatus"),
    initialStatus,
  );
  const pageParam = Number(searchParams.get("page"));
  const page =
    Number.isInteger(pageParam) && pageParam >= 1 ? pageParam : 1;

  const query = useQuery({
    queryKey: ["sales", tenantId, "reconciliations", status, page],
    queryFn: ({ signal }) =>
      fetchReconciliations(
        { status: status === "todos" ? undefined : status, page },
        { signal },
      ),
    staleTime: 60 * 1000,
    retry: false,
  });

  const updateParams = (mutate: (next: URLSearchParams) => void) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      mutate(next);
      return next;
    });
  };

  const handleStatusChange = (nextStatus: string) => {
    updateParams((next) => {
      next.set("reconciliationStatus", nextStatus);
      next.delete("page");
    });
  };

  const handlePageChange = (nextPage: number) => {
    updateParams((next) => {
      next.set("page", String(nextPage));
    });
  };

  if (query.isLoading) return <LoadingState message="Cargando conciliaciones..." />;

  if (query.isError || !query.data) {
    return (
      <div data-testid="reconciliations-error">
        <EmptyState
          title="No se pudo cargar"
          message="No se pudieron cargar las conciliaciones. Intenta nuevamente en unos momentos."
        />
      </div>
    );
  }

  const rows = query.data.reconciliations;
  const pagination = query.data.pagination;

  if (rows.length === 0) {
    return (
      <div data-testid="reconciliations-empty">
        <EmptyState
          title="Sin conciliaciones"
          message="No hay conciliaciones para el filtro seleccionado."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <label
            htmlFor="reconciliation-status-filter"
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Estado
          </label>
          <select
            id="reconciliation-status-filter"
            data-testid="reconciliation-status-filter"
            value={status}
            onChange={(event) => handleStatusChange(event.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {STATUS_LABELS[option]}
              </option>
            ))}
          </select>
        </div>
        {status === "PENDIENTE" && (
          <p
            data-testid="reconciliations-pending-note"
            className="text-xs text-muted-foreground"
          >
            La conciliación de vouchers se realiza en la terminal POS; esta vista es informativa y de solo lectura.
          </p>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-sm min-w-[760px]" data-testid="reconciliations-table">
            <thead>
              <tr className="border-b border-border bg-muted/60">
                <th className="px-4 py-3 text-left font-semibold uppercase text-xs text-muted-foreground">
                  Estado
                </th>
                <th className="px-4 py-3 text-right font-semibold uppercase text-xs text-muted-foreground">
                  Monto
                </th>
                <th className="px-4 py-3 text-left font-semibold uppercase text-xs text-muted-foreground">
                  Método
                </th>
                <th className="px-4 py-3 text-left font-semibold uppercase text-xs text-muted-foreground">
                  Voucher
                </th>
                <th className="px-4 py-3 text-left font-semibold uppercase text-xs text-muted-foreground">
                  Fecha
                </th>
                <th className="px-4 py-3 text-left font-semibold uppercase text-xs text-muted-foreground">
                  Operador
                </th>
                <th className="px-4 py-3 text-left font-semibold uppercase text-xs text-muted-foreground">
                  Terminal
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <ReconciliationRow key={row.paymentId} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {pagination.totalPages > 1 && (
        <div
          data-testid="reconciliations-pagination"
          className="flex items-center justify-between"
        >
          <span
            data-testid="reconciliations-page-info"
            className="text-xs text-muted-foreground tabular-nums"
          >
            Página {pagination.page} de {pagination.totalPages} · {pagination.total} registro(s)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="reconciliations-prev"
              disabled={pagination.page <= 1}
              onClick={() => handlePageChange(pagination.page - 1)}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
            >
              Anterior
            </button>
            <button
              type="button"
              data-testid="reconciliations-next"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => handlePageChange(pagination.page + 1)}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
