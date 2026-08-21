import { parseDateOnly, type DateOnly } from './calendar';
import { calendarError, type CalendarError } from './errors';
import { err, ok, type Result } from './result';

export type ValidatedCategory = 'security/forensic' | 'fiscal/DGI' | 'unknown';

const VALID_CATEGORIES: ReadonlySet<string> = new Set([
  'security/forensic',
  'fiscal/DGI',
  'unknown',
]);

export interface ValidatedEvidenceInput {
  readonly category: ValidatedCategory;
  readonly originDate: DateOnly;
  readonly source: string;
}

const isRecord = (input: unknown): input is Record<string, unknown> => {
  try {
    return typeof input === 'object' && input !== null && !Array.isArray(input);
  } catch {
    return false;
  }
};

export const extractEvidenceInput = (
  input: unknown,
): Result<ValidatedEvidenceInput, CalendarError> => {
  if (!isRecord(input))
    return err(calendarError('INVALID_EVIDENCE', 'MALFORMED_SHAPE'));

  const { category, originDate, source } = input;

  if (typeof category !== 'string' || !VALID_CATEGORIES.has(category))
    return err(calendarError('INVALID_EVIDENCE', 'UNKNOWN_CATEGORY'));

  if (typeof source !== 'string' || source.length === 0)
    return err(calendarError('INVALID_EVIDENCE', 'MALFORMED_SHAPE'));

  const dateResult = parseDateOnly(originDate);
  if (!dateResult.ok)
    return err(calendarError('INVALID_EVIDENCE', 'MALFORMED_SHAPE'));

  return ok({
    category: category as ValidatedCategory,
    originDate: dateResult.value,
    source,
  });
};
