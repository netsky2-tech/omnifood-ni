import { canonicalizeOhac, verifyBodyDigest } from './canonical';
import {
  OHAC_ERROR_CODE,
  ohacFail,
  ohacOk,
  type OhacResult,
} from './error-codes';
import {
  asObject,
  isDecimalString,
  isDigest,
  isLowercaseUuid,
  isNonEmptyString,
  requireExactKeys,
  requireSortedUnique,
} from './field-guards';
import {
  OHAC_ROLE,
  STAFF_POLICY_EPOCH_V1_SCHEMA,
  type OhacRole,
} from './staff-policy-epoch.v1';

export const ASSERTION_V1_SCHEMA = 'ohac.assertion.v1' as const;

export const OHAC_TRUST_LEVEL = {
  APPLICATION_SANDBOX_SOFTWARE: 'APPLICATION_SANDBOX_SOFTWARE',
} as const;

export type OhacTrustLevel =
  (typeof OHAC_TRUST_LEVEL)[keyof typeof OHAC_TRUST_LEVEL];

export interface OhacAssertionV1 {
  readonly schema: typeof ASSERTION_V1_SCHEMA;
  readonly assertionId: string;
  readonly tenantId: string;
  readonly terminalId: string;
  readonly deviceCredentialId: string;
  readonly deviceCredentialVersion: string;
  readonly epochSequence: string;
  readonly epochDigest: string;
  readonly authorizerUserId: string;
  readonly operatorUserId: string;
  readonly authorizerRole: OhacRole;
  readonly permissionsUsed: readonly string[];
  readonly operationType: string;
  readonly operationSchema: string;
  readonly operationDigest: string;
  readonly localAuthorizationSequence: string;
  readonly localAuditId: string;
  readonly localAuditEntryHash: string;
  readonly posBuild: string;
  readonly policySchema: string;
  readonly trustLevel: OhacTrustLevel;
  readonly authorizedAt: string;
  readonly digest: string;
}

/**
 * No `signature` field exists by design: the assertion is device-attributed
 * software evidence, never a claim of human non-repudiation. Because unknown
 * fields are rejected, adding one is a contract violation rather than a
 * silently ignored extra.
 */
const ASSERTION_KEYS = [
  'schema',
  'assertionId',
  'tenantId',
  'terminalId',
  'deviceCredentialId',
  'deviceCredentialVersion',
  'epochSequence',
  'epochDigest',
  'authorizerUserId',
  'operatorUserId',
  'authorizerRole',
  'permissionsUsed',
  'operationType',
  'operationSchema',
  'operationDigest',
  'localAuthorizationSequence',
  'localAuditId',
  'localAuditEntryHash',
  'posBuild',
  'policySchema',
  'trustLevel',
  'authorizedAt',
  'digest',
] as const;

const UTC_RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

const isRole = (value: unknown): value is OhacRole =>
  typeof value === 'string' &&
  (Object.values(OHAC_ROLE) as readonly string[]).includes(value);

const isTrustLevel = (value: unknown): value is OhacTrustLevel =>
  value === OHAC_TRUST_LEVEL.APPLICATION_SANDBOX_SOFTWARE;

export const parseAssertionV1 = (
  rawUtf8: Buffer,
): OhacResult<OhacAssertionV1> => {
  const canonical = canonicalizeOhac(rawUtf8);
  if (canonical.ok === false) return canonical;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawUtf8.toString('utf8'));
  } catch {
    return ohacFail(OHAC_ERROR_CODE.INVALID_JSON);
  }
  const object = asObject(parsed);
  if (object === undefined) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_JSON);
  }

  const transmittedDigest = isDigest(object.digest) ? object.digest : undefined;
  if (transmittedDigest === undefined) {
    return ohacFail(OHAC_ERROR_CODE.MISSING_FIELD, 'digest');
  }
  const verified = verifyBodyDigest(object);
  if (verified.ok === false) return verified;

  const keys = requireExactKeys(object, ASSERTION_KEYS);
  if (keys.ok === false) return keys;

  if (object.schema !== ASSERTION_V1_SCHEMA) {
    return ohacFail(OHAC_ERROR_CODE.UNSUPPORTED_SCHEMA, 'schema');
  }
  if (object.policySchema !== STAFF_POLICY_EPOCH_V1_SCHEMA) {
    return ohacFail(OHAC_ERROR_CODE.UNSUPPORTED_SCHEMA, 'policySchema');
  }
  if (!isTrustLevel(object.trustLevel)) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'trustLevel');
  }

  for (const field of [
    'assertionId',
    'tenantId',
    'deviceCredentialId',
    'authorizerUserId',
    'operatorUserId',
    'localAuditId',
  ] as const) {
    if (!isLowercaseUuid(object[field])) {
      return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, field);
    }
  }
  for (const field of [
    'terminalId',
    'operationType',
    'operationSchema',
    'posBuild',
  ] as const) {
    if (!isNonEmptyString(object[field])) {
      return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, field);
    }
  }
  for (const field of [
    'deviceCredentialVersion',
    'epochSequence',
    'localAuthorizationSequence',
  ] as const) {
    if (!isDecimalString(object[field])) {
      return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, field);
    }
  }
  for (const field of [
    'epochDigest',
    'operationDigest',
    'localAuditEntryHash',
  ] as const) {
    if (!isDigest(object[field])) {
      return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, field);
    }
  }
  if (!isRole(object.authorizerRole)) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'authorizerRole');
  }
  if (
    typeof object.authorizedAt !== 'string' ||
    !UTC_RFC3339.test(object.authorizedAt)
  ) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'authorizedAt');
  }
  if (
    !Array.isArray(object.permissionsUsed) ||
    object.permissionsUsed.length === 0 ||
    object.permissionsUsed.some((permission) => !isNonEmptyString(permission))
  ) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'permissionsUsed');
  }
  const permissionsUsed = object.permissionsUsed as readonly string[];
  const sorted = requireSortedUnique(permissionsUsed, 'permissionsUsed');
  if (sorted.ok === false) return sorted;

  return ohacOk({
    schema: ASSERTION_V1_SCHEMA,
    assertionId: object.assertionId as string,
    tenantId: object.tenantId as string,
    terminalId: object.terminalId as string,
    deviceCredentialId: object.deviceCredentialId as string,
    deviceCredentialVersion: object.deviceCredentialVersion as string,
    epochSequence: object.epochSequence as string,
    epochDigest: object.epochDigest as string,
    authorizerUserId: object.authorizerUserId as string,
    operatorUserId: object.operatorUserId as string,
    authorizerRole: object.authorizerRole,
    permissionsUsed,
    operationType: object.operationType as string,
    operationSchema: object.operationSchema as string,
    operationDigest: object.operationDigest as string,
    localAuthorizationSequence: object.localAuthorizationSequence as string,
    localAuditId: object.localAuditId as string,
    localAuditEntryHash: object.localAuditEntryHash as string,
    posBuild: object.posBuild as string,
    policySchema: object.policySchema,
    trustLevel: object.trustLevel,
    authorizedAt: object.authorizedAt,
    digest: transmittedDigest,
  });
};
