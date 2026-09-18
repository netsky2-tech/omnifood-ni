import {
  OHAC_ERROR_CODE,
  ohacFail,
  ohacOk,
  type OhacResult,
} from '../contracts/error-codes';
import {
  OHAC_POLICY_STATUS,
  type OhacPolicyStatus,
  type OhacRole,
  type StaffPolicyEpochEntryV1,
} from '../contracts/staff-policy-epoch.v1';
import { resolveEffectivePermissions } from '../../security/permissions.enum';

/**
 * Framework-free staff-policy entry projection shared by the per-terminal
 * epoch projector and the terminal-agnostic snapshot projector (design §4.1
 * rules 1–5, §11.2 decisions 13–15, 17–18). One implementation so the two
 * projections cannot drift: no NestJS, TypeORM, bcrypt library, repositories,
 * clocks, or environment reads.
 */

export interface StaffPolicySourceRecord {
  readonly userId: string;
  readonly role: string;
  readonly isActive: boolean;
  readonly pinHash: string | null;
  readonly customPermissions: readonly string[] | null;
  readonly attemptResetGeneration: string;
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
  record: StaffPolicySourceRecord,
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
 * Projects source records into the sorted, deduplicated
 * `StaffPolicyEpochEntryV1[]` both wire bodies carry, preserving every
 * stable OHAC failure of the original epoch projector: duplicate `userId`
 * (`INVALID_FIELD`/`userId`), an unsupported hash prefix
 * (`INVALID_FIELD`/`pinVerifier`), and an empty projected policy
 * (`INVALID_FIELD`/`policyEntries` — decision 18 fails closed because an
 * empty policy could not revoke the final PIN-enabled user).
 */
export const projectStaffPolicyEntriesV1 = (
  records: readonly StaffPolicySourceRecord[],
): OhacResult<StaffPolicyEpochEntryV1[]> => {
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
  if (projected.length === 0) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'policyEntries');
  }
  projected.sort((a, b) => byUtf16(a.userId, b.userId));
  return ohacOk(projected);
};
