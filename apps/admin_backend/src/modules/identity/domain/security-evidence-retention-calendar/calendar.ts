import { calendarError, type CalendarError } from './errors';
import { err, ok, type Result } from './result';

declare const DateOnlyBrand: unique symbol;
declare const DurationBrand: unique symbol;

export type DateOnly = string & { readonly [DateOnlyBrand]: true };

interface DurationFields {
  readonly years: number;
  readonly months: number;
  readonly days: number;
}

export type Duration = DurationFields & { readonly [DurationBrand]: true };

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MIN_YEAR = 1;
const MAX_YEAR = 9999;
const MONTHS_PER_YEAR = 12;

const isLeapYear = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

const daysInMonth = (year: number, month: number): number => {
  const days = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return days[month - 1];
};

const isRecord = (input: unknown): input is Record<string, unknown> => {
  try {
    return typeof input === 'object' && input !== null && !Array.isArray(input);
  } catch {
    return false;
  }
};

const readDuration = (input: unknown): DurationFields | undefined => {
  if (!isRecord(input)) return undefined;
  try {
    const { years, months, days } = input;
    return typeof years === 'number' &&
      typeof months === 'number' &&
      typeof days === 'number'
      ? { years, months, days }
      : undefined;
  } catch {
    return undefined;
  }
};

const dateParts = (date: DateOnly): readonly [number, number, number] => [
  Number(date.slice(0, 4)),
  Number(date.slice(5, 7)),
  Number(date.slice(8, 10)),
];

const formatParts = (year: number, month: number, day: number): DateOnly =>
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` as DateOnly;

const daysBeforeYear = (year: number): number => {
  const completedYears = year - 1;
  return (
    completedYears * 365 +
    Math.floor(completedYears / 4) -
    Math.floor(completedYears / 100) +
    Math.floor(completedYears / 400)
  );
};

const serialDay = (year: number, month: number, day: number): number => {
  let total = daysBeforeYear(year);
  for (let currentMonth = 1; currentMonth < month; currentMonth += 1)
    total += daysInMonth(year, currentMonth);
  return total + day - 1;
};

const fromSerialDay = (serial: number): DateOnly => {
  let low = MIN_YEAR;
  let high = MAX_YEAR;
  while (low < high) {
    const candidate = Math.ceil((low + high) / 2);
    if (daysBeforeYear(candidate) <= serial) low = candidate;
    else high = candidate - 1;
  }
  let remaining = serial - daysBeforeYear(low);
  let month = 1;
  while (remaining >= daysInMonth(low, month)) {
    remaining -= daysInMonth(low, month);
    month += 1;
  }
  return formatParts(low, month, remaining + 1);
};

export const parseDateOnly = (
  input: unknown,
): Result<DateOnly, CalendarError> => {
  if (typeof input !== 'string')
    return err(calendarError('INVALID_DATE', 'MALFORMED_SHAPE'));
  const match = DATE_PATTERN.exec(input);
  if (!match) return err(calendarError('INVALID_DATE', 'MALFORMED_SHAPE'));
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > MONTHS_PER_YEAR) {
    return err(calendarError('INVALID_DATE', 'INVALID_VALUE'));
  }
  if (year < MIN_YEAR || year > MAX_YEAR)
    return err(calendarError('INVALID_DATE', 'OUT_OF_RANGE'));
  if (day < 1 || day > daysInMonth(year, month)) {
    return err(calendarError('INVALID_DATE', 'INVALID_VALUE'));
  }
  return ok(input as DateOnly);
};

export const formatDateOnly = (date: DateOnly): string => date;

export const compareDateOnly = (a: DateOnly, b: DateOnly): number =>
  a.localeCompare(b);

export const validateDuration = (
  input: unknown,
): Result<Duration, CalendarError> => {
  const duration = readDuration(input);
  if (!duration)
    return err(calendarError('INVALID_DURATION', 'MALFORMED_SHAPE'));
  const values = [duration.years, duration.months, duration.days];
  if (values.some((value) => !Number.isFinite(value)))
    return err(calendarError('INVALID_DURATION', 'NON_FINITE'));
  if (values.some((value) => !Number.isInteger(value)))
    return err(calendarError('INVALID_DURATION', 'NON_INTEGER'));
  if (values.some((value) => value < 0))
    return err(calendarError('INVALID_DURATION', 'NEGATIVE'));
  if (values.every((value) => value === 0))
    return err(calendarError('INVALID_DURATION', 'ALL_ZERO'));
  return ok({ ...duration } as Duration);
};

export const addDuration = (
  date: DateOnly,
  duration: Duration,
): Result<DateOnly, CalendarError> => {
  const [initialYear, initialMonth, initialDay] = dateParts(date);
  if (
    ![duration.years, duration.months, duration.days].every(
      Number.isSafeInteger,
    )
  )
    return err(calendarError('ARITHMETIC_OVERFLOW', 'OVERFLOW'));
  const year = initialYear + duration.years;
  if (year > MAX_YEAR)
    return err(calendarError('ARITHMETIC_OVERFLOW', 'OVERFLOW'));
  const yearDay = Math.min(initialDay, daysInMonth(year, initialMonth));
  const totalMonths = initialMonth - 1 + duration.months;
  const monthYear = year + Math.floor(totalMonths / MONTHS_PER_YEAR);
  const month = (totalMonths % MONTHS_PER_YEAR) + 1;
  if (monthYear > MAX_YEAR)
    return err(calendarError('ARITHMETIC_OVERFLOW', 'OVERFLOW'));
  const monthDay = Math.min(yearDay, daysInMonth(monthYear, month));
  const target = serialDay(monthYear, month, monthDay) + duration.days;
  if (!Number.isSafeInteger(target) || target > serialDay(MAX_YEAR, 12, 31))
    return err(calendarError('ARITHMETIC_OVERFLOW', 'OVERFLOW'));
  return ok(fromSerialDay(target));
};
