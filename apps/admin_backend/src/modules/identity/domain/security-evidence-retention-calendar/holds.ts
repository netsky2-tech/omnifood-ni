import { calendarError, type CalendarError } from './errors';
import { err, ok, type Result } from './result';

declare const HoldRefBrand: unique symbol;

export type HoldRef = string & { readonly [HoldRefBrand]: true };

export const validateHoldRef = (
  input: unknown,
): Result<HoldRef, CalendarError> => {
  if (typeof input !== 'string' || input.length === 0)
    return err(calendarError('INVALID_EVIDENCE', 'MALFORMED_SHAPE'));
  return ok(input as HoldRef);
};
