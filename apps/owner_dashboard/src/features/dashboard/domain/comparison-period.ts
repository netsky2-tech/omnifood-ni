/**
 * Pure comparison-period resolver for Dashboard V2.
 *
 * Authority:
 * - docs/dashboard/owner_dashboard_v2_architecture_spec_v0.3.md §6.3
 * - docs/dashboard/owner_dashboard_v2_prd_v1.0.md §9
 *
 * Semantics (PRD §9.3):
 * - single-day range  -> same weekday one week earlier (-7 days);
 * - multi-day range   -> immediately preceding equal-duration range;
 * - month-to-date     -> same elapsed days of the previous month, clamped
 *                        to that month's calendar (PRD §9.4: Mar 31 -> Feb 28/29);
 * - year-to-date      -> same elapsed range of the previous year, clamped
 *                        (Feb 29 -> Feb 28 of a non-leap year).
 *
 * All inputs and outputs are inclusive local calendar days in
 * America/Managua serialized as `YYYY-MM-DD` (PRD §9.4). The backend remains
 * the authority for converting these local ranges to UTC query boundaries.
 *
 * The previous range is constructed to end strictly before the current range
 * starts, so it never overlaps the current range.
 *
 * PRD §9.5 (zero previous -> show absolute value, comparison `—`, never a
 * fake `+100%`) is a rendering/delta concern: calendar resolution always
 * yields a non-empty previous range here, so delta code decides comparability
 * from data availability, not from this module.
 *
 * This module is pure data: no labels, no fetching, no React, no `Date.now`.
 */

/** A local calendar date string in strict `YYYY-MM-DD` format. */
export type LocalDate = string;

/** Dashboard V2 date preset identifiers (PRD §9.2). */
export type ComparisonPresetId =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "thisMonth"
  | "prevMonth"
  | "thisYear";

/** Inclusive local calendar-day range. */
export interface LocalDateRange {
  start: LocalDate;
  end: LocalDate;
}

/** Current and previous comparison ranges, inclusive and non-overlapping. */
export interface ComparisonPeriod {
  currentStart: LocalDate;
  currentEnd: LocalDate;
  previousStart: LocalDate;
  previousEnd: LocalDate;
}

interface YearMonthDay {
  y: number;
  m: number;
  d: number;
}

const PRESET_IDS: readonly ComparisonPresetId[] = [
  "today",
  "yesterday",
  "last7",
  "last30",
  "thisMonth",
  "prevMonth",
  "thisYear",
];

const MS_PER_DAY = 86_400_000;

function isPresetId(value: string): value is ComparisonPresetId {
  return (PRESET_IDS as readonly string[]).includes(value);
}

/** Serializes a year/month/day triple back to `YYYY-MM-DD`. */
function toLocalDate({ y, m, d }: YearMonthDay): LocalDate {
  const month = String(m).padStart(2, "0");
  const day = String(d).padStart(2, "0");
  return `${String(y).padStart(4, "0")}-${month}-${day}`;
}

/**
 * Parses and validates a `YYYY-MM-DD` local calendar date.
 * A UTC round-trip rejects malformed text (trailing newlines, wrong
 * separators) and impossible calendar dates such as `2029-02-30`.
 */
function parseLocalDate(value: unknown, label: string): YearMonthDay {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError(
      `${label} must be a local calendar date string in YYYY-MM-DD format, received ${JSON.stringify(value)}.`,
    );
  }
  const y = Number(value.slice(0, 4));
  const m = Number(value.slice(5, 7));
  const d = Number(value.slice(8, 10));
  const roundTrip = new Date(Date.UTC(y, m - 1, d));
  if (
    roundTrip.getUTCFullYear() !== y ||
    roundTrip.getUTCMonth() !== m - 1 ||
    roundTrip.getUTCDate() !== d ||
    toLocalDate({ y, m, d }) !== value
  ) {
    throw new TypeError(`${label} is not a valid calendar date: ${value}.`);
  }
  return { y, m, d };
}

/** Number of days in a calendar month (1-based month). */
function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function toUtcMs({ y, m, d }: YearMonthDay): number {
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): YearMonthDay {
  const date = new Date(ms);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
}

function addDays(date: YearMonthDay, days: number): YearMonthDay {
  return fromUtcMs(toUtcMs(date) + days * MS_PER_DAY);
}

function firstOfMonth(y: number, m: number): YearMonthDay {
  return { y, m, d: 1 };
}

/** Shifts a 1-based month by `delta` months, normalizing the year. */
function shiftMonth(y: number, m: number, delta: number): { y: number; m: number } {
  const total = y * 12 + (m - 1) + delta;
  return { y: Math.floor(total / 12), m: (total % 12) + 1 };
}

/** Clamps a day-of-month to the last valid day of the target month (PRD §9.4). */
function clampDay(y: number, m: number, d: number): YearMonthDay {
  return { y, m, d: Math.min(d, daysInMonth(y, m)) };
}

function compareDates(a: YearMonthDay, b: YearMonthDay): number {
  return toUtcMs(a) - toUtcMs(b);
}

/**
 * Previous range for a single-day current range: the same weekday one week
 * earlier (PRD §9.3 single-day rule).
 */
function previousSingleDay(date: YearMonthDay): LocalDateRange {
  const weekEarlier = addDays(date, -7);
  return { start: toLocalDate(weekEarlier), end: toLocalDate(weekEarlier) };
}

/**
 * Previous range for a multi-day current range: the immediately preceding
 * equal-duration range ending the day before the current range starts.
 */
function precedingEqualDuration(
  start: YearMonthDay,
  end: YearMonthDay,
): LocalDateRange {
  const durationDays = (toUtcMs(end) - toUtcMs(start)) / MS_PER_DAY + 1;
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(durationDays - 1));
  return { start: toLocalDate(prevStart), end: toLocalDate(prevEnd) };
}

function resolvePreset(
  preset: ComparisonPresetId,
  now: YearMonthDay,
): ComparisonPeriod {
  switch (preset) {
    case "today":
    case "yesterday": {
      const day = preset === "today" ? now : addDays(now, -1);
      const previous = previousSingleDay(day);
      const serialized = toLocalDate(day);
      return {
        currentStart: serialized,
        currentEnd: serialized,
        previousStart: previous.start,
        previousEnd: previous.end,
      };
    }
    case "last7": {
      const start = addDays(now, -6);
      const previous = precedingEqualDuration(start, now);
      return {
        currentStart: toLocalDate(start),
        currentEnd: toLocalDate(now),
        previousStart: previous.start,
        previousEnd: previous.end,
      };
    }
    case "last30": {
      const start = addDays(now, -29);
      const previous = precedingEqualDuration(start, now);
      return {
        currentStart: toLocalDate(start),
        currentEnd: toLocalDate(now),
        previousStart: previous.start,
        previousEnd: previous.end,
      };
    }
    case "thisMonth": {
      // Month-to-date: same elapsed days of the previous month, clamped.
      const previousMonth = shiftMonth(now.y, now.m, -1);
      const previousEnd = clampDay(previousMonth.y, previousMonth.m, now.d);
      return {
        currentStart: toLocalDate(firstOfMonth(now.y, now.m)),
        currentEnd: toLocalDate(now),
        previousStart: toLocalDate(
          firstOfMonth(previousMonth.y, previousMonth.m),
        ),
        previousEnd: toLocalDate(previousEnd),
      };
    }
    case "prevMonth": {
      // Complete previous calendar month, compared with the same elapsed
      // range of the month before it (clamped to that month's calendar).
      // Calendar-anchored (Nov 1–30 vs Oct 1–30) rather than the sliding
      // equal-duration window (which would compare against Oct 2–31),
      // mirroring the MTD rule: PRD §9.3 does not define complete-month
      // presets and month-over-month comparisons read as calendar months.
      // Flagged for product confirmation.
      const currentMonth = shiftMonth(now.y, now.m, -1);
      const beforeMonth = shiftMonth(now.y, now.m, -2);
      const elapsedDays = daysInMonth(currentMonth.y, currentMonth.m);
      const previousEnd = clampDay(beforeMonth.y, beforeMonth.m, elapsedDays);
      return {
        currentStart: toLocalDate(firstOfMonth(currentMonth.y, currentMonth.m)),
        currentEnd: toLocalDate(
          clampDay(currentMonth.y, currentMonth.m, elapsedDays),
        ),
        previousStart: toLocalDate(firstOfMonth(beforeMonth.y, beforeMonth.m)),
        previousEnd: toLocalDate(previousEnd),
      };
    }
    case "thisYear": {
      // Year-to-date: same elapsed range of the previous year, clamped.
      const previousYear = now.y - 1;
      return {
        currentStart: toLocalDate(firstOfMonth(now.y, 1)),
        currentEnd: toLocalDate(now),
        previousStart: toLocalDate(firstOfMonth(previousYear, 1)),
        previousEnd: toLocalDate(clampDay(previousYear, now.m, now.d)),
      };
    }
  }
}

/**
 * Resolves the current and previous comparison ranges for Dashboard V2.
 *
 * @param input a preset id (PRD §9.2) or an explicit inclusive local
 *   `YYYY-MM-DD` range. Presets follow PRD §9.3: single-day -> same weekday
 *   one week earlier; `last7`/`last30` -> trailing window including today
 *   with the immediately preceding equal-duration range; `thisMonth` -> MTD;
 *   `prevMonth` -> complete previous calendar month; `thisYear` -> YTD.
 * @param now injectable reference "today" as a local `YYYY-MM-DD` date
 *   (America/Managua calendar). Required; keeps this module deterministic
 *   and pure for tests.
 * @throws TypeError for an unknown preset, a malformed or impossible date,
 *   an inverted explicit range (`start` after `end`), or a malformed `now`.
 */
export function resolveComparisonPeriod(
  input: ComparisonPresetId | LocalDateRange,
  now: LocalDate,
): ComparisonPeriod {
  if (typeof input === "string") {
    if (!isPresetId(input)) {
      throw new TypeError(
        `Unknown comparison preset: ${JSON.stringify(input)}.`,
      );
    }
    const referenceNow = parseLocalDate(now, "Reference now");
    return resolvePreset(input, referenceNow);
  }

  if (typeof input !== "object" || input === null) {
    throw new TypeError(
      `Comparison input must be a preset id or a { start, end } range, received ${JSON.stringify(input)}.`,
    );
  }

  const start = parseLocalDate(input.start, "Range start");
  const end = parseLocalDate(input.end, "Range end");
  if (compareDates(start, end) > 0) {
    throw new TypeError(
      `Invalid comparison range: start ${input.start} is after end ${input.end}.`,
    );
  }

  if (toUtcMs(start) === toUtcMs(end)) {
    const previous = previousSingleDay(start);
    return {
      currentStart: toLocalDate(start),
      currentEnd: toLocalDate(end),
      previousStart: previous.start,
      previousEnd: previous.end,
    };
  }
  const previous = precedingEqualDuration(start, end);
  return {
    currentStart: toLocalDate(start),
    currentEnd: toLocalDate(end),
    previousStart: previous.start,
    previousEnd: previous.end,
  };
}
