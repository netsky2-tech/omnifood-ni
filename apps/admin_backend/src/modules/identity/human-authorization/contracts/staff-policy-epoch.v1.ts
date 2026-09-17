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

export const STAFF_POLICY_EPOCH_V1_SCHEMA =
  'ohac.staff-policy-epoch.v1' as const;
export const GENESIS_DIGEST = 'GENESIS' as const;
export const MINIMUM_ASSERTION_SCHEMA = 'ohac.assertion.v1' as const;

export const OHAC_POLICY_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;

export const OHAC_ROLE = {
  OWNER: 'OWNER',
  MANAGER: 'MANAGER',
  CASHIER: 'CASHIER',
  WAITER: 'WAITER',
} as const;

export type OhacPolicyStatus =
  (typeof OHAC_POLICY_STATUS)[keyof typeof OHAC_POLICY_STATUS];
export type OhacRole = (typeof OHAC_ROLE)[keyof typeof OHAC_ROLE];

export interface OhacPinVerifierV1 {
  readonly algorithm: 'bcrypt';
  readonly formatVersion: string;
  readonly encoded: string;
}

export interface StaffPolicyEpochEntryV1 {
  readonly userId: string;
  readonly status: OhacPolicyStatus;
  readonly role: OhacRole;
  readonly permissions: readonly string[];
  readonly pinVerifier: OhacPinVerifierV1;
  readonly attemptResetGeneration: string;
}

export interface StaffPolicyEpochV1 {
  readonly schema: typeof STAFF_POLICY_EPOCH_V1_SCHEMA;
  readonly tenantId: string;
  readonly targetTerminalId: string;
  readonly sequence: string;
  readonly previousSequence: string;
  readonly previousDigest: string;
  readonly publisherBackendBuild: string;
  readonly targetPosBuild: string;
  readonly minimumAssertionSchema: string;
  readonly policyEntries: readonly StaffPolicyEpochEntryV1[];
  readonly digest: string;
}

const EPOCH_KEYS = [
  'schema',
  'tenantId',
  'targetTerminalId',
  'sequence',
  'previousSequence',
  'previousDigest',
  'publisherBackendBuild',
  'targetPosBuild',
  'minimumAssertionSchema',
  'policyEntries',
  'digest',
] as const;

const ENTRY_KEYS = [
  'userId',
  'status',
  'role',
  'permissions',
  'pinVerifier',
  'attemptResetGeneration',
] as const;

const PIN_VERIFIER_KEYS = ['algorithm', 'formatVersion', 'encoded'] as const;

const isRole = (value: unknown): value is OhacRole =>
  typeof value === 'string' &&
  (Object.values(OHAC_ROLE) as readonly string[]).includes(value);

const isStatus = (value: unknown): value is OhacPolicyStatus =>
  typeof value === 'string' &&
  (Object.values(OHAC_POLICY_STATUS) as readonly string[]).includes(value);

const isGenesisOrDigest = (value: unknown): value is string =>
  value === GENESIS_DIGEST || isDigest(value);

const parsePinVerifier = (value: unknown): OhacResult<OhacPinVerifierV1> => {
  const object = asObject(value);
  if (object === undefined) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'pinVerifier');
  }
  const keys = requireExactKeys(object, PIN_VERIFIER_KEYS);
  if (keys.ok === false) return keys;
  if (object.algorithm !== 'bcrypt') {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'pinVerifier.algorithm');
  }
  if (
    !isNonEmptyString(object.formatVersion) ||
    !isNonEmptyString(object.encoded)
  ) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'pinVerifier');
  }
  return ohacOk({
    algorithm: 'bcrypt',
    formatVersion: object.formatVersion,
    encoded: object.encoded,
  });
};

const parseEntry = (value: unknown): OhacResult<StaffPolicyEpochEntryV1> => {
  const object = asObject(value);
  if (object === undefined) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'policyEntries');
  }
  const keys = requireExactKeys(object, ENTRY_KEYS);
  if (keys.ok === false) return keys;
  if (!isLowercaseUuid(object.userId)) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'userId');
  }
  if (!isStatus(object.status)) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'status');
  }
  if (!isRole(object.role)) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'role');
  }
  if (!isDecimalString(object.attemptResetGeneration)) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'attemptResetGeneration');
  }
  if (
    !Array.isArray(object.permissions) ||
    object.permissions.some((permission) => !isNonEmptyString(permission))
  ) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'permissions');
  }
  const permissions = object.permissions as readonly string[];
  const sorted = requireSortedUnique(permissions, 'permissions');
  if (sorted.ok === false) return sorted;

  const pinVerifier = parsePinVerifier(object.pinVerifier);
  if (pinVerifier.ok === false) return pinVerifier;

  return ohacOk({
    userId: object.userId,
    status: object.status,
    role: object.role,
    permissions,
    pinVerifier: pinVerifier.value,
    attemptResetGeneration: object.attemptResetGeneration,
  });
};

export const parseStaffPolicyEpochV1 = (
  rawUtf8: Buffer,
): OhacResult<StaffPolicyEpochV1> => {
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

  // Digest first: it is the only check that detects byte-level mutation. The
  // digest covers the whole object except the digest field itself.
  const transmittedDigest = isDigest(object.digest) ? object.digest : undefined;
  if (transmittedDigest === undefined) {
    return ohacFail(OHAC_ERROR_CODE.MISSING_FIELD, 'digest');
  }
  const verified = verifyBodyDigest(object);
  if (verified.ok === false) return verified;

  const keys = requireExactKeys(object, EPOCH_KEYS);
  if (keys.ok === false) return keys;

  if (object.schema !== STAFF_POLICY_EPOCH_V1_SCHEMA) {
    return ohacFail(OHAC_ERROR_CODE.UNSUPPORTED_SCHEMA, 'schema');
  }
  if (!isLowercaseUuid(object.tenantId)) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'tenantId');
  }
  if (!isNonEmptyString(object.targetTerminalId)) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'targetTerminalId');
  }
  if (!isDecimalString(object.sequence)) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'sequence');
  }
  if (!isDecimalString(object.previousSequence)) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'previousSequence');
  }
  if (!isGenesisOrDigest(object.previousDigest)) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'previousDigest');
  }
  if (
    !isNonEmptyString(object.publisherBackendBuild) ||
    !isNonEmptyString(object.targetPosBuild) ||
    !isNonEmptyString(object.minimumAssertionSchema)
  ) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'build');
  }
  if (
    !Array.isArray(object.policyEntries) ||
    object.policyEntries.length === 0
  ) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'policyEntries');
  }

  const entries: StaffPolicyEpochEntryV1[] = [];
  for (const candidate of object.policyEntries) {
    const entry = parseEntry(candidate);
    if (entry.ok === false) return entry;
    entries.push(entry.value);
  }
  const sortedEntries = requireSortedUnique(
    entries.map((entry) => entry.userId),
    'policyEntries',
  );
  if (sortedEntries.ok === false) return sortedEntries;

  // Sequences are contiguous decimal strings; epoch 1 chains from GENESIS.
  const sequence = BigInt(object.sequence);
  const previousSequence = BigInt(object.previousSequence);
  if (
    sequence !== previousSequence + 1n ||
    (previousSequence === 0n && object.previousDigest !== GENESIS_DIGEST) ||
    (previousSequence > 0n && !isDigest(object.previousDigest))
  ) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'sequence');
  }

  return ohacOk({
    schema: STAFF_POLICY_EPOCH_V1_SCHEMA,
    tenantId: object.tenantId,
    targetTerminalId: object.targetTerminalId,
    sequence: object.sequence,
    previousSequence: object.previousSequence,
    previousDigest: object.previousDigest,
    publisherBackendBuild: object.publisherBackendBuild,
    targetPosBuild: object.targetPosBuild,
    minimumAssertionSchema: object.minimumAssertionSchema,
    policyEntries: entries,
    digest: transmittedDigest,
  });
};

export interface OhacEpochAcceptanceInput {
  readonly epoch: StaffPolicyEpochV1;
  readonly expectedTenantId: string;
  readonly expectedTerminalId: string;
  readonly acceptedSequence: string;
  readonly acceptedDigest: string;
  readonly supportedPosBuild: string;
}

/**
 * Order is deliberate. Identity and build first, then "is this strictly newer",
 * and only then the chain check: a stale epoch should report staleness rather
 * than a broken previous-digest, which would mislead an operator.
 */
export const validateEpochAcceptance = (
  input: OhacEpochAcceptanceInput,
): OhacResult<StaffPolicyEpochV1> => {
  const { epoch } = input;
  if (epoch.tenantId !== input.expectedTenantId) {
    return ohacFail(OHAC_ERROR_CODE.TENANT_SCOPE_MISMATCH, 'tenantId');
  }
  if (epoch.targetTerminalId !== input.expectedTerminalId) {
    return ohacFail(
      OHAC_ERROR_CODE.TENANT_TERMINAL_MISMATCH,
      'targetTerminalId',
    );
  }
  if (epoch.targetPosBuild !== input.supportedPosBuild) {
    return ohacFail(OHAC_ERROR_CODE.UNSUPPORTED_BUILD_PAIR, 'targetPosBuild');
  }

  const accepted = BigInt(input.acceptedSequence);
  if (BigInt(epoch.sequence) <= accepted) {
    return ohacFail(OHAC_ERROR_CODE.SEQUENCE_NOT_NEWER, 'sequence');
  }
  if (
    epoch.previousSequence !== input.acceptedSequence ||
    epoch.previousDigest !== input.acceptedDigest
  ) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'previousDigest');
  }
  return ohacOk(epoch);
};
