/**
 * Stable OHAC contract error codes.
 *
 * Framework-free on purpose: domain and application layers import these
 * without depending on NestJS, TypeORM, Floor or bcrypt.
 */
export const OHAC_ERROR_CODE = {
  INVALID_UTF8: 'OHAC_INVALID_UTF8',
  INVALID_JSON: 'OHAC_INVALID_JSON',
  INVALID_UNICODE: 'OHAC_INVALID_UNICODE',
  DUPLICATE_KEY: 'OHAC_DUPLICATE_KEY',
  NUMBER_FORBIDDEN: 'OHAC_NUMBER_FORBIDDEN',
  NULL_FORBIDDEN: 'OHAC_NULL_FORBIDDEN',
  LIMIT_EXCEEDED: 'OHAC_LIMIT_EXCEEDED',
  UNKNOWN_FIELD: 'OHAC_UNKNOWN_FIELD',
  MISSING_FIELD: 'OHAC_MISSING_FIELD',
  INVALID_FIELD: 'OHAC_INVALID_FIELD',
  UNSUPPORTED_SCHEMA: 'OHAC_UNSUPPORTED_SCHEMA',
  DIGEST_MISMATCH: 'OHAC_DIGEST_MISMATCH',
  TENANT_SCOPE_MISMATCH: 'OHAC_TENANT_SCOPE_MISMATCH',
  SEQUENCE_NOT_NEWER: 'OHAC_SEQUENCE_NOT_NEWER',
  UNSUPPORTED_BUILD_PAIR: 'OHAC_UNSUPPORTED_BUILD_PAIR',
  CREDENTIAL_BINDING_MISMATCH: 'OHAC_CREDENTIAL_BINDING_MISMATCH',
  TENANT_TERMINAL_MISMATCH: 'OHAC_TENANT_TERMINAL_MISMATCH',
} as const;

export type OhacErrorCode =
  (typeof OHAC_ERROR_CODE)[keyof typeof OHAC_ERROR_CODE];

export interface OhacError {
  readonly code: OhacErrorCode;
  /** Optional, non-secret context such as a field name. Never PIN or verifier material. */
  readonly field?: string;
}

export type OhacResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: OhacError };

export const ohacOk = <T>(value: T): OhacResult<T> => ({ ok: true, value });

export const ohacFail = <T>(
  code: OhacErrorCode,
  field?: string,
): OhacResult<T> => ({
  ok: false,
  error: field === undefined ? { code } : { code, field },
});
