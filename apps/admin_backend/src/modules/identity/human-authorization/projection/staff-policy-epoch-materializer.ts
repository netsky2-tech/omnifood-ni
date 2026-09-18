import { canonicalizeOhac, ohacDigest } from '../contracts/canonical';
import {
  OHAC_ERROR_CODE,
  ohacFail,
  type OhacResult,
} from '../contracts/error-codes';
import { isNonEmptyString } from '../contracts/field-guards';
import {
  STAFF_POLICY_EPOCH_V1_SCHEMA,
  parseStaffPolicyEpochV1,
  type StaffPolicyEpochV1,
} from '../contracts/staff-policy-epoch.v1';
import {
  STAFF_POLICY_SNAPSHOT_V1_SCHEMA,
  type StaffPolicySnapshotV1,
} from './staff-policy-snapshot-projector';

export interface StaffPolicyEpochMaterializationTerminal {
  readonly targetTerminalId: string;
  readonly targetPosBuild: string;
  readonly previousSequence: string;
  readonly previousDigest: string;
}

/**
 * Framework-free staff-policy epoch materializer (design §4.1 rules 1–5,
 * §11.2 decisions 17, 19, 23, §11.4 decisions 24–28). Pull-time projection
 * from a persisted terminal-agnostic snapshot plus terminal facts to the
 * canonical `ohac.staff-policy-epoch.v1` body: no NestJS, TypeORM, database,
 * clock, environment, or filesystem access. Publication, persistence, and
 * pull orchestration stay outside this module.
 */

/**
 * Materializes the per-terminal epoch a terminal receives on its first pull
 * of a snapshot. The epoch carries the epoch schema id, never the snapshot's,
 * and is self-validated with `parseStaffPolicyEpochV1` so no body the
 * contract rejects can be returned.
 *
 * The chain comes from the terminal, never from the snapshot: the snapshot's
 * `previousSequence`/`previousDigest` are tenant-level chain facts between
 * snapshots. A terminal that joined late materializes snapshot N against its
 * own accepted head, and because `sequence` comes from the snapshot it walks
 * the tenant snapshots one at a time; the contract parser enforces
 * contiguity, so no second chain rule lives here.
 */
export const materializeStaffPolicyEpochV1 = (
  snapshot: StaffPolicySnapshotV1,
  terminal: StaffPolicyEpochMaterializationTerminal,
): OhacResult<StaffPolicyEpochV1> => {
  // Reject a foreign artifact rather than silently accepting it: only the
  // terminal-agnostic snapshot schema may be materialized into an epoch.
  if (snapshot.schema !== STAFF_POLICY_SNAPSHOT_V1_SCHEMA) {
    return ohacFail(OHAC_ERROR_CODE.UNSUPPORTED_SCHEMA, 'schema');
  }
  // Fail closed before signing anything into the digest: the contract parser
  // only checks non-emptiness, so a whitespace-only terminal id or build
  // would otherwise pass self-validation. The field names are the ones the
  // parser reports for these fields (`targetTerminalId`, `build`).
  if (
    !isNonEmptyString(terminal.targetTerminalId) ||
    terminal.targetTerminalId.trim().length === 0
  ) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'targetTerminalId');
  }
  if (
    !isNonEmptyString(terminal.targetPosBuild) ||
    terminal.targetPosBuild.trim().length === 0
  ) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'build');
  }
  // Same fail-closed check for the backend build carried on the snapshot. The
  // snapshot projector and the epoch parser both use a non-trimming
  // non-emptiness check, so without this a whitespace-only backend build would
  // validate on both sides, be signed into the digest, and be delivered.
  if (
    !isNonEmptyString(snapshot.publisherBackendBuild) ||
    snapshot.publisherBackendBuild.trim().length === 0
  ) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'build');
  }
  const body = {
    schema: STAFF_POLICY_EPOCH_V1_SCHEMA,
    tenantId: snapshot.tenantId,
    targetTerminalId: terminal.targetTerminalId,
    sequence: snapshot.sequence,
    previousSequence: terminal.previousSequence,
    previousDigest: terminal.previousDigest,
    publisherBackendBuild: snapshot.publisherBackendBuild,
    targetPosBuild: terminal.targetPosBuild,
    minimumAssertionSchema: snapshot.minimumAssertionSchema,
    // Carried through unchanged: entry shaping, sorting, dedup, and
    // permission derivation are owned by the shared entry projection, and
    // re-applying them here would be a second implementation.
    policyEntries: snapshot.policyEntries,
  };
  const canonical = canonicalizeOhac(Buffer.from(JSON.stringify(body), 'utf8'));
  if (canonical.ok === false) return canonical;
  const digest = ohacDigest(canonical.value);
  return parseStaffPolicyEpochV1(
    Buffer.from(JSON.stringify({ ...body, digest }), 'utf8'),
  );
};
