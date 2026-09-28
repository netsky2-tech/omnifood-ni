import { Banknote, RefreshCw } from "lucide-react";
import { useSafeSearchParams } from "@/lib/safe-search-params";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FreshnessBadge } from "@/components/freshness-badge";
import { getApiErrorMessage } from "@/lib/api-error";
import { localize, cashShiftStatusLabels } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";
import { useSyncFreshness } from "@/features/dashboard/use-sync-freshness";
import { useCashSessions } from "./use-cash-sessions";
import type { CashShiftSession, CashShiftStatus } from "./types";

type StatusFilter = CashShiftStatus | undefined;

// NHILOS §15 (slice 6a verification): the backend defaults to 50 rows with no
// total-count contract, so the page sends an explicit `limit` and, whenever the
// response fills the page, states that older sessions may exist instead of
// implying the list is complete. Conservative by design: a tenant with exactly
// 50 sessions sees the signal even if nothing is hidden.
const SESSIONS_PAGE_LIMIT = 50;

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: undefined, label: "Todas" },
  { value: "OPEN", label: "Abiertas" },
  { value: "CLOSED", label: "Cerradas" },
];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency: "NIO",
    minimumFractionDigits: 2,
  }).format(amount);
}

function DifferenceCell({ session }: { session: CashShiftSession }) {
  // §34: for an open session the difference is unknown, never zero — render
  // the unavailable marker instead of a number.
  if (session.difference_nio === null || session.difference_nio === undefined) {
    return <span className="tabular-nums text-muted-foreground">—</span>;
  }
  const diff = Number(session.difference_nio);
  return (
    <span className="tabular-nums font-medium text-foreground">
      {diff > 0 ? "+" : ""}
      {formatCurrency(diff)}
    </span>
  );
}

function StatusCell({ session }: { session: CashShiftSession }) {
  const label = localize(session.status, cashShiftStatusLabels);
  // Color is never the only signal (§46): the badge text carries the state.
  const variant =
    session.status === "OPEN" ? ("default" as const) : ("secondary" as const);
  return <Badge variant={variant}>{label}</Badge>;
}

function SessionsTable({ sessions }: { sessions: CashShiftSession[] }) {
  return (
    <div className="rounded-md border border-border bg-card shadow-sm">
      <Table className="min-w-[720px]">
        <TableHeader>
          <TableRow>
            <TableHead>Terminal</TableHead>
            <TableHead>Cajero</TableHead>
            <TableHead>Apertura</TableHead>
            <TableHead>Cierre</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Diferencia</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="font-medium text-foreground">
                {s.terminal_id}
              </TableCell>
              <TableCell className="text-foreground">{s.cashier_name}</TableCell>
              <TableCell className="text-muted-foreground tabular-nums">
                {formatDateTime(s.opened_at)}
              </TableCell>
              <TableCell className="text-muted-foreground tabular-nums">
                {/* §34: no cierre aún — unavailable, never a fabricated value */}
                {s.closed_at ? formatDateTime(s.closed_at) : "—"}
              </TableCell>
              <TableCell>
                <StatusCell session={s} />
              </TableCell>
              <TableCell className="text-right">
                <DifferenceCell session={s} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function CashPage() {
  const [searchParams, setSearchParams] = useSafeSearchParams();

  // §9.4/§14.3: the status filter lives in the URL so it survives refresh,
  // back/forward and a copied support link.
  const statusParam = searchParams.get("status");
  const statusFilter: StatusFilter =
    statusParam === "OPEN" || statusParam === "CLOSED" ? statusParam : undefined;
  const isFiltered = statusFilter !== undefined;

  const { data, isLoading, error, refetch, isRefetching } = useCashSessions(
    statusFilter,
    SESSIONS_PAGE_LIMIT,
  );
  const freshness = useSyncFreshness();

  const sessions = data ?? [];

  const setStatusFilter = (value: StatusFilter) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) {
          next.set("status", value);
        } else {
          next.delete("status");
        }
        return next;
      },
      { replace: true },
    );
  };

  return (
    <div className="space-y-6">
      {/* §7.1/§7.3: where am I + what am I looking at (scope + freshness) */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Sesiones de Caja
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Verificá quién abrió y cerró cada terminal, con el esperado y la
            diferencia de efectivo por turno.
          </p>
        </div>
        {/* §35: cash truth depends on POS sync — expose freshness, never
        imply certainty beyond the sync evidence. */}
        <FreshnessBadge
          freshness={freshness.data ?? null}
          isLoading={freshness.isLoading}
        />
      </div>

      {/* §14: visible, resettable filter — the active state is the control
      itself; "Todas" resets it. */}
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Filtrar por estado"
      >
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.label}
            type="button"
            onClick={() => setStatusFilter(f.value)}
            aria-pressed={
              (f.value ?? undefined) === (statusFilter ?? undefined)
            }
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 ${
              (f.value ?? undefined) === (statusFilter ?? undefined)
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* §30: error explains impact + meaningful retry, preserves filter */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>
              {getApiErrorMessage(
                error,
                "No pudimos cargar las sesiones de caja. Los datos en las terminales no se vieron afectados.",
              )}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Reintentar
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <LoadingState message="Cargando sesiones de caja..." />
      ) : !error && sessions.length === 0 ? (
        isFiltered ? (
          /* §13.2/§29: filtered empty ≠ no data — show the filter + reset */
          <EmptyState
            message="No hay sesiones con este estado en tu comercio."
            action={
              <Button variant="outline" size="sm" onClick={() => setStatusFilter(undefined)}>
                Ver todas las sesiones
              </Button>
            }
          />
        ) : (
          /* §29 first-use empty: what belongs here, why it matters, next step */
          <EmptyState
            icon={<Banknote className="h-6 w-6 stroke-[1.5]" aria-hidden="true" />}
            title="Todavía no hay sesiones de caja"
            message="Cuando tu equipo abra un turno en una terminal POS, vas a ver aquí quién lo abrió, cuánto efectivo se esperaba y la diferencia del cierre. Podés verificarlo de forma remota sin ir al local."
          />
        )
      ) : (
        sessions.length > 0 && (
          <>
            {/* §28.3: refetch keeps valid data visible, no full-page reset */}
            {isRefetching && (
              <p className="text-xs text-muted-foreground" role="status">
                Actualizando…
              </p>
            )}
            <SessionsTable sessions={sessions} />
            {sessions.length >= SESSIONS_PAGE_LIMIT ? (
              /* §15: never make the user guess if more data exists — the page
              is full, so older sessions may be hidden server-side. */
              <p className="text-xs text-muted-foreground" aria-live="polite">
                Mostrando las {SESSIONS_PAGE_LIMIT} sesiones más recientes —
                puede haber más registros.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground" aria-live="polite">
                Mostrando {sessions.length}{" "}
                {sessions.length === 1 ? "sesión" : "sesiones"}
              </p>
            )}
          </>
        )
      )}
    </div>
  );
}
