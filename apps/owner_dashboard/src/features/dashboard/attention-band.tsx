/**
 * AttentionBand — Dashboard V2 Batch 6b "Atención Requerida" section
 * (PRD §19, §24; wireframe ui_wireframe_reference.md §1: 2:1 pairing to the
 * right of the sales trend).
 *
 * Isolation contract (FR-STATE-04/05): every signal owns its query state; a
 * failing signal degrades to a per-signal notice while the rest of the
 * section (and the page) keeps working. The healthy banner ("✓ Todo en
 * orden") only renders when every signal settled successfully and none is
 * critical or warning — a failed signal can never be asserted as healthy.
 */
import { Link } from "react-router-dom";
import {
  compareAttentionItems,
  useAttentionSignals,
  type AttentionItem,
  type AttentionSeverity,
} from "./use-attention-signals";
import type { LocalDateRange } from "./domain/comparison-period";

const SEVERITY_GLYPH: Record<AttentionSeverity, string> = {
  critical: "●",
  warning: "▲",
  info: "✓",
};

const SEVERITY_TEXT: Record<AttentionSeverity, string> = {
  critical: "text-destructive",
  warning: "text-amber-600 dark:text-amber-400",
  info: "text-muted-foreground",
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
      <Link
        to={item.href}
        data-testid={`attention-link-${item.key}`}
        className="mt-0.5 shrink-0 text-xs font-semibold text-primary underline-offset-2 hover:underline"
      >
        Ver →
      </Link>
    </li>
  );
}

export interface AttentionBandProps {
  /** Inclusive local calendar-day range (YYYY-MM-DD) selected on the page. */
  range: LocalDateRange;
}

export function AttentionBand({ range }: AttentionBandProps) {
  const signals = useAttentionSignals(range);

  const isPending = signals.some((s) => s.status === "pending");
  const hasErrors = signals.some((s) => s.status === "error");
  const items = signals
    .flatMap((s) => (s.item ? [s.item] : []))
    .sort(compareAttentionItems);
  const hasCriticalOrWarning = items.some(
    (i) => i.severity === "critical" || i.severity === "warning",
  );

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

      {!isPending && !hasErrors && !hasCriticalOrWarning && (
        <p
          data-testid="attention-healthy"
          className="mt-3 text-sm font-medium text-secondary"
        >
          <span aria-hidden="true">✓</span> Todo en orden
        </p>
      )}
    </section>
  );
}
