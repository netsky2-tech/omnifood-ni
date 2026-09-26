import type {
  SyncFreshnessResponse,
  SyncFreshnessState,
} from "@/features/dashboard/dashboard-api";

export interface FreshnessBadgeProps {
  /** Real sync-freshness read model (PRD §20). Null/undefined → legacy fallback. */
  freshness?: SyncFreshnessResponse | null;
  /** Report generation time — technical metadata only (PRD FR-SYNC-04). */
  generatedAt?: string;
  isLoading?: boolean;
}

/**
 * PRD §20 / ui_wireframe_reference.md §3 #2: color is never the only signal —
 * every state carries its own explicit text.
 */
const STATE_DOT: Record<SyncFreshnessState, string> = {
  COMPLETE: "bg-emerald-500",
  STALE: "bg-amber-500",
  PARTIAL: "bg-rose-500",
  UNKNOWN: "bg-slate-400",
};

function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString("es-NI", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Managua",
    });
  } catch {
    return isoString;
  }
}

/** Newest confirmed receipt watermark across terminals (the sync heartbeat). */
function latestReceiptAt(freshness: SyncFreshnessResponse): string | null {
  let latest: string | null = null;
  for (const terminal of freshness.perTerminal) {
    if (terminal.lastReceiptAt && (!latest || terminal.lastReceiptAt > latest)) {
      latest = terminal.lastReceiptAt;
    }
  }
  return latest;
}

function freshnessText(freshness: SyncFreshnessResponse): string {
  switch (freshness.state) {
    case "COMPLETE": {
      // A quiet store with no watermark times stays COMPLETE with no time
      // claims (AC-09A: lack of business activity is not staleness).
      const complete = freshness.lastCompleteAt
        ? `Datos completos hasta ${formatTime(freshness.lastCompleteAt)}`
        : "Datos completos";
      const heartbeat = latestReceiptAt(freshness);
      return heartbeat
        ? `${complete} · sync ${formatTime(heartbeat)}`
        : complete;
    }
    case "STALE": {
      const base = `Sincronización demorada (>${freshness.thresholdMinutes} min)`;
      return freshness.lastCompleteAt
        ? `${base} · hasta ${formatTime(freshness.lastCompleteAt)}`
        : base;
    }
    case "PARTIAL": {
      const incomplete = freshness.perTerminal.filter(
        (t) => t.state !== "COMPLETE",
      ).length;
      return incomplete === 1
        ? "Sincronización parcial (1 terminal incompleto)"
        : `Sincronización parcial (${incomplete} terminales incompletos)`;
    }
    case "UNKNOWN":
      return "Estado de sincronización desconocido";
  }
}

function Badge({
  dot,
  state,
  title,
  children,
}: {
  dot: string;
  state: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      data-testid="freshness-badge"
      data-freshness-state={state}
      title={title}
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-muted-foreground"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {children}
    </span>
  );
}

export function FreshnessBadge({
  freshness,
  generatedAt,
  isLoading,
}: FreshnessBadgeProps) {
  if (!freshness) {
    // Legacy fallback (FR-SYNC-04): generatedAt as technical metadata only —
    // never labeled as a synchronization-freshness conclusion. While the
    // freshness query is in flight (isLoading) the dot is neutral, but the
    // text stays the legacy generatedAt caption so older consumers never see
    // a fabricated completeness claim.
    const time = generatedAt ? formatTime(generatedAt) : "—";
    return (
      <Badge
        dot={isLoading ? "bg-slate-400" : "bg-secondary"}
        state={"FALLBACK"}
      >
        Actualizado {time} (CST)
      </Badge>
    );
  }

  const caption = generatedAt
    ? `Reporte generado: ${formatTime(generatedAt)}`
    : null;

  return (
    <span className="inline-flex items-center gap-2">
      <Badge
        dot={STATE_DOT[freshness.state]}
        state={freshness.state}
        title={caption ?? undefined}
      >
        {freshnessText(freshness)}
      </Badge>
      {caption && (
        <span className="text-xs text-muted-foreground">{caption}</span>
      )}
    </span>
  );
}
