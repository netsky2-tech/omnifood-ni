import { canonicalizeOhac, ohacDigest } from '../contracts/canonical';
import {
  OHAC_ERROR_CODE,
  ohacFail,
  ohacOk,
  type OhacResult,
} from '../contracts/error-codes';
import {
  MINIMUM_ASSERTION_SCHEMA,
  OHAC_POLICY_STATUS,
  STAFF_POLICY_EPOCH_V1_SCHEMA,
  parseStaffPolicyEpochV1,
  type OhacPolicyStatus,
  type OhacRole,
  type StaffPolicyEpochEntryV1,
  type StaffPolicyEpochV1,
} from '../contracts/staff-policy-epoch.v1';
import { resolveEffectivePermissions } from '../../security/permissions.enum';

/**
 * Framework-free staff-policy epoch projector (design §4.1, §11.2 decisions
 * 13–15). Pure projection from typed source records to the canonical
 * `ohac.staff-policy-epoch.v1` body: no NestJS, TypeORM, bcrypt library,
 * repositories, clocks, or environment reads. Publication, persistence, and
 * dirty-marker bookkeeping stay outside this module.
 */

export interface StaffPolicyEpochSourceRecord {
  readonly userId: string;
  readonly role: string;
  readonly isActive: boolean;
  readonly pinHash: string | null;
  readonly customPermissions: readonly string[] | null;
  readonly attemptResetGeneration: string;
}

export interface StaffPolicyEpochProjectionMetadata {
  readonly tenantId: string;
  readonly targetTerminalId: string;
  readonly sequence: string;
  readonly previousSequence: string;
  readonly previousDigest: string;
  readonly publisherBackendBuild: string;
  readonly targetPosBuild: string;
}

// Only exact bcrypt prefixes map to a formatVersion; any other non-null
// prefix is a projection failure, never a silently defaulted '2b'
// (design §11.2 decision 15).
const BCRYPT_FORMAT_VERSIONS: Readonly<Record<string, string>> = {
  $2a$: '2a',
  $2b$: '2b',
  $2y$: '2y',
};

const byUtf16 = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const projectEntry = (
  record: StaffPolicyEpochSourceRecord,
): OhacResult<StaffPolicyEpochEntryV1> => {
  const formatVersion = record.pinHash
    ? BCRYPT_FORMAT_VERSIONS[record.pinHash.slice(0, 4)]
    : undefined;
  if (!formatVersion) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'pinVerifier');
  }
  // §4.1 rule 3: resolveEffectivePermissions, never the narrower
  // resolveInventoryBohPermissions. Dedupe and UTF-16 sort for the wire.
  const permissions = [
    ...new Set(
      resolveEffectivePermissions(record.role, record.customPermissions),
    ),
  ].sort(byUtf16);
  const status: OhacPolicyStatus = record.isActive
    ? OHAC_POLICY_STATUS.ACTIVE
    : OHAC_POLICY_STATUS.INACTIVE;
  return ohacOk({
    userId: record.userId,
    status,
    role: record.role as OhacRole,
    permissions,
    pinVerifier: {
      algorithm: 'bcrypt' as const,
      formatVersion,
      encoded: record.pinHash,
    },
    attemptResetGeneration: record.attemptResetGeneration,
  });
};

/**
 * Projects metadata plus source records into a self-validated epoch. Returns
 * the contract parser's stable failure for malformed metadata, sequences, or
 * generations, so no projector-specific error taxonomy is invented.
 */
export const projectStaffPolicyEpochV1 = (
  metadata: StaffPolicyEpochProjectionMetadata,
  records: readonly StaffPolicyEpochSourceRecord[],
): OhacResult<StaffPolicyEpochV1> => {
  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.userId)) {
      return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'userId');
    }
    seen.add(record.userId);
  }
  const projected: StaffPolicyEpochEntryV1[] = [];
  for (const record of records) {
    if (record.pinHash === null) continue;
    const entry = projectEntry(record);
    if (entry.ok === false) return entry;
    projected.push(entry.value);
  }
  // Known v1 limitation kept explicit: the contract rejects empty
  // policyEntries because it cannot represent revocation of the final
  // PIN-enabled user; surface that exact stable result (design §4.1).
  if (projected.length === 0) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'policyEntries');
  }
  projected.sort((a, b) => byUtf16(a.userId, b.userId));
  const body = {
    schema: STAFF_POLICY_EPOCH_V1_SCHEMA,
    tenantId: metadata.tenantId,
    targetTerminalId: metadata.targetTerminalId,
    sequence: metadata.sequence,
    previousSequence: metadata.previousSequence,
    previousDigest: metadata.previousDigest,
    publisherBackendBuild: metadata.publisherBackendBuild,
    targetPosBuild: metadata.targetPosBuild,
    minimumAssertionSchema: MINIMUM_ASSERTION_SCHEMA,
    policyEntries: projected,
  };
  const canonical = canonicalizeOhac(Buffer.from(JSON.stringify(body), 'utf8'));
  if (canonical.ok === false) return canonical;
  const digest = ohacDigest(canonical.value);
  return parseStaffPolicyEpochV1(
    Buffer.from(JSON.stringify({ ...body, digest }), 'utf8'),
  );
};
