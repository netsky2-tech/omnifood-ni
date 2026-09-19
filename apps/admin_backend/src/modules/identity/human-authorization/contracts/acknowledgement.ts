import { canonicalizeOhac, ohacDigest } from './canonical';
import { GENESIS_DIGEST } from './staff-policy-epoch.v1';

/**
 * Acknowledgement vocabulary and decision (design §4.1 rule 1, §5.3, §9,
 * §11.4 decision 28). Framework-free by construction: no NestJS, TypeORM,
 * database, clock, environment, or filesystem access, so the acceptance rules
 * are testable without a server and identical whenever they are evaluated.
 */

export const OHAC_ACK_STATUS = {
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
} as const;

export type OhacAckStatus =
  (typeof OHAC_ACK_STATUS)[keyof typeof OHAC_ACK_STATUS];

/**
 * Stable rejection codes. They are the machine-readable reason a terminal
 * can act on, so a terminal never has to parse prose to learn what to do.
 */
export const OHAC_ACK_RESULT_CODE = {
  /** The claimed sequence was never materialized for this terminal. */
  UNKNOWN_EPOCH: 'UNKNOWN_EPOCH',
  /** The claimed digest is not the digest of the epoch at that sequence. */
  DIGEST_MISMATCH: 'DIGEST_MISMATCH',
  /** The client skipped ahead of the next epoch it is owed. */
  SEQUENCE_GAP: 'SEQUENCE_GAP',
  /** The client acknowledged behind the floor it already holds. */
  STALE_SEQUENCE: 'STALE_SEQUENCE',
  /** The claimed chain does not continue the terminal's accepted head. */
  CHAIN_MISMATCH: 'CHAIN_MISMATCH',
  /** The same idempotency key was already used for a different request. */
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
} as const;

export type OhacAckResultCode =
  (typeof OHAC_ACK_RESULT_CODE)[keyof typeof OHAC_ACK_RESULT_CODE];

/** The acknowledged episode, as claimed by the terminal. */
export interface OhacAcknowledgementClaim {
  readonly sequence: string;
  readonly digest: string;
  readonly previousSequence: string;
  readonly previousDigest: string;
}

/** The terminal's accepted head, or absent when it never acknowledged. */
export interface OhacAcceptedFloor {
  readonly sequence: string;
  readonly digest: string;
}

export type OhacAcknowledgementDecision =
  | { readonly decision: 'accept' }
  /**
   * The claim restates the floor exactly, so the acknowledgement was already
   * applied: the stored receipt is returned and the floor is left untouched.
   */
  | { readonly decision: 'already-accepted' }
  | {
      readonly decision: 'reject';
      readonly resultCode: OhacAckResultCode;
    };

/**
 * Decides an acknowledgement against the terminal's own accepted head and the
 * epoch that sequence actually carries.
 *
 * The order below is the whole contract and is deliberate: the epoch must
 * exist before anything else can be judged, the claimed digest must be that
 * epoch's digest before the claim means anything, a restatement of the floor
 * is an idempotent replay rather than an error, and only then are the
 * sequence and chain rules applied. A terminal that acknowledges out of order
 * is rejected with a gap code and never silently advanced, because advancing
 * the floor past an epoch the terminal never applied is exactly the state
 * recovery exists to repair.
 */
export const decideAcknowledgement = (input: {
  readonly claim: OhacAcknowledgementClaim;
  readonly floor?: OhacAcceptedFloor;
  readonly epoch?: { readonly digest: string };
}): OhacAcknowledgementDecision => {
  const { claim, floor, epoch } = input;
  if (epoch === undefined) {
    return reject(OHAC_ACK_RESULT_CODE.UNKNOWN_EPOCH);
  }
  if (epoch.digest !== claim.digest) {
    return reject(OHAC_ACK_RESULT_CODE.DIGEST_MISMATCH);
  }
  if (floor !== undefined && claim.sequence === floor.sequence) {
    // Same sequence, same digest, because the digest check above already
    // passed: the terminal is repeating an acknowledgement the server
    // recorded, so the stored receipt is authoritative and the floor must not
    // move. A same-sequence claim with a different digest cannot reach here,
    // which is why no separate code exists for it.
    return { decision: 'already-accepted' };
  }
  if (floor !== undefined && isBefore(claim.sequence, floor.sequence)) {
    return reject(OHAC_ACK_RESULT_CODE.STALE_SEQUENCE);
  }

  const expectedSequence =
    floor === undefined ? '1' : increment(floor.sequence);
  if (claim.sequence !== expectedSequence) {
    return reject(OHAC_ACK_RESULT_CODE.SEQUENCE_GAP);
  }

  const expectedPreviousSequence = floor?.sequence ?? '0';
  const expectedPreviousDigest = floor?.digest ?? GENESIS_DIGEST;
  if (
    claim.previousSequence !== expectedPreviousSequence ||
    claim.previousDigest !== expectedPreviousDigest
  ) {
    return reject(OHAC_ACK_RESULT_CODE.CHAIN_MISMATCH);
  }
  return { decision: 'accept' };
};

const reject = (
  resultCode: OhacAckResultCode,
): OhacAcknowledgementDecision => ({
  decision: 'reject',
  resultCode,
});

/** Compares two canonical decimal strings numerically, not lexically. */
const isBefore = (left: string, right: string): boolean =>
  BigInt(left) < BigInt(right);

const increment = (sequence: string): string =>
  (BigInt(sequence) + 1n).toString();

/**
 * Deterministic hash of the acknowledgement request body, so a retry that
 * reuses an idempotency key with different content is detectable (design §9:
 * the same key and hash returns the original receipt, a different retry is
 * denied).
 *
 * Only the claim fields take part. Transport facts such as the negotiated
 * build are recorded on the row but excluded from the hash, so a terminal
 * that retries after a build negotiation change still matches its own earlier
 * request instead of being denied as a conflict.
 */
export const ackRequestHash = (claim: OhacAcknowledgementClaim): string => {
  const canonical = canonicalizeOhac(
    Buffer.from(
      JSON.stringify({
        sequence: claim.sequence,
        digest: claim.digest,
        previousSequence: claim.previousSequence,
        previousDigest: claim.previousDigest,
      }),
      'utf8',
    ),
  );
  if (canonical.ok === false) {
    // Unreachable for the fixed shape above: every value is a string and no
    // key is ever null. Throwing keeps the contract honest instead of
    // returning a hash of something the caller did not send.
    throw new Error(
      `acknowledgement request hash failed to canonicalize: ${canonical.error.code}`,
    );
  }
  return ohacDigest(canonical.value);
};
