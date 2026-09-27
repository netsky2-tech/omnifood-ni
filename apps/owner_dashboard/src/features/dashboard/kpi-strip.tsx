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
import type { MarginGate } from "./dashboard-types";
import { useCanViewInventoryCost } from "@/features/auth/permissions";
import type { ComparisonPeriod, LocalDateRange } from "./domain/comparison-period";
import type { InventoryCoverageReasonCode } from "@/features/inventory/inventory-types";

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
  /** Grid span classes for the reflowing matrix (see CARD_GRID_BY_COUNT). */
  spanClass?: string;
  /**
   * Quiet status note that replaces the delta line (review round 2 P0 #4:
   * the gated "Sin costo" state). Present → no delta line is rendered.
   */
  note?: string;
}

function Tile({ label, value, delta, deltaUnit = "%", deltaLabel, subtitle, spanClass, note }: TileProps) {
  return (
    <div
      data-testid="kpi-tile"
      className={`rounded-lg border border-border bg-card p-5 shadow-sm ${spanClass ?? ""}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-3xl font-bold tabular-nums text-card-foreground">{value}</p>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      {note !== undefined ? (
        <p className="mt-2 text-sm text-muted-foreground" data-testid="kpi-margin-note">
          <span aria-hidden="true">—</span> {note}
        </p>
      ) : (
        <DeltaLine delta={delta} unit={deltaUnit} label={deltaLabel} />
      )}
    </div>
  );
}

function SkeletonStrip() {
  // While pending, the matrix shape is genuinely unknown (3, 4 or 5 tiles), so
  // the skeleton uses the 4-tile grid — the modal case — and never promises a
  // width the settled strip may not keep.
  return (
    <div data-testid="kpi-strip-skeleton" className={CARD_GRID_BY_COUNT[4]}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-28 animate-pulse rounded-lg border border-border bg-muted/40" />
      ))}
    </div>
  );
}

/**
 * "Sin costo" note copy (review round 2 P0 #4), keyed to the backend
 * coverage reason codes and resolved in backend emission order (first known
 * code wins — MISSING_INVENTORY_IMPACT and NO_EXPLICIT_INSUMO_MAPPING lead
 * the list server-side). Quiet and actionable: it points at insumo mapping,
 * terminal priming, or purchase-cost recording when that is the real fix.
 * A raw reason-code string is never rendered; unknown/empty codes degrade to
 * the generic copy.
 */
const MARGIN_NOTE_BY_REASON: Record<InventoryCoverageReasonCode, string> = {
  NO_EXPLICIT_INSUMO_MAPPING:
    "Sin costo: hay productos sin insumos mapeados. Mapea los insumos del producto para incluir su costo.",
  MISSING_INVENTORY_IMPACT:
    "Sin costo: el impacto de inventario de algunas ventas está pendiente. Sincroniza el terminal para completarlo.",
  MISSING_COST_BASIS:
    "Sin costo: algunas ventas no tienen costo registrado en inventario.",
  // WU12: the movement chain is intact — the insumo simply has no purchase
  // cost yet (averageCost defaults to 0). The fix is recording purchases.
  ZERO_COST_BASIS:
    "Sin costo: algunos insumos todavía no tienen costo de compra registrado. Registra el costo de compra de esos insumos para calcular el margen.",
  UNRESOLVED_SOURCE_DOCUMENT:
    "Sin costo: no se pudo resolver el documento de origen de algunas ventas.",
  INCOMPLETE_SYNC:
    "Sin costo: faltan datos de inventario por sincronizar.",
};

function marginGateNote(reasonCodes: InventoryCoverageReasonCode[]): string {
  const known = reasonCodes.find((code) =>
    Object.prototype.hasOwnProperty.call(MARGIN_NOTE_BY_REASON, code),
  );
  return (
    (known && MARGIN_NOTE_BY_REASON[known]) ||
    "Sin costo: no hay datos de costo suficientes para este periodo."
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

// G3 (FR-KPI-05 / wireframe §2): the executive matrix is dynamic — 3, 4 or 5
// tiles depending on the AC-17 cost gate and the fiscal regime — so a fixed
// track count leaves an empty column at 3 tiles and an orphaned wrapped tile
// at 5.
//
// `repeat(auto-fit, minmax(floor, 1fr))` does NOT solve the 5-tile case: auto-fit
// only collapses tracks that are empty across the whole grid, and once row 1
// fills four columns those tracks stay open, so the 5th tile wraps alone into a
// quarter-width slot. The real constraint is arithmetic: with the sidebar
// expanded (260px) and the shell's `lg:p-8` (64px), the strip is ~700px wide at
// a 1024px viewport, and five 10rem tracks plus gaps need 864px. Five equal
// tracks would fit only by shrinking every card to ~132px, which clips
// `C$48,520.50` at text-3xl.
//
// So the lg band uses a 6-column field, whose divisors admit both a 3-up and a
// 2-up row. Five tiles lay out [2,2,2] + [3,3]: row 1 = 6 tracks, row 2 = 6
// tracks, every cell filled, no orphan and no hole, at legible card widths. At
// xl (1280px → ~956px strip) five equal tracks fit, which is the single-row
// matrix the wireframe §2 draws. Three and four tiles divide their own track
// count exactly and need no spans.
const CARD_GRID_BY_COUNT: Record<3 | 4 | 5, string> = {
  3: "grid grid-cols-1 gap-4 sm:grid-cols-3",
  4: "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4",
  5: "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6 xl:grid-cols-5",
};

/**
 * Column spans for the 6-track lg layout, used by the 5-tile matrix only;
 * every other matrix divides evenly and needs none. These are complete literal
 * class strings on purpose: Tailwind generates a utility only for a class name
 * it can see verbatim in the source, so an interpolated `col-span-${n}` would
 * silently emit no CSS and the layout would collapse back to one track each.
 * lg assigns the 6-track balance; xl resets to a single track per tile so the
 * five-card matrix returns to the wireframe's single row.
 */
const FIVE_TILE_SPANS = [
  "lg:col-span-2 xl:col-span-1",
  "lg:col-span-2 xl:col-span-1",
  "lg:col-span-2 xl:col-span-1",
  "lg:col-span-3 xl:col-span-1",
  "lg:col-span-3 xl:col-span-1",
] as const;

function tileSpanClass(count: 3 | 4 | 5, index: number): string {
  if (count !== 5) return "";
  // The caller renders exactly the tiles this table is defined for, but the
  // lookup is kept total so an out-of-range index degrades to "no span"
  // instead of pushing undefined into className.
  return FIVE_TILE_SPANS[index] ?? "";
}

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

  // G4: while the sales ranges are loading the shape is undetermined, and
  // when sales data is present but the fiscal regime query is still in flight
  // the final matrix could be 4 or 5 tiles — hold the non-committal skeleton
  // so the executive matrix settles once instead of flashing a Cuota-Fija
  // -shaped strip that reshuffles to 5. A fiscal FAILURE is not pending: it
  // falls through to the 4-tile matrix plus FiscalWarning (FR-FISCAL-04).
  if (kpis.isSalesPending || (kpis.snapshot !== null && kpis.isFiscalPending)) {
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
  // Review round 2 P0 #4: trust gate for the margin tile. The real hook
  // always supplies it; the fallback keeps stale partial consumers (test
  // mocks) on the safe pre-coverage rendering instead of crashing.
  const marginGate: MarginGate = kpis.marginGate ?? {
    ratio: false,
    delta: false,
    amount: false,
    gated: false,
    reasonCodes: [],
  };
  const isEmpty = snapshot.netSalesNio === 0 && snapshot.completedTicketCount === 0;
  const emptyNote = isEmpty ? (
    <p className="text-xs text-muted-foreground">sin actividad registrada en este periodo</p>
  ) : null;

  const showIvaCard = kpis.fiscal?.regime === "REGIMEN_GENERAL";
  const showFiscalWarning = kpis.isFiscalFailed && !showIvaCard;

  // The matrix is built as a list so the grid can reflow to the real tile
  // count (G3). Order is product-defined, never response-order-dependent
  // (PRD FR-KPI-05).
  const tiles: TileProps[] = [
    {
      label: "Ventas Netas",
      value: formatCurrencyValue(snapshot.netSalesNio),
      delta: snapshot.deltas.netSales,
      deltaLabel: label,
    },
    {
      label: "Tickets",
      value: String(snapshot.completedTicketCount),
      delta: snapshot.deltas.tickets,
      deltaLabel: label,
    },
    {
      label: "Ticket Promedio",
      value:
        snapshot.averageTicketNetNio === null
          ? "—"
          : formatCurrencyValue(snapshot.averageTicketNetNio),
      delta: snapshot.deltas.averageTicket,
      deltaLabel: label,
    },
    // AC-17: the cost/margin widget is omitted entirely for users
    // without the cost grant — no placeholder, no leaked numerics.
    // Review round 2 P0 #4: the ratio renders only on COMPLETE inventory
    // coverage (a COGS of C$0 with uncosted sales is never a 100% margin);
    // the amount stays on PARTIAL and hides on UNAVAILABLE/unknown. A gated
    // tile KEEPS its slot — only the AC-17 gate changes the tile count.
    ...(canViewCost
      ? [
          {
            label: "Margen Bruto",
            value:
              marginGate.ratio && snapshot.margin
                ? `${snapshot.margin.percent.toFixed(1)}%`
                : "—",
            delta: marginGate.delta ? snapshot.deltas.marginPp : null,
            deltaUnit: " pp",
            deltaLabel: label,
            subtitle:
              marginGate.amount && snapshot.margin
                ? formatCurrencyValue(snapshot.margin.amount)
                : undefined,
            note: marginGate.gated
              ? marginGateNote(marginGate.reasonCodes)
              : undefined,
          },
        ]
      : []),
    // FR-FISCAL-02/03: the IVA slot exists only for Regimen General; an
    // unknown or failed regime never fabricates the tile.
    ...(showIvaCard
      ? [
          {
            label: "IVA generado",
            value: formatCurrencyValue(snapshot.totalTaxNio),
            delta: snapshot.deltas.totalTax,
            deltaLabel: label,
          },
        ]
      : []),
  ];
  const gridCount = tiles.length as 3 | 4 | 5;

  return (
    <section aria-label="Indicadores ejecutivos" className="space-y-2">
      <div data-testid="kpi-strip-grid" className={CARD_GRID_BY_COUNT[gridCount]}>
        {tiles.map((tile, index) => (
          <Tile
            key={tile.label}
            {...tile}
            spanClass={tileSpanClass(gridCount, index)}
          />
        ))}
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
