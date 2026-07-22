export const AUDIT_V3_ERROR_CODE = {
  INVALID_UTF8: 'AUDIT_V3_INVALID_UTF8',
  INVALID_JSON: 'AUDIT_V3_INVALID_JSON',
  INVALID_UNICODE: 'AUDIT_V3_INVALID_UNICODE',
  DUPLICATE_KEY: 'AUDIT_V3_DUPLICATE_KEY',
  NUMBER_FORBIDDEN: 'AUDIT_V3_NUMBER_FORBIDDEN',
  LIMIT_EXCEEDED: 'AUDIT_V3_LIMIT_EXCEEDED',
} as const;

export type AuditV3ErrorCode =
  (typeof AUDIT_V3_ERROR_CODE)[keyof typeof AUDIT_V3_ERROR_CODE];
export interface AuditV3Error { readonly code: AuditV3ErrorCode; readonly offset: number }
export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: AuditV3Error };

export type AuditV3Value = AuditV3Null | AuditV3Boolean | AuditV3String | AuditV3Array | AuditV3Object;
export interface AuditV3Null { readonly kind: 'null' }
export interface AuditV3Boolean { readonly kind: 'boolean'; readonly value: boolean }
export interface AuditV3String { readonly kind: 'string'; readonly value: string }
export interface AuditV3Array { readonly kind: 'array'; readonly values: readonly AuditV3Value[] }
export interface AuditV3ObjectEntry { readonly key: string; readonly value: AuditV3Value }
export interface AuditV3Object { readonly kind: 'object'; readonly entries: readonly AuditV3ObjectEntry[] }
