import { canonicalizeNumberFreeJson } from '../../../../core/audit/v3/canonicalizer';
import { scanNumberFreeJson } from '../../../../core/audit/v3/scanner';
import { sha256LowerHex } from '../../../../core/audit/v3/sha256';
import {
  AUDIT_V3_ERROR_CODE,
  type AuditV3Value,
  type AuditV3ErrorCode,
} from '../../../../core/audit/v3/types';
import {
  OHAC_ERROR_CODE,
  ohacFail,
  ohacOk,
  type OhacErrorCode,
  type OhacResult,
} from './error-codes';

/**
 * OHAC-C14N-1: the project's existing number-free JCS subset, plus the two
 * rules v1 adds on top — no `null` values and no Unicode normalization.
 */
const AUDIT_TO_OHAC: Readonly<Record<AuditV3ErrorCode, OhacErrorCode>> = {
  [AUDIT_V3_ERROR_CODE.INVALID_UTF8]: OHAC_ERROR_CODE.INVALID_UTF8,
  [AUDIT_V3_ERROR_CODE.INVALID_JSON]: OHAC_ERROR_CODE.INVALID_JSON,
  [AUDIT_V3_ERROR_CODE.INVALID_UNICODE]: OHAC_ERROR_CODE.INVALID_UNICODE,
  [AUDIT_V3_ERROR_CODE.DUPLICATE_KEY]: OHAC_ERROR_CODE.DUPLICATE_KEY,
  [AUDIT_V3_ERROR_CODE.NUMBER_FORBIDDEN]: OHAC_ERROR_CODE.NUMBER_FORBIDDEN,
  [AUDIT_V3_ERROR_CODE.LIMIT_EXCEEDED]: OHAC_ERROR_CODE.LIMIT_EXCEEDED,
  [AUDIT_V3_ERROR_CODE.FRAME_INVALID]: OHAC_ERROR_CODE.INVALID_FIELD,
  [AUDIT_V3_ERROR_CODE.FRAME_TOO_LARGE]: OHAC_ERROR_CODE.LIMIT_EXCEEDED,
};

const containsNull = (value: AuditV3Value): boolean => {
  switch (value.kind) {
    case 'null':
      return true;
    case 'array':
      return value.values.some(containsNull);
    case 'object':
      return value.entries.some((entry) => containsNull(entry.value));
    default:
      return false;
  }
};

export const canonicalizeOhac = (rawUtf8: Buffer): OhacResult<Buffer> => {
  const scanned = scanNumberFreeJson(rawUtf8);
  if (scanned.ok === false) {
    return ohacFail(AUDIT_TO_OHAC[scanned.error.code]);
  }
  if (containsNull(scanned.value)) {
    return ohacFail(OHAC_ERROR_CODE.NULL_FORBIDDEN);
  }
  const canonical = canonicalizeNumberFreeJson(rawUtf8);
  if (canonical.ok === false) {
    return ohacFail(AUDIT_TO_OHAC[canonical.error.code]);
  }
  return ohacOk(canonical.value);
};

/** `sha256:` prefix plus 64 lowercase hex characters over canonical bytes. */
export const ohacDigest = (canonicalBytes: Buffer): string =>
  `sha256:${sha256LowerHex(canonicalBytes)}`;

export const digestOfJson = (rawUtf8: Buffer): OhacResult<string> => {
  const canonical = canonicalizeOhac(rawUtf8);
  if (canonical.ok === false) return canonical;
  return ohacOk(ohacDigest(canonical.value));
};
