import { calendarError, type CalendarError } from './errors';
import { err, ok, type Result } from './result';

declare const CommitmentIdBrand: unique symbol;
declare const PredecessorIdBrand: unique symbol;

export type CommitmentId = string & { readonly [CommitmentIdBrand]: true };
export type PredecessorId = string & { readonly [PredecessorIdBrand]: true };

export const validateCommitmentId = (
  input: unknown,
): Result<CommitmentId, CalendarError> => {
  if (typeof input !== 'string' || input.length === 0)
    return err(calendarError('INVALID_EVIDENCE', 'MALFORMED_SHAPE'));
  return ok(input as CommitmentId);
};

export const validatePredecessorId = (
  input: unknown,
): Result<PredecessorId, CalendarError> => {
  if (typeof input !== 'string' || input.length === 0)
    return err(calendarError('INVALID_EVIDENCE', 'MALFORMED_SHAPE'));
  return ok(input as PredecessorId);
};
