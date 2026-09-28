/**
 * Shared card shell for the performance-band chart widgets (Batch 5b).
 *
 * Keeps every widget visually consistent with the KPI strip (PRD §25: NHILOS
 * tokens, tabular figures) and centralizes the §24 drill-down link, which is
 * navigation-only (never mutation).
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function ChartCard({
  title,
  testId,
  to = "/sales",
  showLink = true,
  linkLabel = "Ver →",
  linkAriaLabel,
  children,
}: {
  title: string;
  /** data-testid prefix for the card container. */
  testId: string;
  /** §24 drill-down destination (navigation only). */
  to?: string;
  showLink?: boolean;
  linkLabel?: string;
  linkAriaLabel?: string;
  children: ReactNode;
}) {
  return (
    <div data-testid={testId} className="flex flex-col rounded-lg border border-border bg-card p-5 shadow-sm">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-card-foreground">{title}</h3>
        {showLink && (
          <Link
            to={to}
            aria-label={linkAriaLabel ?? `${linkLabel} ${title}`}
            className="rounded text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2"
          >
            {linkLabel}
          </Link>
        )}
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}

export function WidgetSkeleton({ testId }: { testId: string }) {
  return <div data-testid={testId} className="h-44 animate-pulse rounded-md bg-muted/40" />;
}

export function WidgetError({ testId, message }: { testId: string; message: string }) {
  return (
    <div
      data-testid={testId}
      // NHILOS §21 readable contrast: plain text-destructive on the 10 %
      // destructive tint is 4.13:1 — fails AA for this text-xs copy; red-700
      // on the same tint is 5.54:1 and stays semantic red.
      className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-red-700"
      role="alert"
    >
      {message}
    </div>
  );
}

export function EmptyNote({ testId, children }: { testId: string; children: ReactNode }) {
  return (
    <p
      data-testid={testId}
      className="flex h-44 items-center justify-center text-center text-sm text-muted-foreground"
    >
      {children}
    </p>
  );
}
