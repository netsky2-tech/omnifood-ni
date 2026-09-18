import { canonicalizeOhac, ohacDigest } from '../contracts/canonical';
import {
  OHAC_ERROR_CODE,
  ohacFail,
  ohacOk,
  type OhacResult,
} from '../contracts/error-codes';
import {
  isDigest,
  isInt64DecimalString,
  isLowercaseUuid,
  isNonEmptyString,
} from '../contracts/field-guards';
import {
  GENESIS_DIGEST,
  MINIMUM_ASSERTION_SCHEMA,
  type StaffPolicyEpochEntryV1,
} from '../contracts/staff-policy-epoch.v1';
import {
  projectStaffPolicyEntriesV1,
  type StaffPolicySourceRecord,
} from './policy-entries';

/**
 * Why a dedicated schema id (design §4.2, §11.2 decisions 17–19): the v1
 * epoch contract requires a non-empty `targetTerminalId` and
 * `targetPosBuild`, and its digest covers the whole body including both, so
 * a terminal-agnostic snapshot can neither parse as `v1` nor reuse the v1
 * digest. Per decision 17 the publisher persists one terminal-agnostic
 * policy snapshot per `(tenantId, sequence)` and materializes the
 * per-terminal epoch, digest included, on that terminal's first pull from
 * the canonical relation and the negotiated build — so the per-terminal
 * digest stays a pull-time concern, never a snapshot field.
 */
export const STAFF_POLICY_SNAPSHOT_V1_SCHEMA =
  'ohac.staff-policy-snapshot.v1' as const;

export interface StaffPolicySnapshotProjectionMetadata {
  readonly tenantId: string;
  readonly sequence: string;
  readonly previousSequence: string;
  readonly previousDigest: string;
  readonly publisherBackendBuild: string;
}

export interface StaffPolicySnapshotV1 {
  readonly schema: typeof STAFF_POLICY_SNAPSHOT_V1_SCHEMA;
  readonly tenantId: string;
  readonly sequence: string;
  readonly previousSequence: string;
  readonly previousDigest: string;
  readonly publisherBackendBuild: string;
  readonly minimumAssertionSchema: string;
  readonly policyEntries: readonly StaffPolicyEpochEntryV1[];
  readonly digest: string;
}

/**
 * Framework-free staff-policy snapshot projector (design §11.2 decisions
 * 17–19). Pure projection from typed source records to the canonical
 * `ohac.staff-policy-snapshot.v1` body: no NestJS, TypeORM, bcrypt library,
 * repositories, clocks, or environment reads. Publication, persistence, and
 * the tenant-global sequence derivation stay outside this module.
 */

// Mirrors the epoch contract parser: exactly GENESIS or a canonical
// lowercase sha256 digest.
const isGenesisOrDigest = (value: unknown): value is string =>
  value === GENESIS_DIGEST || isDigest(value);

/**
 * Validates snapshot metadata exactly as `parseStaffPolicyEpochV1` validates
 * the corresponding epoch fields, so malformed input returns the same stable
 * OHAC failures instead of a projector-specific taxonomy: `tenantId`,
 * `sequence`, `previousSequence`, `previousDigest`, `build`, and the chain
 * rules (`previousSequence === 0` requires `GENESIS`, `previousSequence > 0`
 * requires a canonical digest, `sequence === previousSequence + 1`).
 */
const validateMetadata = (
  metadata: StaffPolicySnapshotProjectionMetadata,
): OhacResult<void> => {
  if (!isLowercaseUuid(metadata.tenantId)) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'tenantId');
  }
  if (!isInt64DecimalString(metadata.sequence)) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'sequence');
  }
  if (!isInt64DecimalString(metadata.previousSequence)) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'previousSequence');
  }
  if (!isGenesisOrDigest(metadata.previousDigest)) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'previousDigest');
  }
  if (!isNonEmptyString(metadata.publisherBackendBuild)) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'build');
  }
  // Sequences are contiguous decimal strings; sequence 1 chains from
  // GENESIS, later sequences from a canonical previous digest.
  const sequence = BigInt(metadata.sequence);
  const previousSequence = BigInt(metadata.previousSequence);
  if (
    sequence !== previousSequence + 1n ||
    (previousSequence === 0n && metadata.previousDigest !== GENESIS_DIGEST) ||
    (previousSequence > 0n && !isDigest(metadata.previousDigest))
  ) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'sequence');
  }
  return ohacOk(undefined);
};

/**
 * Projects metadata plus source records into a terminal-agnostic snapshot.
 * Entry shaping and its stable failures come from the shared
 * `projectStaffPolicyEntriesV1`, so the epoch and snapshot projections
 * cannot drift; the digest covers the whole body except `digest` through
 * OHAC-C14N-1 (§7.2) and the body carries no `targetTerminalId` and no
 * `targetPosBuild` (decision 17).
 */
export const projectStaffPolicySnapshotV1 = (
  metadata: StaffPolicySnapshotProjectionMetadata,
  records: readonly StaffPolicySourceRecord[],
): OhacResult<StaffPolicySnapshotV1> => {
  const entries = projectStaffPolicyEntriesV1(records);
  if (entries.ok === false) return entries;
  const validated = validateMetadata(metadata);
  if (validated.ok === false) return validated;
  const body = {
    schema: STAFF_POLICY_SNAPSHOT_V1_SCHEMA,
    tenantId: metadata.tenantId,
    sequence: metadata.sequence,
    previousSequence: metadata.previousSequence,
    previousDigest: metadata.previousDigest,
    publisherBackendBuild: metadata.publisherBackendBuild,
    minimumAssertionSchema: MINIMUM_ASSERTION_SCHEMA,
    policyEntries: entries.value,
  };
  const canonical = canonicalizeOhac(Buffer.from(JSON.stringify(body), 'utf8'));
  if (canonical.ok === false) return canonical;
  const digest = ohacDigest(canonical.value);
  return ohacOk({ ...body, digest });
};
