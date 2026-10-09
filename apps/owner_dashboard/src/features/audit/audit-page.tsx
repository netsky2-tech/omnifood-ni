import { History, RefreshCw, ShieldCheck } from "lucide-react";
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
  auditLedgerActionLabels,
  auditLedgerTargetTypeLabels,
} from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";
import { parseDashboardNavigationContext } from "@/features/dashboard/domain/navigation-context";
import {
  useAuditEvents,
  useAuditSummary,
  useAuditLedger,
  useAuditIntegrity,
  useAuditActors,
} from "./use-audit-events";
import type { AuditEvent, AuditSeverity } from "./types";
import type { AuditLedgerEntry, AuditIntegrityAlert } from "./audit-api";

type SeverityFilter = AuditSeverity | undefined;

/**
 * S4b — the bitacora reads TWO separated sources: the platform change log
 * (GET /operations/audit/events) and the POS counter ledger
 * (GET /operations/audit/ledger). The owner picks the source explicitly;
 * a filtered view never silently swaps stores underneath them.
 */
type AuditView = "platform" | "ledger";

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

const ENTITY_FILTER_OPTIONS: { value: string; label: string }[] = [
  "invoice",
  "credit_note",
  "CASH_DRAWER",
  "SUPERVISOR_OVERRIDE",
  "USER",
].map((value) => ({
  value,
  label: localize(value, auditLedgerTargetTypeLabels),
}));

/**
 * Deep-link contract (§9/§14.4): the dashboard attention band builds
 * /audit?source=dashboard&sourceWidget=attention&startDate=…&endDate=…&severity=…
 * (pinned by dashboard-v2-attention.spec.tsx). Every context parameter the
 * link carries is consumed here, and the ones that narrow the dataset
 * (severity, period) are re-rendered as VISIBLE, clearable chips — never
 * mystery filtering (AP-13). source/sourceWidget identify the origin and do
 * not change the data, so they are validated and carried in the URL without
 * a chip. S4b adds `view` (platform | ledger) plus the ledger-only actor and
 * entity filters.
 */
function readAuditFilters(searchParams: URLSearchParams): {
  startDate?: string;
  endDate?: string;
  severity: SeverityFilter;
  view: AuditView;
  actorUserId?: string;
  targetType?: string;
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
  const view: AuditView =
    searchParams.get("view") === "ledger" ? "ledger" : "platform";
  return {
    // Only well-formed calendar keys reach the API; anything else is treated
    // as absent instead of triggering a backend 400 on a pasted URL.
    startDate:
      startDate && DATE_KEY_PATTERN.test(startDate) ? startDate : undefined,
    endDate: endDate && DATE_KEY_PATTERN.test(endDate) ? endDate : undefined,
    severity,
    view,
    actorUserId: searchParams.get("actorUserId") ?? undefined,
    targetType: searchParams.get("targetType") ?? undefined,
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

function LedgerActorCell({ entry }: { entry: AuditLedgerEntry }) {
  // §34: no actor evidence is —, never a fabricated name. actorUserId is
  // reference data (the actor filter value), never rendered raw.
  if (entry.actorEmail) {
    return <span className="text-foreground">{entry.actorEmail}</span>;
  }
  return <span className="text-muted-foreground">—</span>;
}

function LedgerActionCell({ entry }: { entry: AuditLedgerEntry }) {
  if (entry.action) {
    return (
      <span className="font-medium text-foreground">
        {localize(entry.action, auditLedgerActionLabels)}
      </span>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

function LedgerEntityCell({ entry }: { entry: AuditLedgerEntry }) {
  if (!entry.targetType) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="space-y-0.5">
      <span className="text-foreground">
        {localize(entry.targetType, auditLedgerTargetTypeLabels)}
      </span>
      {/* Reference data, muted: the id names the exact audited entity. */}
      {entry.targetId && (
        <span className="block text-xs text-muted-foreground">
          {entry.targetId}
        </span>
      )}
    </div>
  );
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

/**
 * S4b — the POS counter ledger table. One row per hash-chained audit entry:
 * who (actor email), what (localized action), on what entity, with the
 * severity badge and the device that produced the entry.
 */
function LedgerTable({ entries }: { entries: AuditLedgerEntry[] }) {
  return (
    <div className="rounded-md border border-border bg-card shadow-sm">
      <Table className="min-w-[860px]">
        <TableHeader>
          <TableRow>
            <TableHead>Fecha y hora</TableHead>
            <TableHead>Usuario</TableHead>
            <TableHead>Acción</TableHead>
            <TableHead>Severidad</TableHead>
            <TableHead>Entidad</TableHead>
            <TableHead>Dispositivo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="text-muted-foreground tabular-nums">
                {/* §38: explicit es-NI datetime, same as the event table. */}
                {formatDateTime(entry.occurredAt)}
              </TableCell>
              <TableCell>
                <LedgerActorCell entry={entry} />
              </TableCell>
              <TableCell>
                <LedgerActionCell entry={entry} />
              </TableCell>
              <TableCell>
                <SeverityBadge severity={entry.severity} />
              </TableCell>
              <TableCell>
                <LedgerEntityCell entry={entry} />
              </TableCell>
              <TableCell className="text-muted-foreground font-mono text-xs">
                {entry.deviceId}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * S4b — nightly integrity report, read-only and clearly labelled. §34
 * discipline: a failed read is an explicit "could not verify", never dressed
 * up as "no gaps".
 */
function IntegritySection({
  isLoading,
  error,
  alerts,
  onRetry,
}: {
  isLoading: boolean;
  error: unknown;
  alerts: AuditIntegrityAlert[];
  onRetry: () => void;
}) {
  return (
    <section
      aria-label="Integridad del registro del mostrador (POS)"
      className="rounded-md border border-border bg-card shadow-sm"
    >
      <div className="flex flex-col gap-1 border-b border-border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">
            Integridad del registro del mostrador (POS)
          </h2>
          <Badge variant="outline">Solo lectura</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Cada noche el sistema verifica que la cadena de registros del POS no
          tenga huecos. Este control es informativo: no afecta tus ventas.
        </p>
      </div>
      <div className="p-4">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>
                {getApiErrorMessage(
                  error,
                  "No pudimos cargar la verificación de integridad. No podemos confirmar que el registro del mostrador esté completo.",
                )}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={onRetry}
                className="gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Reintentar
              </Button>
            </AlertDescription>
          </Alert>
        ) : isLoading ? (
          <p className="text-xs text-muted-foreground" role="status">
            Verificando integridad…
          </p>
        ) : alerts.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            La última verificación disponible no registró huecos en la cadena
            del mostrador.
          </p>
        ) : (
          <ul className="space-y-2">
            {alerts.map((alert) => (
              <li
                key={alert.id}
                className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-foreground dark:border-amber-900/50 dark:bg-amber-950/50"
              >
                <span className="font-medium">
                  Dispositivo {alert.deviceId}
                </span>{" "}
                — hueco en la secuencia{" "}
                {alert.gapStart === alert.gapEnd
                  ? alert.gapStart
                  : `${alert.gapStart}–${alert.gapEnd}`}
                . Detectado el {formatDateTime(alert.firstDetectedAt)}; visto
                por última vez el {formatDateTime(alert.lastSeenAt)}.
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

const LEDGER_FILTER_CONTROL_CLASS =
  "h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

const SOURCE_CHIP_ACTIVE_CLASS =
  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 border-primary bg-primary/10 text-primary";
const SOURCE_CHIP_IDLE_CLASS =
  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 border-border text-muted-foreground hover:text-foreground";

const FILTER_CHIP_CLASS =
  "inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary";

export function AuditPage() {
  const [searchParams, setSearchParams] = useSafeSearchParams();

  // §9.4/§14.3: every filter lives in the URL so it survives refresh,
  // back/forward and a copied support link — and the deep link from the
  // dashboard attention band lands with its context already applied.
  const { startDate, endDate, severity, view, actorUserId, targetType } =
    readAuditFilters(searchParams);
  // Deep-link origin (consumed per the contract; no data effect).
  parseDashboardNavigationContext(searchParams);
  const isLedgerView = view === "ledger";

  const hasDateFilter = startDate !== undefined || endDate !== undefined;
  const isFiltered = severity !== undefined || hasDateFilter;
  const isLedgerFiltered =
    actorUserId !== undefined || targetType !== undefined || hasDateFilter;

  // §28.2 partial failure isolation, applied per view: each view only pays
  // for its own reads (enabled flag), so a ledger failure never blanks the
  // platform view and vice versa.
  const eventsQuery = useAuditEvents(
    { startDate, endDate, severity },
    EVENTS_PAGE_LIMIT,
    !isLedgerView,
  );
  const ledgerQuery = useAuditLedger(
    { startDate, endDate, actorUserId, targetType },
    EVENTS_PAGE_LIMIT,
    isLedgerView,
  );
  const integrityQuery = useAuditIntegrity(isLedgerView);
  const actorsQuery = useAuditActors(isLedgerView);
  const summaryQuery = useAuditSummary(startDate, endDate, !isLedgerView);

  const events = eventsQuery.data?.events ?? [];
  const ledgerEntries = ledgerQuery.data?.entries ?? [];
  const users = Array.isArray(actorsQuery.data) ? actorsQuery.data : [];

  const updateParams = (mutate: (next: URLSearchParams) => void) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        mutate(next);
        return next;
      },
      { replace: true },
    );
  };

  const setView = (next: AuditView) => {
    updateParams((p) => {
      if (next === "ledger") {
        p.set("view", "ledger");
        // Filters that do not apply to the target view are stripped, never
        // left invisible in the URL (AP-13 mystery filtering).
        p.delete("severity");
      } else {
        p.delete("view");
        p.delete("actorUserId");
        p.delete("targetType");
      }
    });
  };

  const setLedgerFilter = (
    key: "actorUserId" | "targetType",
    value?: string,
  ) => {
    updateParams((p) => {
      if (value) {
        p.set(key, value);
      } else {
        p.delete(key);
      }
    });
  };

  const setSeverityFilter = (value: SeverityFilter) => {
    updateParams((p) => {
      if (value) {
        p.set("severity", value);
      } else {
        p.delete("severity");
      }
    });
  };

  const clearDateFilter = () => {
    updateParams((p) => {
      p.delete("startDate");
      p.delete("endDate");
    });
  };

  const activeActorLabel = actorUserId
    ? (users.find((u) => u.id === actorUserId)?.email ?? "Actor filtrado")
    : undefined;

  return (
    <div className="space-y-6">
      {/* §7.1: where am I */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Auditoría
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isLedgerView
              ? "Registro de lo que ocurrió en las cajas del local: anulaciones, notas de crédito, descuentos autorizados, aperturas de gaveta y reimpresiones — quién, cuándo y desde qué dispositivo."
              : "Revisá la actividad y los eventos de seguridad de tu comercio: qué cambió, quién lo hizo y cuándo."}
          </p>
        </div>
        {/* §35: generated reports show their generation time as metadata,
        never as a synchronization-freshness claim. Each view reports the
        generation time of the report it actually shows. */}
        {isLedgerView ? (
          <FreshnessBadge
            generatedAt={ledgerQuery.data?.generatedAt}
            isLoading={ledgerQuery.isLoading}
          />
        ) : (
          <FreshnessBadge
            generatedAt={summaryQuery.data?.generatedAt}
            isLoading={summaryQuery.isLoading}
          />
        )}
      </div>

      {/* S4b: two separated sources, chosen explicitly by the owner. The
      platform change log and the POS counter ledger are different stores —
      the caption under the switch names what the current view reads. */}
      <div
        role="group"
        aria-label="Fuente de auditoría"
        className="flex flex-wrap items-center gap-2"
      >
        <button
          type="button"
          aria-pressed={!isLedgerView}
          onClick={() => setView("platform")}
          className={
            !isLedgerView ? SOURCE_CHIP_ACTIVE_CLASS : SOURCE_CHIP_IDLE_CLASS
          }
        >
          Registro de la plataforma
        </button>
        <button
          type="button"
          aria-pressed={isLedgerView}
          onClick={() => setView("ledger")}
          className={
            isLedgerView ? SOURCE_CHIP_ACTIVE_CLASS : SOURCE_CHIP_IDLE_CLASS
          }
        >
          Bitácora del mostrador (POS)
        </button>
      </div>
      <p className="text-xs text-muted-foreground -mt-3">
        {isLedgerView
          ? "Entradas escritas por los terminales POS del local. No incluye los cambios de administración de la plataforma."
          : "Eventos registrados por la plataforma de administración (activaciones, catálogo, usuarios). Las operaciones en cajas del POS están en la bitácora del mostrador."}
      </p>

      {!isLedgerView && (
        <>
          {/* §41 P0: SUMMARY → DETAIL. Executive counts first, event rows
          below. The summary counts PLATFORM events only. */}
          <div
            className="grid gap-3 sm:grid-cols-3"
            aria-label="Resumen de eventos de auditoría"
          >
            <SummaryCard
              label="Eventos críticos"
              count={
                summaryQuery.data === undefined
                  ? null
                  : summaryQuery.data.criticalCount
              }
              tone="critical"
            />
            <SummaryCard
              label="Advertencias"
              count={
                summaryQuery.data === undefined
                  ? null
                  : summaryQuery.data.warningCount
              }
              tone="warning"
            />
            <SummaryCard
              label="Informativos"
              count={
                summaryQuery.data === undefined
                  ? null
                  : summaryQuery.data.infoCount
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
              <span className={FILTER_CHIP_CLASS}>
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
                      updateParams((p) => {
                        p.delete("severity");
                        p.delete("startDate");
                        p.delete("endDate");
                      });
                    }}
                  >
                    Ver todos los eventos
                  </Button>
                }
              />
            ) : (
              /* §29 first-use empty: what belongs here, why it matters */
              <EmptyState
                icon={
                  <History className="h-6 w-6 stroke-[1.5]" aria-hidden="true" />
                }
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
                  <p
                    className="text-xs text-muted-foreground"
                    aria-live="polite"
                  >
                    Mostrando los {EVENTS_PAGE_LIMIT} eventos más recientes —
                    puede haber más registros.
                  </p>
                ) : (
                  <p
                    className="text-xs text-muted-foreground"
                    aria-live="polite"
                  >
                    Mostrando {events.length}{" "}
                    {events.length === 1 ? "evento" : "eventos"}
                  </p>
                )}
              </>
            )
          )}
        </>
      )}

      {isLedgerView && (
        <>
          {/* §14: visible, resettable filters. Severity has no chip here on
          purpose: the ledger endpoint derives severity server-side from the
          action and accepts no severity param — showing the platform chips
          would pretend to filter data they cannot reach. */}
          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Filtros de la bitácora del mostrador"
          >
            {actorsQuery.error ? (
              <p className="text-xs text-muted-foreground" role="status">
                No pudimos cargar la lista de usuarios; el filtro por actor no
                está disponible por ahora.
              </p>
            ) : (
              <select
                aria-label="Filtrar por actor"
                value={actorUserId ?? ""}
                onChange={(e) =>
                  setLedgerFilter("actorUserId", e.target.value || undefined)
                }
                className={LEDGER_FILTER_CONTROL_CLASS}
              >
                <option value="">Todos los actores</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.email || u.name || u.id}
                  </option>
                ))}
              </select>
            )}
            <select
              aria-label="Filtrar por entidad"
              value={targetType ?? ""}
              onChange={(e) =>
                setLedgerFilter("targetType", e.target.value || undefined)
              }
              className={LEDGER_FILTER_CONTROL_CLASS}
            >
              <option value="">Todas las entidades</option>
              {ENTITY_FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {actorUserId && (
              <span className={FILTER_CHIP_CLASS}>
                Actor: {activeActorLabel}
                <button
                  type="button"
                  onClick={() => setLedgerFilter("actorUserId", undefined)}
                  aria-label="Quitar filtro de actor"
                  className="cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  ✕
                </button>
              </span>
            )}
            {targetType && (
              <span className={FILTER_CHIP_CLASS}>
                Entidad: {localize(targetType, auditLedgerTargetTypeLabels)}
                <button
                  type="button"
                  onClick={() => setLedgerFilter("targetType", undefined)}
                  aria-label="Quitar filtro de entidad"
                  className="cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  ✕
                </button>
              </span>
            )}
            {hasDateFilter && (
              <span className={FILTER_CHIP_CLASS}>
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

          {/* S4b: the nightly integrity report, surfaced for the first time.
          Read-only; failure ≠ empty (§34). */}
          <IntegritySection
            isLoading={integrityQuery.isLoading}
            error={integrityQuery.error}
            alerts={integrityQuery.data?.alerts ?? []}
            onRetry={() => integrityQuery.refetch()}
          />

          {/* §30: error explains impact + meaningful retry, preserves filters */}
          {ledgerQuery.error && (
            <Alert variant="destructive">
              <AlertDescription className="flex flex-wrap items-center gap-3">
                <span>
                  {getApiErrorMessage(
                    ledgerQuery.error,
                    "No pudimos cargar el registro del mostrador. El registro en tus terminales no se vio afectado.",
                  )}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => ledgerQuery.refetch()}
                  className="gap-1.5"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  Reintentar
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {ledgerQuery.isLoading ? (
            <LoadingState message="Cargando el registro del mostrador..." />
          ) : !ledgerQuery.error && ledgerEntries.length === 0 ? (
            isLedgerFiltered ? (
              /* §13.2/§29: filtered empty ≠ no data — show the filters + reset */
              <EmptyState
                message="No hay entradas del mostrador con estos filtros."
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      updateParams((p) => {
                        p.delete("actorUserId");
                        p.delete("targetType");
                        p.delete("startDate");
                        p.delete("endDate");
                      });
                    }}
                  >
                    Ver todas las entradas
                  </Button>
                }
              />
            ) : (
              /* §29 first-use empty: what belongs here, why it matters */
              <EmptyState
                icon={
                  <History className="h-6 w-6 stroke-[1.5]" aria-hidden="true" />
                }
                title="Todavía no hay entradas del mostrador"
                message="Cuando el POS anule una factura, emita una nota de crédito o abra la gaveta, cada acción quedará registrada aquí con quién la hizo, desde qué terminal y su nivel de riesgo."
              />
            )
          ) : (
            ledgerEntries.length > 0 && (
              <>
                {/* §28.3: refetch keeps valid data visible, no full-page reset */}
                {ledgerQuery.isRefetching && (
                  <p className="text-xs text-muted-foreground" role="status">
                    Actualizando…
                  </p>
                )}
                <LedgerTable entries={ledgerEntries} />
                {ledgerQuery.data?.truncated ? (
                  /* §15 honest truncation: the API's own `truncated` flag
                  drives the notice — the page never implies completeness. */
                  <p
                    className="text-xs text-muted-foreground"
                    aria-live="polite"
                  >
                    Mostrando las {EVENTS_PAGE_LIMIT} entradas más recientes
                    del mostrador — puede haber más registros.
                  </p>
                ) : (
                  <p
                    className="text-xs text-muted-foreground"
                    aria-live="polite"
                  >
                    Mostrando {ledgerEntries.length}{" "}
                    {ledgerEntries.length === 1 ? "entrada" : "entradas"}
                  </p>
                )}
              </>
            )
          )}
        </>
      )}
    </div>
  );
}
