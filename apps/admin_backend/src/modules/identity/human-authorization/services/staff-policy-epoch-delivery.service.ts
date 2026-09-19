import { Injectable } from '@nestjs/common';
import {
  MINIMUM_ASSERTION_SCHEMA,
  STAFF_POLICY_EPOCH_V1_SCHEMA,
  type StaffPolicyEpochV1,
} from '../contracts/staff-policy-epoch.v1';
import { type OhacError } from '../contracts/error-codes';
import {
  StaffPolicyEpochMaterializationService,
  type StaffPolicyEpochMaterializationOutcome,
} from './staff-policy-epoch-materialization.service';

/**
 * Delivery vocabulary the transport layer renders directly (design §12). The
 * three statuses are the non-delivery answers the design names; the epoch
 * itself is carried by the `deliver` result.
 */
export const OHAC_DELIVERY_STATUS = {
  DISABLED: 'DISABLED',
  UPGRADE_REQUIRED: 'UPGRADE_REQUIRED',
  RECOVERY_REQUIRED: 'RECOVERY_REQUIRED',
} as const;

export type OhacDeliveryStatus =
  (typeof OHAC_DELIVERY_STATUS)[keyof typeof OHAC_DELIVERY_STATUS];

/**
 * Discriminated delivery results. `not-participating` and `up-to-date` are
 * deliberately distinct: the first means the client never opted in and the
 * transport must omit the authorization member entirely, so existing clients
 * keep exactly their previous behaviour; the second means an opted-in client
 * is already current. Neither may ever be rendered as `DISABLED`, which is an
 * explicit answer about the tenant's rollout state and never a synonym for
 * silence.
 */
export type StaffPolicyEpochDeliveryResult =
  | { readonly result: 'not-participating' }
  | { readonly result: 'up-to-date' }
  | { readonly result: 'status'; readonly status: OhacDeliveryStatus }
  | {
      readonly result: 'deliver';
      readonly epoch: StaffPolicyEpochV1;
      readonly sequence: string;
      readonly digest: string;
    };

/**
 * Already-parsed negotiation facts. Turning query parameters into these
 * values is the transport slice's job, so this service never parses strings
 * meant for transport.
 */
export interface NegotiateStaffPolicyEpochDeliveryInput {
  readonly tenantId: string;
  readonly terminalId: string;
  /** Absent means the client did not opt in at all. */
  readonly posBuild?: string | null;
  readonly supportedPolicySchemas?: readonly string[] | null;
  readonly supportedAssertionSchemas?: readonly string[] | null;
  /** Absent means the client reports no floor yet. */
  readonly localFloorSequence?: string | null;
}

/**
 * Resolves what a device-authenticated pull should answer about the staff
 * policy epoch (design §12, §11.4 decisions 24-28).
 *
 * This service owns no SQL beyond the floor read it delegates, opens no
 * transaction of its own, and never weakens the materialization service's
 * fail-closed behaviour: a materialization or integrity failure propagates
 * unchanged rather than becoming a member that would let a terminal believe
 * it is current. Parsing is already done by the caller; the checks below are
 * about eligibility, not about syntax.
 */
@Injectable()
export class StaffPolicyEpochDeliveryService {
  constructor(
    private readonly materialization: StaffPolicyEpochMaterializationService,
  ) {}

  async negotiate(
    input: NegotiateStaffPolicyEpochDeliveryInput,
  ): Promise<StaffPolicyEpochDeliveryResult> {
    // Precedence is fixed and documented so the outcome is never decided by
    // accident. It runs from the cheapest and most fundamental gate to the
    // most expensive: participation, then whether the negotiated build is
    // usable at all, then whether the client speaks the schemas the server
    // requires, then whether the client's floor is coherent with the
    // server's, and only then the materialization that may write a row.
    const posBuild = input.posBuild;
    if (posBuild === undefined || posBuild === null) {
      // No negotiation at all: a legacy client. Silence is correct here, and
      // it is the only case where silence is correct.
      return { result: 'not-participating' };
    }
    if (posBuild.trim().length === 0) {
      // The client opted in and cannot be served. Answering with silence
      // would look identical to a legacy client, so an unusable build is an
      // explicit upgrade answer instead.
      return {
        result: 'status',
        status: OHAC_DELIVERY_STATUS.UPGRADE_REQUIRED,
      };
    }
    if (
      !supports(input.supportedPolicySchemas, STAFF_POLICY_EPOCH_V1_SCHEMA) ||
      !supports(input.supportedAssertionSchemas, MINIMUM_ASSERTION_SCHEMA)
    ) {
      // A client that cannot parse the epoch, or cannot produce the minimum
      // assertion the verifier will require, is not eligible for epochs yet.
      return {
        result: 'status',
        status: OHAC_DELIVERY_STATUS.UPGRADE_REQUIRED,
      };
    }

    const serverFloor = await this.materialization.readAcceptedFloor({
      tenantId: input.tenantId,
      terminalId: input.terminalId,
    });
    if (floorAheadOf(input.localFloorSequence, serverFloor)) {
      // The client claims an epoch the server never acknowledged. Nothing
      // this path can serve would reconcile that, so it is a recovery
      // answer, never a silent rewind.
      return {
        result: 'status',
        status: OHAC_DELIVERY_STATUS.RECOVERY_REQUIRED,
      };
    }

    const materialized = await this.materialization.materialize({
      tenantId: input.tenantId,
      terminalId: input.terminalId,
      posBuild,
    });
    return mapMaterialization(materialized);
  }
}

const supports = (
  advertised: readonly string[] | null | undefined,
  required: string,
): boolean => Array.isArray(advertised) && advertised.includes(required);

/**
 * Reports whether the client's floor is ahead of the server's. Both values
 * are decimal strings, so they are compared numerically: comparing them as
 * strings would rank `'9'` above `'10'` and turn a valid, behind client into
 * a spurious recovery answer.
 */
const floorAheadOf = (
  localFloorSequence: string | null | undefined,
  serverFloorSequence: string,
): boolean => {
  const local = BigInt(localFloorSequence ?? '0');
  const server = BigInt(serverFloorSequence);
  return local > server;
};

/**
 * Maps the materialization outcome onto the delivery vocabulary. Nothing is
 * collapsed: a frozen epoch materialized for a different build is an upgrade
 * answer, a non-enabled cohort pair is a disabled answer, and a failure
 * propagates so the pull fails closed.
 */
const mapMaterialization = (
  outcome: StaffPolicyEpochMaterializationOutcome,
): StaffPolicyEpochDeliveryResult => {
  switch (outcome.status) {
    case 'deliver':
      return {
        result: 'deliver',
        epoch: outcome.epoch,
        sequence: outcome.sequence,
        digest: outcome.digest,
      };
    case 'nothing-to-deliver':
      return { result: 'up-to-date' };
    case 'cohort-disabled':
      return { result: 'status', status: OHAC_DELIVERY_STATUS.DISABLED };
    case 'build-mismatch':
      // The immutable epoch for this sequence was materialized for a build
      // this client no longer negotiates, and the table allows one row per
      // sequence, so the only honest answer is that the client must move to a
      // build the frozen epoch matches.
      return {
        result: 'status',
        status: OHAC_DELIVERY_STATUS.UPGRADE_REQUIRED,
      };
    case 'failed':
      throw new OhacDeliveryIntegrityError(outcome.error);
  }
};

/**
 * Raised when the stored artifacts cannot be trusted, so the pull fails
 * closed instead of returning a member that would let a terminal treat a
 * corrupt policy as current.
 */
export class OhacDeliveryIntegrityError extends Error {
  constructor(readonly ohacError: OhacError) {
    super(
      `OHAC delivery refused an untrusted artifact: ${
        ohacError.field === undefined
          ? ohacError.code
          : `${ohacError.code}/${ohacError.field}`
      }`,
    );
    this.name = 'OhacDeliveryIntegrityError';
  }
}
