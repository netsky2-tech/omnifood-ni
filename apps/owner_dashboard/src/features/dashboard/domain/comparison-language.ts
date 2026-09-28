/**
 * Centralized human comparison language utility for Dashboard V2.
 *
 * Authority:
 * - docs/nhilos/owner_dashboard_experience_standard_v1.0.md §10 & §27.4
 *
 * Principles:
 * - Minimize interpretation effort by naming the actual comparison rule.
 * - Single-day consecutive: "vs ayer"
 * - Single-day same weekday (7 days earlier): "vs <weekday> anterior" (e.g. "vs sábado anterior")
 * - 7 days range: "vs 7 días anteriores"
 * - 30 days range: "vs 30 días anteriores"
 * - Same month elapsed period: "vs mismo período del mes anterior"
 * - Fallback: "vs periodo anterior"
 */
import type { ComparisonPeriod } from "./comparison-period";

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

function rangeDays(start: string, end: string): number {
  return Math.round((toUtcMs(end) - toUtcMs(start)) / MS_PER_DAY) + 1;
}

/**
 * Returns human-readable comparison label reflecting the comparison period semantics.
 */
export function formatHumanComparisonLabel(period: ComparisonPeriod): string {
  const isCurrentSingleDay = period.currentStart === period.currentEnd;
  const isPreviousSingleDay = period.previousStart === period.previousEnd;

  if (isCurrentSingleDay && isPreviousSingleDay) {
    const gapDays = (toUtcMs(period.currentStart) - toUtcMs(period.previousEnd)) / MS_PER_DAY;
    if (gapDays === 1) {
      return "vs ayer";
    }
    if (gapDays === 7) {
      return `vs ${weekdayName(period.previousStart)} anterior`;
    }
    return "vs periodo anterior";
  }

  const currentDuration = rangeDays(period.currentStart, period.currentEnd);
  const previousDuration = rangeDays(period.previousStart, period.previousEnd);

  if (currentDuration === 7 && previousDuration === 7) {
    return "vs 7 días anteriores";
  }

  if (currentDuration === 30 && previousDuration === 30) {
    return "vs 30 días anteriores";
  }

  // Month comparison heuristic: previous range starts on the 1st of a previous month
  const curStartParts = period.currentStart.split("-").map(Number);
  const prevStartParts = period.previousStart.split("-").map(Number);
  if (curStartParts[2] === 1 && prevStartParts[2] === 1) {
    return "vs mismo período del mes anterior";
  }

  return "vs periodo anterior";
}
