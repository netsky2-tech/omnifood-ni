import { canonicalizeOhac, ohacDigest } from '../contracts/canonical';
import { type OhacResult } from '../contracts/error-codes';
import {
  MINIMUM_ASSERTION_SCHEMA,
  STAFF_POLICY_EPOCH_V1_SCHEMA,
  parseStaffPolicyEpochV1,
  type StaffPolicyEpochV1,
} from '../contracts/staff-policy-epoch.v1';
import {
  projectStaffPolicyEntriesV1,
  type StaffPolicySourceRecord,
} from './policy-entries';

/**
 * Framework-free staff-policy epoch projector (design §4.1, §11.2 decisions
 * 13–15). Pure projection from typed source records to the canonical
 * `ohac.staff-policy-epoch.v1` body: no NestJS, TypeORM, bcrypt library,
 * repositories, clocks, or environment reads. Publication, persistence, and
 * dirty-marker bookkeeping stay outside this module.
 */

// The entry rules live in policy-entries.ts so the terminal-agnostic
// snapshot projector reuses the exact same projection; this alias keeps the
// epoch projector's public surface unchanged.
export type StaffPolicyEpochSourceRecord = StaffPolicySourceRecord;

export interface StaffPolicyEpochProjectionMetadata {
  readonly tenantId: string;
  readonly targetTerminalId: string;
  readonly sequence: string;
  readonly previousSequence: string;
  readonly previousDigest: string;
  readonly publisherBackendBuild: string;
  readonly targetPosBuild: string;
}

/**
 * Projects metadata plus source records into a self-validated epoch. Entry
 * shaping and its stable failures come from the shared
 * `projectStaffPolicyEntriesV1`; returns the contract parser's stable
 * failure for malformed metadata, sequences, or generations, so no
 * projector-specific error taxonomy is invented.
 */
export const projectStaffPolicyEpochV1 = (
  metadata: StaffPolicyEpochProjectionMetadata,
  records: readonly StaffPolicyEpochSourceRecord[],
): OhacResult<StaffPolicyEpochV1> => {
  const entries = projectStaffPolicyEntriesV1(records);
  if (entries.ok === false) return entries;
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
    policyEntries: entries.value,
  };
  const canonical = canonicalizeOhac(Buffer.from(JSON.stringify(body), 'utf8'));
  if (canonical.ok === false) return canonical;
  const digest = ohacDigest(canonical.value);
  return parseStaffPolicyEpochV1(
    Buffer.from(JSON.stringify({ ...body, digest }), 'utf8'),
  );
};
