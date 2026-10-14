/**
 * Calendar-day handling for PostgreSQL `date` columns.
 *
 * A `date` column is a CALENDAR DAY, not an instant. There is no time and no
 * timezone in it, so the only faithful JavaScript representation is the ISO
 * calendar-day string `YYYY-MM-DD` — the exact text the database stores.
 *
 * Why this module exists (odd/tasks/nucleo-inventario-paridad-contrato.md, R3):
 * these columns were declared as `Date` in the entities while the database
 * stores a day. That mismatch produced two opposite failures, and neither was
 * visible from a single layer:
 *
 *  - READ, through TypeORM entity hydration: the driver hands back a plain
 *    `string`, so any `.getTime()` / `.toISOString()` on it throws
 *    (`expirationDate.getTime is not a function` — the live production close
 *    returned HTTP 500 on every perishable component because of this).
 *  - READ, through a raw query: node-postgres parses `date` into a `Date` at
 *    LOCAL midnight, so `2026-11-15` arrives as `2026-11-14T06:00:00.000Z`
 *    in a UTC-6 session and shifts the day whenever it is formatted.
 *  - WRITE, on any path that wrapped the day in `new Date(...)` before storing
 *    it: `new Date('2026-11-15')` is UTC midnight, which serializes to the
 *    PREVIOUS calendar day in a negative-offset session. Measured against the
 *    live API: `2026-12-31` was stored as `2026-12-30`.
 *
 * Modelling the day as a string removes the whole class: nothing converts, so
 * nothing can shift, and ISO day strings compare chronologically by plain
 * lexicographic order — which is also exactly what FEFO consumption ordering
 * needs, with no timezone able to leak in.
 *
 * A DO NOT "fix" these columns back to `Date` without reading the above: the
 * schema stores a day and the type must agree with the schema.
 */

/** The only accepted shape: a zero-padded ISO calendar day. */
export const CALENDAR_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** True when `value` is already a `YYYY-MM-DD` calendar day. */
export const isCalendarDay = (value: string): boolean =>
  CALENDAR_DAY_PATTERN.test(value);

/**
 * Normalizes an ISO date or timestamp to its calendar day.
 *
 * The first ten characters of an ISO value ARE its calendar day as authored,
 * so they are returned verbatim. No timezone conversion is applied on purpose:
 * converting here is what caused the one-day shift. Callers that receive a
 * full timestamp therefore keep the day the sender wrote, not a day derived
 * from this server's clock or offset.
 *
 * Throws on input that carries no ISO calendar day, rather than silently
 * storing something the database would have to interpret.
 */
export const toCalendarDay = (value: string): string => {
  const day = value.trim().slice(0, 10);

  if (!isCalendarDay(day)) {
    throw new Error(
      `Expected an ISO date or timestamp carrying a calendar day, received: ${value}`,
    );
  }

  return day;
};

/**
 * The LOCAL calendar day of an instant, as `YYYY-MM-DD`.
 *
 * Needed because the SAME `date` column arrives as two different JavaScript
 * shapes depending on the access path (see H-R10 in
 * odd/tasks/nucleo-inventario-paridad-contrato.md):
 *
 *  - through TypeORM entity hydration it is already a `string`;
 *  - through a raw query the driver parses it into a `Date` at LOCAL midnight.
 *
 * For that second shape, `toISOString().slice(0, 10)` is WRONG: local midnight
 * in a positive-offset zone serializes to the previous UTC day. The local date
 * parts are the faithful answer, because local midnight is exactly how the
 * driver encoded the day.
 *
 * Note this is for interpreting a driver-hydrated `Date` that REPRESENTS a
 * calendar day. It is NOT for converting an instant (a `timestamptz`) into a
 * day — for that, pick the zone explicitly at the call site.
 */
export const calendarDayOf = (instant: Date): string => {
  const year = instant.getFullYear();
  const month = String(instant.getMonth() + 1).padStart(2, '0');
  const day = String(instant.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

/**
 * The LOCAL calendar day of `now` (defaults to the current time).
 *
 * Used where a write means "today" rather than a caller-supplied day, such as a
 * correction document's `entry_date`. Built from the LOCAL date parts on
 * purpose: `new Date().toISOString().slice(0, 10)` returns the UTC day, which
 * is the previous day for every evening in a negative-offset zone — the same
 * class of shift this module exists to remove.
 */
export const todayCalendarDay = (now: Date = new Date()): string =>
  calendarDayOf(now);
