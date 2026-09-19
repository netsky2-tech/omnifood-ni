import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  OHAC_ACK_RESULT_CODE,
  OHAC_ACK_STATUS,
  ackRequestHash,
  decideAcknowledgement,
  type OhacAckResultCode,
  type OhacAcknowledgementClaim,
} from '../contracts/acknowledgement';
import { OhacTenantTransaction } from '../rls/ohac-tenant-transaction';

/**
 * The receipt a terminal keeps after an accepted acknowledgement. It is
 * stable: a retry returns the stored receipt rather than issuing a new one,
 * so a lost response never costs a terminal its proof of acceptance.
 */
export interface OhacAckReceipt {
  readonly receiptId: string;
  readonly status: typeof OHAC_ACK_STATUS.ACCEPTED;
  readonly sequence: string;
  readonly digest: string;
  readonly floorSequence: string;
}

/**
 * Discriminated acknowledgement outcomes. A rejection is a normal answer the
 * terminal can act on, never an exception: only infrastructure failures and
 * detected corruption propagate.
 */
export type StaffPolicyAckOutcome =
  | { readonly status: 'accepted'; readonly receipt: OhacAckReceipt }
  | { readonly status: 'replayed'; readonly receipt: OhacAckReceipt }
  | {
      readonly status: 'rejected';
      readonly resultCode: OhacAckResultCode;
      readonly sequence: string;
    };

export interface AcknowledgeStaffPolicyEpochInput {
  readonly tenantId: string;
  readonly terminalId: string;
  readonly posBuild: string;
  readonly assertionSchema: string;
  readonly idempotencyKey: string;
  readonly claim: OhacAcknowledgementClaim;
}

interface AcceptedHistoryRow {
  readonly requestHash: string;
  readonly receiptId: string;
  readonly sequence: string;
  readonly digest: string;
  readonly floorSequence: string | null;
}

interface ReceiptRow {
  readonly receiptId: string;
}

interface FloorRow {
  readonly sequence: string;
  readonly digest: string;
}

interface EpochRow {
  readonly digest: string;
}

/**
 * Maps a stored accepted history row back to the receipt a terminal keeps.
 * `server_floor_sequence` is what the floor became when the acknowledgement
 * was accepted; the row's own sequence is the fallback for the degenerate
 * case of an accepted row written before that column was stamped, because the
 * two are equal for every acceptance this service records.
 */
const toReceipt = (row: AcceptedHistoryRow): OhacAckReceipt => ({
  receiptId: row.receiptId,
  status: OHAC_ACK_STATUS.ACCEPTED,
  sequence: row.sequence,
  digest: row.digest,
  floorSequence: row.floorSequence ?? row.sequence,
});

/**
 * Terminal acknowledgement of an applied policy epoch (design §4.1 rule 1,
 * §5.3, §9, §11.4 decision 28). Runs entirely inside the tenant-bound
 * transaction seam, takes the terminal and tenant from the caller's
 * authenticated principal rather than from the request body, and advances the
 * terminal's floor by compare-and-set so a concurrent acknowledgement can
 * never silently move it.
 *
 * The acceptance rules themselves live in `contracts/acknowledgement.ts`; this
 * service only supplies them the floor and the epoch and records what they
 * decided.
 */
@Injectable()
export class StaffPolicyEpochAcknowledgementService {
  constructor(private readonly transaction: OhacTenantTransaction) {}

  async acknowledge(
    input: AcknowledgeStaffPolicyEpochInput,
  ): Promise<StaffPolicyAckOutcome> {
    return await this.transaction.run(input.tenantId, async (manager) => {
      const requestHash = ackRequestHash(input.claim);

      // Idempotency is resolved before any decision. A retry that carries the
      // exact same claim returns the receipt the server already issued, which
      // is what makes a lost response survivable; the same key carrying
      // different content is a conflict and must never be answered with
      // somebody else's receipt.
      const replay = await this.findAcceptedByKey(input, manager);
      if (replay) {
        if (replay.requestHash !== requestHash) {
          await this.recordRejection(
            input,
            requestHash,
            OHAC_ACK_RESULT_CODE.IDEMPOTENCY_CONFLICT,
            manager,
          );
          return {
            status: 'rejected',
            resultCode: OHAC_ACK_RESULT_CODE.IDEMPOTENCY_CONFLICT,
            sequence: input.claim.sequence,
          };
        }
        return { status: 'replayed', receipt: toReceipt(replay) };
      }

      const floor = await this.readFloor(input, manager);
      const epoch = await this.readEpochAt(
        input.claim.sequence,
        input,
        manager,
      );
      const decision = decideAcknowledgement({
        claim: input.claim,
        floor,
        epoch,
      });

      if (decision.decision === 'reject') {
        await this.recordRejection(
          input,
          requestHash,
          decision.resultCode,
          manager,
        );
        return {
          status: 'rejected',
          resultCode: decision.resultCode,
          sequence: input.claim.sequence,
        };
      }

      if (decision.decision === 'already-accepted') {
        // The claim restates the floor, so an accepted history row for that
        // sequence must exist: this service is the only writer that advances
        // the floor, and it does so in the same transaction as the insert. A
        // missing row would mean the floor and the history disagree, which is
        // corruption rather than a client error, so it fails closed.
        const stored = await this.findAcceptedBySequence(
          input.claim.sequence,
          input,
          manager,
        );
        if (!stored) {
          throw new OhacAcknowledgementIntegrityError(
            `accepted floor at sequence ${input.claim.sequence} has no accepted history row`,
          );
        }
        return { status: 'replayed', receipt: toReceipt(stored) };
      }

      const receipt = await this.recordAcceptance(input, requestHash, manager);
      await this.advanceFloor(input, floor, manager);
      return { status: 'accepted', receipt };
    });
  }

  private async findAcceptedByKey(
    input: AcknowledgeStaffPolicyEpochInput,
    manager: EntityManager,
  ): Promise<AcceptedHistoryRow | undefined> {
    const rows: AcceptedHistoryRow[] = await manager.query(
      `SELECT request_hash AS "requestHash",
              ack_receipt_id AS "receiptId",
              sequence,
              digest,
              server_floor_sequence AS "floorSequence"
         FROM human_auth_terminal_ack_history
        WHERE tenant_id = $1
          AND terminal_id = $2
          AND idempotency_key = $3
          AND status = $4`,
      [
        input.tenantId,
        input.terminalId,
        input.idempotencyKey,
        OHAC_ACK_STATUS.ACCEPTED,
      ],
    );
    return rows[0];
  }

  private async findAcceptedBySequence(
    sequence: string,
    input: AcknowledgeStaffPolicyEpochInput,
    manager: EntityManager,
  ): Promise<AcceptedHistoryRow | undefined> {
    const rows: AcceptedHistoryRow[] = await manager.query(
      `SELECT request_hash AS "requestHash",
              ack_receipt_id AS "receiptId",
              sequence,
              digest,
              server_floor_sequence AS "floorSequence"
         FROM human_auth_terminal_ack_history
        WHERE tenant_id = $1
          AND terminal_id = $2
          AND sequence = $3
          AND status = $4`,
      [input.tenantId, input.terminalId, sequence, OHAC_ACK_STATUS.ACCEPTED],
    );
    return rows[0];
  }

  private async readFloor(
    input: AcknowledgeStaffPolicyEpochInput,
    manager: EntityManager,
  ): Promise<FloorRow | undefined> {
    const rows: FloorRow[] = await manager.query(
      `SELECT sequence, digest
         FROM human_auth_terminal_ack_floor
        WHERE tenant_id = $1 AND terminal_id = $2`,
      [input.tenantId, input.terminalId],
    );
    return rows[0];
  }

  private async readEpochAt(
    sequence: string,
    input: AcknowledgeStaffPolicyEpochInput,
    manager: EntityManager,
  ): Promise<EpochRow | undefined> {
    const rows: EpochRow[] = await manager.query(
      `SELECT digest
         FROM human_auth_policy_epochs
        WHERE tenant_id = $1 AND terminal_id = $2 AND sequence = $3`,
      [input.tenantId, input.terminalId, sequence],
    );
    return rows[0];
  }

  private async recordAcceptance(
    input: AcknowledgeStaffPolicyEpochInput,
    requestHash: string,
    manager: EntityManager,
  ): Promise<OhacAckReceipt> {
    // The receipt id is generated by the database, so no random source is
    // introduced here and the id is created in the same statement that
    // records the decision.
    const rows: ReceiptRow[] = await manager.query(
      `INSERT INTO human_auth_terminal_ack_history
         (tenant_id, terminal_id, sequence, previous_sequence, digest,
          previous_digest, status, idempotency_key, request_hash, pos_build,
          assertion_schema, ack_receipt_id, server_floor_sequence, decided_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
               gen_random_uuid(), $3, CURRENT_TIMESTAMP)
       RETURNING ack_receipt_id AS "receiptId"`,
      [
        input.tenantId,
        input.terminalId,
        input.claim.sequence,
        input.claim.previousSequence,
        input.claim.digest,
        input.claim.previousDigest,
        OHAC_ACK_STATUS.ACCEPTED,
        input.idempotencyKey,
        requestHash,
        input.posBuild,
        input.assertionSchema,
      ],
    );
    const receiptId = rows[0]?.receiptId;
    if (!receiptId) {
      throw new OhacAcknowledgementIntegrityError(
        'acceptance insert returned no receipt id',
      );
    }
    return {
      receiptId,
      status: OHAC_ACK_STATUS.ACCEPTED,
      sequence: input.claim.sequence,
      digest: input.claim.digest,
      floorSequence: input.claim.sequence,
    };
  }

  private async recordRejection(
    input: AcknowledgeStaffPolicyEpochInput,
    requestHash: string,
    resultCode: OhacAckResultCode,
    manager: EntityManager,
  ): Promise<void> {
    // Rejections are recorded with no receipt and no floor sequence, and the
    // append-only history keeps them as evidence of what a terminal attempted.
    await manager.query(
      `INSERT INTO human_auth_terminal_ack_history
         (tenant_id, terminal_id, sequence, previous_sequence, digest,
          previous_digest, status, result_code, idempotency_key, request_hash,
          pos_build, assertion_schema, decided_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
               CURRENT_TIMESTAMP)`,
      [
        input.tenantId,
        input.terminalId,
        input.claim.sequence,
        input.claim.previousSequence,
        input.claim.digest,
        input.claim.previousDigest,
        OHAC_ACK_STATUS.REJECTED,
        resultCode,
        input.idempotencyKey,
        requestHash,
        input.posBuild,
        input.assertionSchema,
      ],
    );
  }

  /**
   * Advances the terminal's floor by compare-and-set on the sequence it held
   * when the decision was made. A concurrent acknowledgement that already
   * moved the floor makes this update match no row, and the transaction then
   * fails rather than recording an acceptance the floor does not reflect:
   * silently ignoring the miss would let the stored floor and the record of
   * what the terminal applied disagree.
   */
  private async advanceFloor(
    input: AcknowledgeStaffPolicyEpochInput,
    floor: FloorRow | undefined,
    manager: EntityManager,
  ): Promise<void> {
    const expectedPrevious = floor?.sequence ?? '0';
    const rows: { sequence: string }[] = await manager.query(
      `INSERT INTO human_auth_terminal_ack_floor
         (tenant_id, terminal_id, sequence, digest, revision, updated_at)
       VALUES ($1, $2, $3, $4, 1, CURRENT_TIMESTAMP)
       ON CONFLICT (tenant_id, terminal_id) DO UPDATE
         SET sequence = EXCLUDED.sequence,
             digest = EXCLUDED.digest,
             revision = human_auth_terminal_ack_floor.revision + 1,
             updated_at = CURRENT_TIMESTAMP
       WHERE human_auth_terminal_ack_floor.sequence = $5
       RETURNING sequence`,
      [
        input.tenantId,
        input.terminalId,
        input.claim.sequence,
        input.claim.digest,
        expectedPrevious,
      ],
    );
    if (rows.length === 0) {
      // The compare-and-set matched no row, so another acknowledgement moved
      // the floor after this one read it. Failing here rolls the acceptance
      // back with it, instead of leaving a recorded acceptance the stored
      // floor does not reflect.
      throw new OhacAcknowledgementIntegrityError(
        `floor compare-and-set missed: expected sequence ${expectedPrevious}`,
      );
    }
  }
}

/**
 * Raised when the stored acknowledgement artifacts contradict each other, so
 * the request fails closed instead of returning a receipt the server cannot
 * justify.
 */
export class OhacAcknowledgementIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OhacAcknowledgementIntegrityError';
  }
}
