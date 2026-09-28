/**
 * AttentionBand — Dashboard V2 Batch 6b "Atención Requerida" section
 * (PRD §19, §24; wireframe ui_wireframe_reference.md §1: 2:1 pairing to the
 * right of the sales trend).
 *
 * Isolation contract (FR-STATE-04/05): every signal owns its query state; a
 * failing signal degrades to a per-signal notice while the rest of the
 * section (and the page) keeps working. The panel is exceptions-only
 * (PRD §19): it renders only actionable exception rows and hides entirely
 * when every ready signal is healthy — there is no "todo bien" card. A
 * failed signal is never presented as healthy: while any signal has errored,
 * the panel stays mounted with its error rows, even with zero exceptions.
 *
 * Each row carries a quiet temporal-scope chip (`Actual` for current-state
 * signals, `Período` for signals scoped to the selected page range) so the
 * owner can tell the two time scopes apart. The chip is textual and muted —
 * never color-only (PRD §28) — and must not compete with the severity glyph.
 */
import { Link } from "react-router-dom";
import {
  compareAttentionItems,
  useAttentionSignals,
  type AttentionItem,
  type AttentionScope,
  type AttentionSeverity,
  type AttentionSignal,
} from "./use-attention-signals";
import type { LocalDateRange } from "./domain/comparison-period";

const SEVERITY_GLYPH: Record<AttentionSeverity, string> = {
  critical: "●",
  warning: "▲",
  info: "✓",
};

const SEVERITY_TEXT: Record<AttentionSeverity, string> = {
  critical: "text-destructive",
  // NHILOS §21 readable contrast: amber-600 is 3.19:1 on the card surface —
  // fails AA for small text; amber-700 is 5.02:1 and stays semantic.
  warning: "text-amber-700 dark:text-amber-300",
  info: "text-muted-foreground",
};

const SCOPE_LABELS: Record<AttentionScope, string> = {
  current: "Actual",
  period: "Período",
};

function AttentionRow({ item }: { item: AttentionItem }) {
  return (
    <li
      data-testid={`attention-item-${item.key}`}
      data-severity={item.severity}
      className="flex items-start justify-between gap-2 text-sm"
    >
      <span className="flex items-start gap-2">
        <span
          aria-hidden="true"
          className={`shrink-0 font-semibold ${SEVERITY_TEXT[item.severity]}`}
        >
          {SEVERITY_GLYPH[item.severity]}
        </span>
        <span>
          <span className={`font-medium ${SEVERITY_TEXT[item.severity]}`}>
            {item.label}
          </span>
          <span className="block text-xs text-muted-foreground">{item.detail}</span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        <span
          data-testid={`attention-scope-${item.key}`}
          title="Alcance temporal de la señal"
          className="rounded border border-border px-1 py-px text-[10px] uppercase tracking-wide text-muted-foreground"
        >
          {SCOPE_LABELS[item.scope]}
        </span>
        <Link
          to={item.href}
          data-testid={`attention-link-${item.key}`}
          aria-label={`${item.actionLabel} de ${item.label}`}
          className="rounded text-xs font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2 whitespace-nowrap"
        >
          {item.actionLabel} →
        </Link>
      </span>
    </li>
  );
}

export interface AttentionBandProps {
  /** Inclusive local calendar-day range (YYYY-MM-DD) selected on the page. */
  range: LocalDateRange;
  /** Optional pre-resolved attention signals for layout coordination. */
  signals?: AttentionSignal[];
}

export function AttentionBand({ range, signals: providedSignals }: AttentionBandProps) {
  const queriedSignals = useAttentionSignals(range);
  const signals = providedSignals ?? queriedSignals;

  const isPending = signals.some((s) => s.status === "pending");
  const hasErrors = signals.some((s) => s.status === "error");
  const items = signals
    .flatMap((s) => (s.item ? [s.item] : []))
    .sort(compareAttentionItems);

  // Zero exceptions and nothing failed → no panel at all. While a signal is
  // still pending the panel stays (loading skeleton); while any signal has
  // errored the panel stays with its error rows — a failed signal must never
  // be presented as healthy (FR-STATE-04/05).
  if (!isPending && items.length === 0 && !hasErrors) {
    return null;
  }

  return (
    <section
      aria-label="Atención requerida"
      data-testid="attention-band"
      className="rounded-lg border border-border bg-card p-5 shadow-sm"
    >
      <h2 className="text-lg font-semibold text-card-foreground">
        Atención Requerida
      </h2>

      {isPending && (
        <div data-testid="attention-loading" className="mt-3 space-y-2" aria-hidden="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-5 animate-pulse rounded bg-muted/40"
            />
          ))}
        </div>
      )}

      {items.length > 0 && (
        <ul className="mt-3 space-y-2.5">
          {items.map((item) => (
            <AttentionRow key={item.key} item={item} />
          ))}
        </ul>
      )}

      {!isPending && (
        <div className="mt-2 space-y-1">
          {signals
            .filter((s) => s.status === "error")
            .map((s) => (
              <p
                key={s.key}
                data-testid={`attention-error-${s.key}`}
                className="text-xs text-muted-foreground"
              >
                ⚠ No se pudo cargar: {s.label}
              </p>
            ))}
        </div>
      )}
    </section>
  );
}
