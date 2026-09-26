/**
 * Dashboard V2 executive KPI strip (Batch 4).
 *
 * Authority:
 * - docs/dashboard/owner_dashboard_v2_prd_v1.0.md §§10.2 (FR-KPI-01..05),
 *   9.5 (zero base -> em-dash), 12 (FR-FISCAL-01..04), 23 (states)
 * - docs/dashboard/ui_wireframe_reference.md §1/§2: 4-card Cuota Fija matrix,
 *   conditional 5th IVA slot for Régimen General, non-destructive fiscal
 *   warning for unknown configuration.
 *
 * Comparison labels live here (rendering concern), derived from the resolver
 * output — never from the domain module.
 */
import { useDashboardKpis } from "./use-dashboard-kpis";
import { useCanViewInventoryCost } from "@/features/auth/permissions";
import type { ComparisonPeriod, LocalDateRange } from "./domain/comparison-period";

const MS_PER_DAY = 86_400_000;

function toUtcMs(localDate: string): number {
  const parts = localDate.split("-").map(Number);
  const [y = 0, m = 1, d = 1] = parts;
  return Date.UTC(y, m - 1, d);
}

function weekdayName(localDate: string): string {
  return new Intl.DateTimeFormat("es-NI", { weekday: "long", timeZone: "UTC" }).format(
    new Date(toUtcMs(localDate)),
  );
}

/**
 * Comparison label derived from the resolver output: "vs ayer" when the
 * previous single day immediately precedes the current single day,
 * "vs <weekday> anterior" for the single-day same-weekday rule (PRD §9.3),
 * and a neutral label for any other shape. Internal to the strip: labels are
 * a rendering concern and the strip spec derives them independently.
 */
function comparisonLabel(period: ComparisonPeriod): string {
  const singleDay = period.currentStart === period.currentEnd;
  const prevSingle = period.previousStart === period.previousEnd;
  if (!singleDay || !prevSingle) return "vs periodo anterior";
  const gapDays = (toUtcMs(period.currentStart) - toUtcMs(period.previousEnd)) / MS_PER_DAY;
  if (gapDays === 1) return "vs ayer";
  if (gapDays === 7) return `vs ${weekdayName(period.previousStart)} anterior`;
  return "vs periodo anterior";
}

function formatSigned(value: number, unit: string, decimals = 1): string {
  const magnitude = Math.abs(value).toFixed(decimals);
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${magnitude}${unit}`;
}

function DeltaLine({ delta, unit = "%", label }: { delta: number | null; unit?: string; label: string }) {
  if (delta === null) {
    return (
      <p className="mt-2 text-sm text-muted-foreground" title="Sin base comparable">
        <span aria-hidden="true">—</span> Sin base comparable
      </p>
    );
  }
  const icon = delta > 0 ? "↑" : delta < 0 ? "↓" : "—";
  const color =
    delta > 0 ? "text-secondary" : delta < 0 ? "text-destructive" : "text-muted-foreground";
  return (
    <p className={`mt-2 flex items-center gap-1 text-sm font-medium ${color}`}>
      <span aria-hidden="true">{icon}</span>
      <span>{formatSigned(delta, unit)}</span>
      <span className="font-normal text-muted-foreground">{label}</span>
    </p>
  );
}

interface TileProps {
  label: string;
  value: string;
  delta: number | null;
  deltaUnit?: string;
  deltaLabel: string;
  subtitle?: string;
}

function Tile({ label, value, delta, deltaUnit = "%", deltaLabel, subtitle }: TileProps) {
  return (
    <div data-testid="kpi-tile" className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-3xl font-bold tabular-nums text-card-foreground">{value}</p>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      <DeltaLine delta={delta} unit={deltaUnit} label={deltaLabel} />
    </div>
  );
}

function SkeletonStrip() {
  return (
    <div data-testid="kpi-strip-skeleton" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-28 animate-pulse rounded-lg border border-border bg-muted/40" />
      ))}
    </div>
  );
}

function FiscalWarning() {
  return (
    <div
      data-testid="fiscal-warning"
      className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
    >
      <span>
        No se pudo confirmar el régimen fiscal del negocio, por lo que no se muestra el indicador
        de IVA.
      </span>
      <a href="/settings" className="font-semibold underline underline-offset-2">
        Configurar
      </a>
    </div>
  );
}

const CARD_GRID =
  "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4";

export interface KpiStripProps {
  /** Inclusive local calendar-day range (YYYY-MM-DD) selected on the page. */
  range: LocalDateRange;
  /** Injectable "today" (local YYYY-MM-DD) for deterministic tests. */
  today?: string;
}

export function KpiStrip({ range, today }: KpiStripProps) {
  // AG-06 / AC-17: cost visibility gate. Fail-closed until the backend
  // permission chain ships — only OWNER passes without an explicit grant.
  const canViewCost = useCanViewInventoryCost();
  const kpis = useDashboardKpis(range, today, { canViewCost });
  const label = comparisonLabel(kpis.period);

  if (kpis.isSalesPending && !kpis.snapshot) {
    return <SkeletonStrip />;
  }

  if (!kpis.snapshot) {
    return (
      <div
        data-testid="kpi-strip-error"
        className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
      >
        No se pudieron cargar los indicadores de ventas. El resto del dashboard sigue disponible.
      </div>
    );
  }

  const { snapshot } = kpis;
  const isEmpty = snapshot.netSalesNio === 0 && snapshot.completedTicketCount === 0;
  const emptyNote = isEmpty ? (
    <p className="text-xs text-muted-foreground">sin actividad registrada en este periodo</p>
  ) : null;

  const showIvaCard = kpis.fiscal?.regime === "REGIMEN_GENERAL";
  const showFiscalWarning = kpis.isFiscalFailed && !showIvaCard;

  return (
    <section aria-label="Indicadores ejecutivos" className="space-y-2">
      <div className={CARD_GRID}>
        <Tile
          label="Ventas Netas"
          value={formatCurrencyValue(snapshot.netSalesNio)}
          delta={snapshot.deltas.netSales}
          deltaLabel={label}
        />
        <Tile
          label="Tickets"
          value={String(snapshot.completedTicketCount)}
          delta={snapshot.deltas.tickets}
          deltaLabel={label}
        />
        <Tile
          label="Ticket Promedio"
          value={
            snapshot.averageTicketNetNio === null
              ? "—"
              : formatCurrencyValue(snapshot.averageTicketNetNio)
          }
          delta={snapshot.deltas.averageTicket}
          deltaLabel={label}
        />
        {/* AC-17: the cost/margin widget is omitted entirely for users
            without the cost grant — no placeholder, no leaked numerics. */}
        {canViewCost && (
          <Tile
            label="Margen Bruto"
            value={snapshot.margin ? `${snapshot.margin.percent.toFixed(1)}%` : "—"}
            delta={snapshot.deltas.marginPp}
            deltaUnit=" pp"
            deltaLabel={label}
            subtitle={snapshot.margin ? formatCurrencyValue(snapshot.margin.amount) : undefined}
          />
        )}
        {showIvaCard && (
          <Tile
            label="IVA generado"
            value={formatCurrencyValue(snapshot.totalTaxNio)}
            delta={snapshot.deltas.totalTax}
            deltaLabel={label}
          />
        )}
      </div>
      {showFiscalWarning && <FiscalWarning />}
      {emptyNote}
    </section>
  );
}

function formatCurrencyValue(amount: number): string {
  return new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency: "NIO",
    minimumFractionDigits: 2,
  }).format(amount);
}
