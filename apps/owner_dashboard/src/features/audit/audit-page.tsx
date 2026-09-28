import { History, RefreshCw } from "lucide-react";
import { useSafeSearchParams } from "@/lib/safe-search-params";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FreshnessBadge } from "@/components/freshness-badge";
import { getApiErrorMessage } from "@/lib/api-error";
import {
  localize,
  auditSeverityLabels,
  auditActionLabels,
  auditTargetTypeLabels,
  auditActorRefLabels,
} from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";
import { parseDashboardNavigationContext } from "@/features/dashboard/domain/navigation-context";
import { useAuditEvents, useAuditSummary } from "./use-audit-events";
import type { AuditEvent, AuditSeverity } from "./types";

type SeverityFilter = AuditSeverity | undefined;

// NHILOS §15: the backend defaults to 50 rows (max 100) with no total-count
// contract, so the page sends an explicit `limit` and, whenever the response
// fills the page, states that older events may exist instead of implying the
// list is complete.
const EVENTS_PAGE_LIMIT = 50;

const SEVERITY_FILTERS: { value: SeverityFilter; label: string }[] = [
  { value: undefined, label: "Todos" },
  { value: "CRITICAL", label: "Crítico" },
  { value: "WARNING", label: "Advertencia" },
  { value: "INFO", label: "Informativo" },
];

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Deep-link contract (§9/§14.4): the dashboard attention band builds
 * /audit?source=dashboard&sourceWidget=attention&startDate=…&endDate=…&severity=…
 * (pinned by dashboard-v2-attention.spec.tsx). Every context parameter the
 * link carries is consumed here, and the ones that narrow the dataset
 * (severity, period) are re-rendered as VISIBLE, clearable chips — never
 * mystery filtering (AP-13). source/sourceWidget identify the origin and do
 * not change the data, so they are validated and carried in the URL without
 * a chip.
 */
function readAuditFilters(searchParams: URLSearchParams): {
  startDate?: string;
  endDate?: string;
  severity: SeverityFilter;
} {
  const startDate = searchParams.get("startDate") ?? undefined;
  const endDate = searchParams.get("endDate") ?? undefined;
  const severityParam = searchParams.get("severity");
  const severity: SeverityFilter =
    severityParam === "CRITICAL" ||
    severityParam === "WARNING" ||
    severityParam === "INFO"
      ? severityParam
      : undefined;
  return {
    // Only well-formed calendar keys reach the API; anything else is treated
    // as absent instead of triggering a backend 400 on a pasted URL.
    startDate:
      startDate && DATE_KEY_PATTERN.test(startDate) ? startDate : undefined,
    endDate: endDate && DATE_KEY_PATTERN.test(endDate) ? endDate : undefined,
    severity,
  };
}

function severityBadgeVariant(severity: AuditSeverity) {
  switch (severity) {
    case "CRITICAL":
      return "destructive" as const;
    case "WARNING":
      return "warning" as const;
    case "INFO":
      return "secondary" as const;
  }
}

function SeverityBadge({ severity }: { severity: AuditSeverity }) {
  const label = localize(severity, auditSeverityLabels);
  // Color is never the only signal (§46): the badge text carries the state.
  return <Badge variant={severityBadgeVariant(severity)}>{label}</Badge>;
}

function ActorCell({ event }: { event: AuditEvent }) {
  // §34: no actor evidence is —, never a fabricated name.
  if (event.actorEmail) {
    return <span className="text-foreground">{event.actorEmail}</span>;
  }
  if (event.actorRef) {
    return (
      <span className="text-foreground">
        {localize(event.actorRef, auditActorRefLabels)}
      </span>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

function SummaryCard({
  label,
  count,
  tone,
}: {
  label: string;
  count: number | null;
  tone: "critical" | "warning" | "info";
}) {
  const toneClass =
    tone === "critical"
      ? "text-destructive"
      : tone === "warning"
        ? "text-foreground"
        : "text-muted-foreground";
  return (
    <div className="rounded-md border border-border bg-card px-4 py-3 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {/* §34: a failed summary read is unknown, never 0. */}
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>
        {count ?? "—"}
      </p>
    </div>
  );
}

function EventsTable({ events }: { events: AuditEvent[] }) {
  return (
    <div className="rounded-md border border-border bg-card shadow-sm">
      <Table className="min-w-[720px]">
        <TableHeader>
          <TableRow>
            <TableHead>Fecha y hora</TableHead>
            <TableHead>Usuario</TableHead>
            <TableHead>Acción</TableHead>
            <TableHead>Severidad</TableHead>
            <TableHead>Referencia</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event) => (
            <TableRow key={event.id}>
              <TableCell className="text-muted-foreground tabular-nums">
                {/* §38: explicit es-NI datetime — auditable history never
                uses ambiguous time-only or relative labels. */}
                {formatDateTime(event.occurredAt)}
              </TableCell>
              <TableCell>
                <ActorCell event={event} />
              </TableCell>
              <TableCell className="font-medium text-foreground">
                {event.action ? localize(event.action, auditActionLabels) : "—"}
              </TableCell>
              <TableCell>
                <SeverityBadge severity={event.severity} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {/* §12.2/§39.4: the entity is named, its internal id is not
                rendered. */}
                {event.targetType
                  ? localize(event.targetType, auditTargetTypeLabels)
                  : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function AuditPage() {
  const [searchParams, setSearchParams] = useSafeSearchParams();

  // §9.4/§14.3: every filter lives in the URL so it survives refresh,
  // back/forward and a copied support link — and the deep link from the
  // dashboard attention band lands with its context already applied.
  const { startDate, endDate, severity } = readAuditFilters(searchParams);
  // Deep-link origin (consumed per the contract; no data effect).
  parseDashboardNavigationContext(searchParams);

  const hasDateFilter = startDate !== undefined || endDate !== undefined;
  const isFiltered = severity !== undefined || hasDateFilter;

  const eventsQuery = useAuditEvents(
    { startDate, endDate, severity },
    EVENTS_PAGE_LIMIT,
  );
  const summaryQuery = useAuditSummary(startDate, endDate);

  const events = eventsQuery.data?.events ?? [];

  const setSeverityFilter = (value: SeverityFilter) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) {
          next.set("severity", value);
        } else {
          next.delete("severity");
        }
        return next;
      },
      { replace: true },
    );
  };

  const clearDateFilter = () => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("startDate");
        next.delete("endDate");
        return next;
      },
      { replace: true },
    );
  };

  return (
    <div className="space-y-6">
      {/* §7.1: where am I */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Auditoría
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Revisá la actividad y los eventos de seguridad de tu comercio: qué
            cambió, quién lo hizo y cuándo.
          </p>
        </div>
        {/* §35: the audit summary is a generated report — show its generation
        time as metadata, never as a synchronization-freshness claim. */}
        <FreshnessBadge
          generatedAt={summaryQuery.data?.generatedAt}
          isLoading={summaryQuery.isLoading}
        />
      </div>

      {/* §41 P0: SUMMARY → DETAIL. Executive counts first, event rows below. */}
      <div
        className="grid gap-3 sm:grid-cols-3"
        aria-label="Resumen de eventos de auditoría"
      >
        <SummaryCard
          label="Eventos críticos"
          count={
            summaryQuery.data === undefined ? null : summaryQuery.data.criticalCount
          }
          tone="critical"
        />
        <SummaryCard
          label="Advertencias"
          count={
            summaryQuery.data === undefined ? null : summaryQuery.data.warningCount
          }
          tone="warning"
        />
        <SummaryCard
          label="Informativos"
          count={
            summaryQuery.data === undefined ? null : summaryQuery.data.infoCount
          }
          tone="info"
        />
      </div>

      {/* §28.2 partial failure isolation: a failed summary never blanks the
      event list; it is named, not collapsed into a generic error. */}
      {summaryQuery.error && !eventsQuery.error && (
        <p className="text-xs text-muted-foreground" role="status">
          No pudimos cargar el resumen; la lista de eventos sigue disponible.
        </p>
      )}

      {/* §14: visible, resettable filters — deep-linked state is re-rendered
      as chips (AP-13), never invisible. */}
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Filtros de auditoría"
      >
        {SEVERITY_FILTERS.map((f) => (
          <button
            key={f.label}
            type="button"
            onClick={() => setSeverityFilter(f.value)}
            aria-pressed={(f.value ?? undefined) === (severity ?? undefined)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 ${
              (f.value ?? undefined) === (severity ?? undefined)
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
        {hasDateFilter && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
            Período: {startDate ?? "inicio"} – {endDate ?? "hoy"}
            <button
              type="button"
              onClick={clearDateFilter}
              aria-label="Quitar filtro de período"
              className="cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              ✕
            </button>
          </span>
        )}
      </div>

      {/* §30: error explains impact + meaningful retry, preserves filters */}
      {eventsQuery.error && (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>
              {getApiErrorMessage(
                eventsQuery.error,
                "No pudimos cargar los eventos de auditoría. El registro de tu comercio no se vio afectado.",
              )}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => eventsQuery.refetch()}
              className="gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Reintentar
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {eventsQuery.isLoading ? (
        <LoadingState message="Cargando eventos de auditoría..." />
      ) : !eventsQuery.error && events.length === 0 ? (
        isFiltered ? (
          /* §13.2/§29: filtered empty ≠ no data — show the filters + reset */
          <EmptyState
            message="No hay eventos con estos filtros en tu comercio."
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchParams(
                    (prev) => {
                      const next = new URLSearchParams(prev);
                      next.delete("severity");
                      next.delete("startDate");
                      next.delete("endDate");
                      return next;
                    },
                    { replace: true },
                  );
                }}
              >
                Ver todos los eventos
              </Button>
            }
          />
        ) : (
          /* §29 first-use empty: what belongs here, why it matters */
          <EmptyState
            icon={<History className="h-6 w-6 stroke-[1.5]" aria-hidden="true" />}
            title="Todavía no hay eventos registrados"
            message="Cuando tu equipo active terminales o realice cambios en el sistema, vas a ver aquí un registro de cada evento, quién lo realizó y su nivel de riesgo."
          />
        )
      ) : (
        events.length > 0 && (
          <>
            {/* §28.3: refetch keeps valid data visible, no full-page reset */}
            {eventsQuery.isRefetching && (
              <p className="text-xs text-muted-foreground" role="status">
                Actualizando…
              </p>
            )}
            <EventsTable events={events} />
            {events.length >= EVENTS_PAGE_LIMIT ? (
              /* §15: never make the user guess if more data exists */
              <p className="text-xs text-muted-foreground" aria-live="polite">
                Mostrando los {EVENTS_PAGE_LIMIT} eventos más recientes — puede
                haber más registros.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground" aria-live="polite">
                Mostrando {events.length}{" "}
                {events.length === 1 ? "evento" : "eventos"}
              </p>
            )}
          </>
        )
      )}
    </div>
  );
}
