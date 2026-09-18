import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  GENESIS_DIGEST,
  MINIMUM_ASSERTION_SCHEMA,
  STAFF_POLICY_EPOCH_V1_SCHEMA,
  parseStaffPolicyEpochV1,
  type StaffPolicyEpochV1,
} from '../contracts/staff-policy-epoch.v1';
import {
  OHAC_ERROR_CODE,
  ohacFail,
  ohacOk,
  type OhacError,
  type OhacResult,
} from '../contracts/error-codes';
import { asObject, isNonEmptyString } from '../contracts/field-guards';
import {
  STAFF_POLICY_SNAPSHOT_V1_SCHEMA,
  type StaffPolicySnapshotV1,
} from '../projection/staff-policy-snapshot-projector';
import { materializeStaffPolicyEpochV1 } from '../projection/staff-policy-epoch-materializer';
import { OhacTenantTransaction } from '../rls/ohac-tenant-transaction';
import { STAFF_POLICY_COHORT_DECISION } from './staff-policy-source-reader';

/**
 * Discriminated materialization outcomes (design §4.1 rules 1-3, §11.4
 * decisions 24-28). Expected states are returned, never thrown: a pull that
 * has nothing to deliver, a build pair that is not cohort-enabled, or a
 * stored epoch frozen for a different build are normal terminal states, not
 * errors, and only unexpected infrastructure failures propagate as
 * exceptions.
 */
export type StaffPolicyEpochMaterializationOutcome =
  | {
      readonly status: 'deliver';
      readonly epoch: StaffPolicyEpochV1;
      readonly sequence: string;
      readonly digest: string;
    }
  | { readonly status: 'nothing-to-deliver' }
  | {
      readonly status: 'cohort-disabled';
      readonly decision: typeof STAFF_POLICY_COHORT_DECISION.DISABLED;
    }
  | {
      readonly status: 'build-mismatch';
      readonly storedTargetPosBuild: string;
      readonly storedPublisherBackendBuild: string;
    }
  | { readonly status: 'failed'; readonly error: OhacError };

export interface MaterializeStaffPolicyEpochInput {
  readonly tenantId: string;
  readonly terminalId: string;
  readonly posBuild: string;
}

interface TerminalAckFloorRow {
  readonly sequence: string;
  readonly digest: string;
}

interface SnapshotRow {
  readonly sequence: string;
  readonly publisherBackendBuild: string;
  readonly digest: string;
  readonly payload: unknown;
}

interface EpochRow {
  readonly payload: unknown;
  readonly digest: string;
  readonly targetPosBuild: string;
  readonly publisherBackendBuild: string;
}

/**
 * Validates the persisted snapshot payload before the pure materializer ever
 * sees it (design §11.4 decision 26 context, §4.1 rules 1-2). This is the
 * whole reason the service exists: `materializeStaffPolicyEpochV1` trusts its
 * input, and the payload column is jsonb read back from the database, so a
 * drifted or hostile stored body must be rejected with a stable OHAC failure
 * naming the offending field instead of being signed into a digest.
 *
 * The snapshot schema id, the tenant binding, the row sequence, the exact
 * publisher build (present, non-blank after trimming, and equal to the
 * column, so payload and column cannot disagree), the payload digest against
 * the row's signed digest column, the assertion schema constant, and a
 * non-empty entries array are all checked here; entry shaping inside the
 * array stays owned by the shared projection via the materializer's own
 * parser.
 */
const validateSnapshotPayload = (
  payload: unknown,
  tenantId: string,
  sequence: string,
  publisherBackendBuild: string,
  rowDigest: string,
): OhacResult<StaffPolicySnapshotV1> => {
  const object = asObject(payload);
  if (object === undefined) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'payload');
  }
  if (object.schema !== STAFF_POLICY_SNAPSHOT_V1_SCHEMA) {
    return ohacFail(OHAC_ERROR_CODE.UNSUPPORTED_SCHEMA, 'schema');
  }
  if (object.tenantId !== tenantId) {
    return ohacFail(OHAC_ERROR_CODE.TENANT_SCOPE_MISMATCH, 'tenantId');
  }
  if (object.sequence !== sequence) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'sequence');
  }
  if (
    !isNonEmptyString(object.publisherBackendBuild) ||
    object.publisherBackendBuild.trim().length === 0 ||
    object.publisherBackendBuild !== publisherBackendBuild
  ) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'publisherBackendBuild');
  }
  // The digest column is the publisher's signed value; a payload whose own
  // digest field disagrees with it drifted or was tampered with after
  // signing, so it must be rejected instead of re-signed into a fresh epoch.
  if (object.digest !== rowDigest) {
    return ohacFail(OHAC_ERROR_CODE.DIGEST_MISMATCH, 'digest');
  }
  if (object.minimumAssertionSchema !== MINIMUM_ASSERTION_SCHEMA) {
    return ohacFail(
      OHAC_ERROR_CODE.UNSUPPORTED_SCHEMA,
      'minimumAssertionSchema',
    );
  }
  if (
    !Array.isArray(object.policyEntries) ||
    object.policyEntries.length === 0
  ) {
    return ohacFail(OHAC_ERROR_CODE.INVALID_FIELD, 'policyEntries');
  }
  return ohacOk(object as unknown as StaffPolicySnapshotV1);
};

/**
 * Per-terminal staff-policy epoch materialization on pull (design §4.1 rules
 * 1-3, §4.2, §5.1, §11.2 decisions 17 and 19, §11.4 decisions 24-28). Runs
 * entirely inside the `OhacTenantTransaction` seam so `app.tenant_id` is
 * bound before the first statement, reads the terminal's own ack floor, and
 * materializes exactly the snapshot at the floor's successor sequence — each
 * terminal receives its missing epochs one at a time and its own chain must
 * stay contiguous, so the next epoch is the floor's successor, never the
 * newest snapshot. Every value is bound as a query parameter; nothing is
 * interpolated, and no failure is caught and swallowed.
 */
@Injectable()
export class StaffPolicyEpochMaterializationService {
  constructor(private readonly transaction: OhacTenantTransaction) {}

  async materialize(
    input: MaterializeStaffPolicyEpochInput,
  ): Promise<StaffPolicyEpochMaterializationOutcome> {
    return await this.transaction.run(
      input.tenantId,
      async (manager) => await this.materializeWithin(input, manager),
    );
  }

  private async materializeWithin(
    input: MaterializeStaffPolicyEpochInput,
    manager: EntityManager,
  ): Promise<StaffPolicyEpochMaterializationOutcome> {
    // The terminal's previous chain comes from its own ack floor, never from
    // the tenant snapshot: a terminal that joined late materializes each
    // missing epoch against its own accepted head. An absent floor means the
    // terminal has never acknowledged, so its chain starts at 0/GENESIS;
    // these defaults must never come from the tenant snapshot, whose chain
    // fields describe tenant-level snapshot succession instead.
    const floor = await this.readAckFloor(input, manager);
    const previousSequence = floor?.sequence ?? '0';
    const previousDigest = floor?.digest ?? GENESIS_DIGEST;
    const nextSequence = (BigInt(previousSequence) + 1n).toString();

    // Deliver exactly the snapshot at the floor's successor: the epoch's
    // `sequence` must equal `previousSequence + 1` for the contract parser to
    // accept the terminal chain, so walking the tenant snapshots one at a
    // time is what keeps the terminal contiguous.
    const snapshot = await this.readSnapshotAt(
      input.tenantId,
      nextSequence,
      manager,
    );
    if (!snapshot) return { status: 'nothing-to-deliver' };

    // The cohort decision is resolved for the exact negotiated build pair.
    // When no enabled cohort matches, nothing is materialized on purpose:
    // the epoch row is immutable, so writing it while the pair is not
    // enabled would freeze a decision that was not true when it was written.
    const cohortEnabled = await this.hasEnabledCohort(input, snapshot, manager);
    if (!cohortEnabled) {
      return {
        status: 'cohort-disabled',
        decision: STAFF_POLICY_COHORT_DECISION.DISABLED,
      };
    }

    const validated = validateSnapshotPayload(
      snapshot.payload,
      input.tenantId,
      snapshot.sequence,
      snapshot.publisherBackendBuild,
      snapshot.digest,
    );
    if (validated.ok === false)
      return { status: 'failed', error: validated.error };

    const epoch = materializeStaffPolicyEpochV1(validated.value, {
      targetTerminalId: input.terminalId,
      targetPosBuild: input.posBuild,
      previousSequence,
      previousDigest,
    });
    // Propagate the pure materializer's failure unchanged: entry shaping and
    // its stable failures are owned by the shared projection.
    if (epoch.ok === false) return { status: 'failed', error: epoch.error };

    await this.insertEpoch(input, epoch.value, manager);
    return await this.readBackAuthoritative(
      input,
      epoch.value.sequence,
      epoch.value.publisherBackendBuild,
      manager,
    );
  }

  private async readAckFloor(
    input: MaterializeStaffPolicyEpochInput,
    manager: EntityManager,
  ): Promise<TerminalAckFloorRow | undefined> {
    const rows: TerminalAckFloorRow[] = await manager.query(
      `SELECT sequence, digest
         FROM human_auth_terminal_ack_floor
        WHERE tenant_id = $1 AND terminal_id = $2`,
      [input.tenantId, input.terminalId],
    );
    return rows[0];
  }

  private async readSnapshotAt(
    tenantId: string,
    nextSequence: string,
    manager: EntityManager,
  ): Promise<SnapshotRow | undefined> {
    const rows: SnapshotRow[] = await manager.query(
      `SELECT sequence,
              publisher_backend_build AS "publisherBackendBuild",
              digest,
              payload
         FROM human_auth_policy_snapshots
        WHERE tenant_id = $1 AND sequence = $2`,
      [tenantId, nextSequence],
    );
    return rows[0];
  }

  private async hasEnabledCohort(
    input: MaterializeStaffPolicyEpochInput,
    snapshot: SnapshotRow,
    manager: EntityManager,
  ): Promise<boolean> {
    // The exact pair: the negotiated POS build and the snapshot's own
    // publisher build. The tenant is never cast to uuid — these tables are
    // varchar(128).
    const rows: unknown[] = await manager.query(
      `SELECT 1
         FROM human_auth_rollout_cohorts
        WHERE tenant_id = $1 AND enabled = TRUE AND pos_build = $2 AND backend_build = $3
        LIMIT 1`,
      [input.tenantId, input.posBuild, snapshot.publisherBackendBuild],
    );
    return rows.length > 0;
  }

  private async insertEpoch(
    input: MaterializeStaffPolicyEpochInput,
    epoch: StaffPolicyEpochV1,
    manager: EntityManager,
  ): Promise<void> {
    // ON CONFLICT DO NOTHING against the unique (tenant_id, terminal_id,
    // sequence) constraint: a concurrent or earlier pull that already
    // materialized this epoch must never abort this one. The cohort decision
    // is recorded with the same constant the publisher persists (§4.1 rule
    // 2); only an enabled pair reaches this statement, so it is ELIGIBLE.
    await manager.query(
      `INSERT INTO human_auth_policy_epochs
         (tenant_id, terminal_id, schema, sequence, previous_sequence,
          previous_digest, publisher_backend_build, target_pos_build,
          minimum_assertion_schema, cohort_decision, digest, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (tenant_id, terminal_id, sequence) DO NOTHING`,
      [
        input.tenantId,
        input.terminalId,
        STAFF_POLICY_EPOCH_V1_SCHEMA,
        epoch.sequence,
        epoch.previousSequence,
        epoch.previousDigest,
        epoch.publisherBackendBuild,
        epoch.targetPosBuild,
        epoch.minimumAssertionSchema,
        STAFF_POLICY_COHORT_DECISION.ELIGIBLE,
        epoch.digest,
        epoch as unknown as Record<string, unknown>,
      ],
    );
  }

  /**
   * Reads back the authoritative row for the key and delivers it. The
   * read-back is what makes a repeated pull safe: `ON CONFLICT DO NOTHING`
   * cannot report whether the insert landed or lost the race, and the
   * winning row — not this call's freshly materialized body — is the
   * canonical epoch for the key. Returning the stored payload and digest
   * therefore turns a concurrent duplicate pull into the same deliverable
   * outcome instead of a failure or a second row.
   *
   * The stored row is never simply trusted. The insert above may have been
   * the no-op of an earlier pull, so the stored row is this call's input,
   * not its output; the payload column is jsonb read back from the database
   * and can drift or be tampered with after signing; and the row's frozen
   * build pair can have stopped matching reality. Three guards run before
   * delivery, each fail-closed:
   *
   * 1. Build pair: the row's `target_pos_build` and
   *    `publisher_backend_build` are compared with the negotiated build and
   *    the snapshot's backend build. The epoch row is immutable and unique
   *    per `(tenant_id, terminal_id, sequence)`, so a build change cannot be
   *    repaired in place: the digest covers the whole body including both
   *    builds, so rewriting them would forge a signed projection, and a
   *    second row for the same sequence is impossible. A different build
   *    pair is instead served by a new snapshot publication at a new
   *    sequence; until then the stored epoch returns `build-mismatch`, which
   *    the negotiation slice maps to an upgrade-required response rather
   *    than to a policy.
   * 2. Body parse: the stored payload is re-parsed, because a row this code
   *    cannot parse must never be handed to a terminal.
   * 3. Digest: the payload's own `digest` field must equal the row's
   *    `digest` column — the tamper check the column exists for.
   */
  private async readBackAuthoritative(
    input: MaterializeStaffPolicyEpochInput,
    sequence: string,
    publisherBackendBuild: string,
    manager: EntityManager,
  ): Promise<StaffPolicyEpochMaterializationOutcome> {
    const rows: EpochRow[] = await manager.query(
      `SELECT payload,
              digest,
              target_pos_build AS "targetPosBuild",
              publisher_backend_build AS "publisherBackendBuild"
         FROM human_auth_policy_epochs
        WHERE tenant_id = $1 AND terminal_id = $2 AND sequence = $3`,
      [input.tenantId, input.terminalId, sequence],
    );
    const row = rows[0];
    if (!row) {
      return {
        status: 'failed',
        error: { code: OHAC_ERROR_CODE.MISSING_FIELD, field: 'payload' },
      };
    }
    if (
      row.targetPosBuild !== input.posBuild ||
      row.publisherBackendBuild !== publisherBackendBuild
    ) {
      return {
        status: 'build-mismatch',
        storedTargetPosBuild: row.targetPosBuild,
        storedPublisherBackendBuild: row.publisherBackendBuild,
      };
    }
    const parsed = parseStaffPolicyEpochV1(
      Buffer.from(JSON.stringify(row.payload), 'utf8'),
    );
    if (parsed.ok === false) return { status: 'failed', error: parsed.error };
    if (parsed.value.digest !== row.digest) {
      return {
        status: 'failed',
        error: { code: OHAC_ERROR_CODE.DIGEST_MISMATCH, field: 'digest' },
      };
    }
    return {
      status: 'deliver',
      epoch: parsed.value,
      sequence: parsed.value.sequence,
      digest: row.digest,
    };
  }
}
