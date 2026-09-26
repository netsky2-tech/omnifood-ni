/**
 * Shared reporting-period value module (Owner Dashboard V2 architecture spec
 * §6.1). All dashboard-adjacent reporting routes must interpret user date
 * inputs as America/Managua local calendar days and must not implement their
 * own timezone/date-boundary parsing (spec §6.2).
 *
 * America/Managua has been fixed at UTC-06:00 year-round (no DST) since 1993;
 * every currently reporting date is in the fixed-offset era, and the legacy
 * parsers this module consolidates hardcoded `-06:00` for the same reason.
 */

export const REPORTING_TIMEZONE = 'America/Managua' as const;
export type ReportingTimezone = typeof REPORTING_TIMEZONE;

export const MANAGUA_UTC_OFFSET = '-06:00' as const;

const MANAGUA_OFFSET_MINUTES = 6 * 60;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Spec §6.1 logical contract. */
export interface ReportingPeriod {
  timezone: ReportingTimezone;
  /** Local calendar date (YYYY-MM-DD), inclusive to the user. */
  localStartDate: string;
  /** Local calendar date (YYYY-MM-DD), inclusive to the user. */
  localEndDate: string;
  /** Half-open boundary [start, end): first instant of the start date, local. */
  startInclusiveUtc: Date;
  /** Half-open boundary [start, end): first instant AFTER the end date, local. */
  endExclusiveUtc: Date;
}

export interface ResolvedReportingBounds {
  /** Inclusive lower UTC bound, when a start input resolved. */
  startInclusiveUtc?: Date;
  /**
   * Inclusive upper UTC bound (last local millisecond of the end date:
   * 23:59:59.999-06:00). Provided for legacy query compatibility; new code
   * should prefer the half-open `endExclusiveUtc`.
   */
  endInclusiveUtc?: Date;
  /** Half-open upper bound; equals `endInclusiveUtc + 1ms` when an end resolved. */
  endExclusiveUtc?: Date;
  /** Full period metadata when both bounds resolved. */
  period?: ReportingPeriod;
  localStartDate?: string;
  localEndDate?: string;
}

/** Raised for inverted or invalid user-supplied period inputs. */
export class ReportingPeriodValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReportingPeriodValidationError';
  }
}

/** Strict YYYY-MM-DD calendar validation (rejects e.g. 2026-02-30, month 13). */
export function isValidLocalDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_KEY_PATTERN.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  return (
    parsed.getUTCFullYear() === Number(value.slice(0, 4)) &&
    parsed.getUTCMonth() === Number(value.slice(5, 7)) - 1 &&
    parsed.getUTCDate() === Number(value.slice(8, 10))
  );
}

/** Parses and validates a local calendar date key (YYYY-MM-DD). */
export function parseLocalDateKey(value: string): string {
  const raw = String(value);
  if (!isValidLocalDateKey(value)) {
    throw new ReportingPeriodValidationError(
      `Invalid local calendar date: '${raw}' (expected a real YYYY-MM-DD date)`,
    );
  }
  return value;
}

function addLocalDays(dateKey: string, days: number): string {
  const date = new Date(`${parseLocalDateKey(dateKey)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export { addLocalDays };

/** First instant of a local calendar day (00:00:00.000 America/Managua). */
export function localDayStartUtc(dateKey: string): Date {
  return new Date(
    `${parseLocalDateKey(dateKey)}T00:00:00.000${MANAGUA_UTC_OFFSET}`,
  );
}

/** First instant AFTER a local calendar day (half-open upper bound). */
export function localDayEndExclusiveUtc(dateKey: string): Date {
  return localDayStartUtc(addLocalDays(dateKey, 1));
}

/**
 * Inclusive upper bound equivalent to the half-open end: the last local
 * millisecond of the end date (23:59:59.999-06:00). Legacy routes keep using
 * this so their query results stay byte-identical.
 */
export function inclusiveEndBound(period: ReportingPeriod): Date {
  return new Date(period.endExclusiveUtc.getTime() - 1);
}

/**
 * Builds a half-open reporting period that includes the complete selected end
 * date. Rejects inverted or invalid ranges.
 */
export function createReportingPeriod(
  localStartDate: string,
  localEndDate: string,
): ReportingPeriod {
  const start = parseLocalDateKey(localStartDate);
  const end = parseLocalDateKey(localEndDate);
  if (start > end) {
    throw new ReportingPeriodValidationError(
      `Inverted reporting period: start date '${start}' is after end date '${end}'`,
    );
  }
  return {
    timezone: REPORTING_TIMEZONE,
    localStartDate: start,
    localEndDate: end,
    startInclusiveUtc: localDayStartUtc(start),
    endExclusiveUtc: localDayEndExclusiveUtc(end),
  };
}

/** Every local calendar day key of the period, in order. */
export function eachLocalDate(period: ReportingPeriod): string[] {
  const days: string[] = [];
  let cursor = period.localStartDate;
  while (cursor <= period.localEndDate) {
    days.push(cursor);
    cursor = addLocalDays(cursor, 1);
  }
  return days;
}

/** Local wall-clock hour (0-23) of a UTC instant, per the fixed UTC-06:00 offset. */
export function managuaHourBucket(instant: Date): number {
  return (instant.getUTCHours() + 24 - MANAGUA_OFFSET_MINUTES / 60) % 24;
}

/** Managua calendar date (YYYY-MM-DD) of a UTC instant. */
export function formatLocalDateKey(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORTING_TIMEZONE,
  }).format(instant);
}

/** Current Managua calendar date key (legacy default-day behaviour). */
export function currentLocalDateKey(): string {
  return formatLocalDateKey(new Date());
}

type ResolvedBound =
  | { kind: 'dateKey'; dateKey: string }
  | { kind: 'instant'; instant: Date };

function resolveBoundInput(
  input: string | undefined | null,
): ResolvedBound | undefined {
  if (input == null || input === '') {
    return undefined;
  }
  if (DATE_KEY_PATTERN.test(input)) {
    return { kind: 'dateKey', dateKey: parseLocalDateKey(input) };
  }
  // Legacy tolerance: full ISO timestamps were accepted by the previous
  // parsers via `new Date(str)`. Unparseable garbage resolved to Invalid Date
  // and effectively never matched anything, so it is treated as absent here.
  const instant = new Date(input);
  if (Number.isNaN(instant.getTime())) {
    return undefined;
  }
  return { kind: 'instant', instant };
}

function buildStartBound(bound: ResolvedBound): Date {
  return bound.kind === 'dateKey'
    ? localDayStartUtc(bound.dateKey)
    : bound.instant;
}

function buildEndBounds(bound: ResolvedBound): {
  endInclusiveUtc: Date;
  endExclusiveUtc: Date;
} {
  if (bound.kind === 'dateKey') {
    const endExclusiveUtc = localDayEndExclusiveUtc(bound.dateKey);
    return {
      endInclusiveUtc: new Date(endExclusiveUtc.getTime() - 1),
      endExclusiveUtc,
    };
  }
  return {
    endInclusiveUtc: bound.instant,
    endExclusiveUtc: new Date(bound.instant.getTime() + 1),
  };
}

/**
 * Resolves the legacy one-sided date inputs into reporting bounds.
 *
 * - Both inputs as local calendar dates -> a full validated `ReportingPeriod`.
 * - One/both inputs as raw instants -> legacy-compatible bounds (documented
 *   tolerance kept so existing routes do not change behaviour for old clients).
 * - Absent, empty or unparseable inputs resolve as unbounded, matching the
 *   previous parsers.
 *
 * Inverted ranges are rejected (spec §6.1) where the legacy behaviour was an
 * empty result set; this is the explicit spec-mandated validation.
 */
export function resolveReportingBounds(
  startDateInput?: string | null,
  endDateInput?: string | null,
): ResolvedReportingBounds {
  const startBound = resolveBoundInput(startDateInput);
  const endBound = resolveBoundInput(endDateInput);

  if (!startBound && !endBound) {
    return {};
  }

  if (startBound && endBound) {
    if (startBound.kind === 'dateKey' && endBound.kind === 'dateKey') {
      const period = createReportingPeriod(
        startBound.dateKey,
        endBound.dateKey,
      );
      const endExclusiveUtc = localDayEndExclusiveUtc(period.localEndDate);
      return {
        startInclusiveUtc: period.startInclusiveUtc,
        endInclusiveUtc: new Date(endExclusiveUtc.getTime() - 1),
        endExclusiveUtc,
        period,
        localStartDate: period.localStartDate,
        localEndDate: period.localEndDate,
      };
    }

    const startInclusiveUtc = buildStartBound(startBound);
    const { endInclusiveUtc, endExclusiveUtc } = buildEndBounds(endBound);
    if (startInclusiveUtc.getTime() > endInclusiveUtc.getTime()) {
      throw new ReportingPeriodValidationError(
        `Inverted reporting period: start '${startDateInput}' is after end '${endDateInput}'`,
      );
    }
    return {
      startInclusiveUtc,
      endInclusiveUtc,
      endExclusiveUtc,
      localStartDate:
        startBound.kind === 'dateKey'
          ? startBound.dateKey
          : formatLocalDateKey(startInclusiveUtc),
      localEndDate:
        endBound.kind === 'dateKey'
          ? endBound.dateKey
          : formatLocalDateKey(endInclusiveUtc),
    };
  }

  if (startBound) {
    const startInclusiveUtc = buildStartBound(startBound);
    return {
      startInclusiveUtc,
      localStartDate:
        startBound.kind === 'dateKey'
          ? startBound.dateKey
          : formatLocalDateKey(startInclusiveUtc),
    };
  }

  if (!endBound) {
    return {};
  }
  const { endInclusiveUtc, endExclusiveUtc } = buildEndBounds(endBound);
  const localEndDate =
    endBound.kind === 'dateKey'
      ? endBound.dateKey
      : formatLocalDateKey(endInclusiveUtc);
  return { endInclusiveUtc, endExclusiveUtc, localEndDate };
}
