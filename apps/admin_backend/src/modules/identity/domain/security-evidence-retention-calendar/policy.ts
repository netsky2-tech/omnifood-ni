import {
  addDuration,
  compareDateOnly,
  parseDateOnly,
  type DateOnly,
} from './calendar';
import type { ValidatedCategory } from './evidence';
import { calendarError, type CalendarError } from './errors';
import { err, ok, type Result } from './result';

export interface ValidatedPolicy {
  readonly category: ValidatedCategory;
  readonly durationYears: number;
  readonly effectiveDate: DateOnly;
}

export interface DgiMinimum {
  readonly durationYears: 5;
  readonly category: 'fiscal/DGI';
}

const VALID_DURATIONS: ReadonlySet<number> = new Set([5, 6, 7]);

const VALID_CATEGORIES: ReadonlySet<string> = new Set([
  'security/forensic',
  'fiscal/DGI',
  'unknown',
]);

const isRecord = (input: unknown): input is Record<string, unknown> => {
  try {
    return typeof input === 'object' && input !== null && !Array.isArray(input);
  } catch {
    return false;
  }
};

export const validatePolicy = (
  input: unknown,
): Result<ValidatedPolicy, CalendarError> => {
  if (!isRecord(input))
    return err(calendarError('INVALID_POLICY', 'MALFORMED_SHAPE'));

  const { category, durationYears, effectiveDate } = input;

  if (typeof category !== 'string' || !VALID_CATEGORIES.has(category))
    return err(calendarError('INVALID_POLICY', 'MALFORMED_SHAPE'));

  if (typeof durationYears !== 'number' || !VALID_DURATIONS.has(durationYears))
    return err(calendarError('INVALID_POLICY', 'DURATION_OUT_OF_RANGE'));

  const dateResult = parseDateOnly(effectiveDate);
  if (!dateResult.ok)
    return err(calendarError('INVALID_POLICY', 'INVALID_EFFECTIVE_DATE'));

  return ok({
    category: category as ValidatedCategory,
    durationYears,
    effectiveDate: dateResult.value,
  });
};

const sameCategory = (
  evidence: { readonly category: ValidatedCategory },
  policy: ValidatedPolicy,
): boolean => evidence.category === policy.category;

export const selectPolicy = (
  evidence: { readonly category: ValidatedCategory },
  originDate: DateOnly,
  policies: ReadonlyArray<ValidatedPolicy>,
): Result<ValidatedPolicy, CalendarError> => {
  const candidates = policies.filter(
    (p) =>
      sameCategory(evidence, p) &&
      compareDateOnly(p.effectiveDate, originDate) <= 0,
  );

  if (candidates.length === 0)
    return err(calendarError('NO_APPLICABLE_POLICY', 'NO_MATCH'));

  let latest = candidates[0];
  let tie = false;
  for (let i = 1; i < candidates.length; i++) {
    const cmp = compareDateOnly(
      candidates[i].effectiveDate,
      latest.effectiveDate,
    );
    if (cmp === 0) {
      tie = true;
    } else if (cmp > 0) {
      latest = candidates[i];
      tie = false;
    }
  }

  if (tie) return err(calendarError('NO_APPLICABLE_POLICY', 'TIE'));

  return ok(latest);
};

export const computeInclusiveEnd = (
  origin: DateOnly,
  policy: ValidatedPolicy,
): Result<DateOnly, CalendarError> =>
  addDuration(origin, {
    years: policy.durationYears,
    months: 0,
    days: -1,
  } as import('./calendar').Duration);
