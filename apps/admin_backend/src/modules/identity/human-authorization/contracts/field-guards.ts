import {
  OHAC_ERROR_CODE,
  ohacFail,
  ohacOk,
  type OhacResult,
} from './error-codes';

export const DECIMAL_STRING = /^(0|[1-9][0-9]*)$/;
export const LOWERCASE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const DIGEST = /^sha256:[0-9a-f]{64}$/;

export const asObject = (
  value: unknown,
): Record<string, unknown> | undefined => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

export const isDecimalString = (value: unknown): value is string =>
  typeof value === 'string' && DECIMAL_STRING.test(value);

export const isLowercaseUuid = (value: unknown): value is string =>
  typeof value === 'string' && LOWERCASE_UUID.test(value);

export const isDigest = (value: unknown): value is string =>
  typeof value === 'string' && DIGEST.test(value);

/**
 * Rejects unknown fields before anything else interprets the payload, so a
 * future field cannot be silently ignored by an older contract version.
 */
export const requireExactKeys = (
  object: Record<string, unknown>,
  allowed: readonly string[],
): OhacResult<Record<string, unknown>> => {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(object)) {
    if (!allowedSet.has(key)) {
      return ohacFail(OHAC_ERROR_CODE.UNKNOWN_FIELD, key);
    }
  }
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(object, key)) {
      return ohacFail(OHAC_ERROR_CODE.MISSING_FIELD, key);
    }
  }
  return ohacOk(object);
};

/** Requires an array whose values are already sorted and free of duplicates. */
export const requireSortedUnique = (
  values: readonly string[],
  field: string,
): OhacResult<readonly string[]> => {
  for (let index = 1; index < values.length; index++) {
    if (values[index - 1] >= values[index]) {
      return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, field);
    }
  }
  return ohacOk(values);
};
