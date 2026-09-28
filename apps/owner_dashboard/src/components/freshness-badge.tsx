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
  /**
   * Injectable clock used to prove "current local day" claims. Defaults to
   * `new Date()`; tests pin the Managua day boundary deterministically.
   */
  now?: Date;
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

const TIME_ZONE = "America/Managua";

/** Calendar-day key (YYYY-MM-DD) in the same zone the clock time uses. */
const DAY_KEY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatClockTime(isoString: string): string {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString;
  return d.toLocaleTimeString("es-NI", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  });
}

/**
 * Watermark formatter: compact clock time only when the instant is provably
 * on the viewer's current Managua calendar day (injected clock); full
 * date + time otherwise. A time-only claim across days reads as same-day —
 * on a completeness widget that is a false sense of freshness.
 */
function formatWatermark(isoString: string, now: Date): string {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString;
  const dayKey = DAY_KEY_FORMAT.format(d);
  if (dayKey === DAY_KEY_FORMAT.format(now)) {
    return formatClockTime(isoString);
  }
  const day = d.toLocaleString("es-NI", { day: "numeric", timeZone: TIME_ZONE });
  const month = d.toLocaleString("es-NI", { month: "short", timeZone: TIME_ZONE });
  return `${day} ${month}, ${formatClockTime(isoString)}`;
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

function freshnessText(freshness: SyncFreshnessResponse, now: Date): string {
  switch (freshness.state) {
    case "COMPLETE": {
      // A quiet store with no watermark times stays COMPLETE with no time
      // claims (AC-09A: lack of business activity is not staleness).
      const complete = freshness.lastCompleteAt
        ? `Datos completos hasta ${formatWatermark(freshness.lastCompleteAt, now)}`
        : "Datos completos";
      const heartbeat = latestReceiptAt(freshness);
      return heartbeat
        ? `${complete} · sync ${formatWatermark(heartbeat, now)}`
        : complete;
    }
    case "STALE": {
      const base = `Sincronización demorada (>${freshness.thresholdMinutes} min)`;
      return freshness.lastCompleteAt
        ? `${base} · hasta ${formatWatermark(freshness.lastCompleteAt, now)}`
        : base;
    }
    case "PARTIAL": {
      const incomplete = freshness.perTerminal.filter(
        (t) => t.state !== "COMPLETE",
      ).length;
      return incomplete === 1
        ? "Información parcial (1 terminal con datos pendientes)"
        : `Información parcial (${incomplete} terminales con datos pendientes)`;
    }
    case "UNKNOWN":
      return "No se puede verificar la completitud de los datos";
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
      // NHILOS §21 readable contrast: text-muted-foreground on bg-muted is
      // 4.34:1 — fails AA for this text-xs caption; slate-600 on the same
      // surface is 6.92:1.
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-slate-600"
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
  now: injectedNow,
}: FreshnessBadgeProps) {
  const now = injectedNow ?? new Date();

  if (!freshness) {
    // Legacy fallback (FR-SYNC-04): generatedAt as technical metadata only —
    // never labeled as a synchronization-freshness conclusion. While the
    // freshness query is in flight (isLoading) the dot is neutral, but the
    // text stays the legacy generatedAt caption so older consumers never see
    // a fabricated completeness claim. No hardcoded zone abbreviation: the
    // timestamp itself carries the date when it is not the current day.
    const time = generatedAt ? formatWatermark(generatedAt, now) : "—";
    return (
      <Badge
        dot={isLoading ? "bg-slate-400" : "bg-secondary"}
        state={"FALLBACK"}
      >
        Actualizado {time}
      </Badge>
    );
  }

  const caption = generatedAt
    ? `Reporte generado: ${formatWatermark(generatedAt, now)}`
    : null;

  return (
    <span className="inline-flex items-center gap-2">
      <Badge
        dot={STATE_DOT[freshness.state]}
        state={freshness.state}
        title={caption ?? undefined}
      >
        {freshnessText(freshness, now)}
      </Badge>
      {caption && (
        <span className="text-xs text-muted-foreground">{caption}</span>
      )}
    </span>
  );
}
