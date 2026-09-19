import {
  OHAC_ACK_RESULT_CODE,
  ackRequestHash,
  decideAcknowledgement,
  type OhacAcknowledgementClaim,
  type OhacAcknowledgementDecision,
} from './acknowledgement';
import { GENESIS_DIGEST } from './staff-policy-epoch.v1';

const DIGEST_A = 'sha256:' + 'a'.repeat(64);
const DIGEST_B = 'sha256:' + 'b'.repeat(64);

const claim = (
  overrides: Partial<OhacAcknowledgementClaim> = {},
): OhacAcknowledgementClaim => ({
  sequence: '1',
  digest: DIGEST_A,
  previousSequence: '0',
  previousDigest: GENESIS_DIGEST,
  ...overrides,
});

const decisionOf = (
  input: Parameters<typeof decideAcknowledgement>[0],
): OhacAcknowledgementDecision => decideAcknowledgement(input);

describe('decideAcknowledgement', () => {
  it('accepts a first acknowledgement that chains from GENESIS', () => {
    expect(decisionOf({ claim: claim(), epoch: { digest: DIGEST_A } })).toEqual(
      { decision: 'accept' },
    );
  });

  it('accepts the next acknowledgement when it continues the accepted head', () => {
    expect(
      decisionOf({
        claim: claim({
          sequence: '2',
          previousSequence: '1',
          previousDigest: DIGEST_A,
        }),
        floor: { sequence: '1', digest: DIGEST_A },
        epoch: { digest: DIGEST_A },
      }),
    ).toEqual({ decision: 'accept' });
  });

  it('rejects an epoch that was never materialized for this terminal', () => {
    expect(decisionOf({ claim: claim() })).toEqual({
      decision: 'reject',
      resultCode: OHAC_ACK_RESULT_CODE.UNKNOWN_EPOCH,
    });
  });

  it('rejects a claim whose digest is not the digest of that epoch', () => {
    expect(
      decisionOf({
        claim: claim({ digest: DIGEST_B }),
        epoch: { digest: DIGEST_A },
      }),
    ).toEqual({
      decision: 'reject',
      resultCode: OHAC_ACK_RESULT_CODE.DIGEST_MISMATCH,
    });
  });

  it('treats a restatement of the accepted head as an idempotent replay, not an error', () => {
    // The digest already matched, so this is the same acknowledgement arriving
    // twice; the stored receipt is authoritative and the floor must not move.
    expect(
      decisionOf({
        claim: claim({ sequence: '4', digest: DIGEST_A }),
        floor: { sequence: '4', digest: DIGEST_A },
        epoch: { digest: DIGEST_A },
      }),
    ).toEqual({ decision: 'already-accepted' });
  });

  it('rejects an acknowledgement behind the accepted head', () => {
    expect(
      decisionOf({
        claim: claim({
          sequence: '2',
          digest: DIGEST_A,
          previousSequence: '1',
          previousDigest: DIGEST_A,
        }),
        floor: { sequence: '5', digest: DIGEST_A },
        epoch: { digest: DIGEST_A },
      }),
    ).toEqual({
      decision: 'reject',
      resultCode: OHAC_ACK_RESULT_CODE.STALE_SEQUENCE,
    });
  });

  it('rejects a first acknowledgement that skips ahead of the epoch it is owed', () => {
    // Advancing the floor past an epoch the terminal never applied is exactly
    // the state recovery exists to repair, so a gap is never accepted.
    expect(
      decisionOf({
        claim: claim({
          sequence: '3',
          previousSequence: '2',
          previousDigest: DIGEST_A,
        }),
        epoch: { digest: DIGEST_A },
      }),
    ).toEqual({
      decision: 'reject',
      resultCode: OHAC_ACK_RESULT_CODE.SEQUENCE_GAP,
    });
  });

  it('rejects a later acknowledgement that skips the next epoch', () => {
    expect(
      decisionOf({
        claim: claim({
          sequence: '7',
          previousSequence: '6',
          previousDigest: DIGEST_A,
        }),
        floor: { sequence: '4', digest: DIGEST_A },
        epoch: { digest: DIGEST_A },
      }),
    ).toEqual({
      decision: 'reject',
      resultCode: OHAC_ACK_RESULT_CODE.SEQUENCE_GAP,
    });
  });

  it('rejects an in-order acknowledgement whose chain does not continue the accepted head', () => {
    expect(
      decisionOf({
        claim: claim({
          sequence: '5',
          previousSequence: '3',
          previousDigest: DIGEST_A,
        }),
        floor: { sequence: '4', digest: DIGEST_A },
        epoch: { digest: DIGEST_A },
      }),
    ).toEqual({
      decision: 'reject',
      resultCode: OHAC_ACK_RESULT_CODE.CHAIN_MISMATCH,
    });
  });

  it('rejects an in-order acknowledgement whose previous digest is wrong', () => {
    expect(
      decisionOf({
        claim: claim({
          sequence: '2',
          previousSequence: '1',
          previousDigest: DIGEST_B,
        }),
        floor: { sequence: '1', digest: DIGEST_A },
        epoch: { digest: DIGEST_A },
      }),
    ).toEqual({
      decision: 'reject',
      resultCode: OHAC_ACK_RESULT_CODE.CHAIN_MISMATCH,
    });
  });

  it('requires the first acknowledgement to claim the genesis chain', () => {
    expect(
      decisionOf({
        claim: claim({ previousSequence: '0', previousDigest: DIGEST_B }),
        epoch: { digest: DIGEST_A },
      }),
    ).toEqual({
      decision: 'reject',
      resultCode: OHAC_ACK_RESULT_CODE.CHAIN_MISMATCH,
    });
  });

  it('compares sequences numerically rather than lexically', () => {
    // `'10'` must be recognised as ahead of `'9'`; a string comparison would
    // call it stale and answer a terminal that is actually current with a
    // rejection it cannot act on.
    expect(
      decisionOf({
        claim: claim({
          sequence: '10',
          previousSequence: '9',
          previousDigest: DIGEST_A,
        }),
        floor: { sequence: '9', digest: DIGEST_A },
        epoch: { digest: DIGEST_A },
      }),
    ).toEqual({ decision: 'accept' });
  });
});

describe('ackRequestHash', () => {
  it('is deterministic for the same claim', () => {
    expect(ackRequestHash(claim())).toBe(ackRequestHash(claim()));
  });

  it('produces a canonical OHAC digest', () => {
    expect(ackRequestHash(claim())).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('changes when any claim field changes', () => {
    const base = ackRequestHash(claim());

    expect(ackRequestHash(claim({ digest: DIGEST_B }))).not.toBe(base);
    expect(ackRequestHash(claim({ sequence: '2' }))).not.toBe(base);
    expect(ackRequestHash(claim({ previousSequence: '9' }))).not.toBe(base);
    expect(ackRequestHash(claim({ previousDigest: DIGEST_B }))).not.toBe(base);
  });

  it('is stable across key order, so a re-serialized retry still matches', () => {
    const reordered = {
      previousDigest: GENESIS_DIGEST,
      digest: DIGEST_A,
      previousSequence: '0',
      sequence: '1',
    };

    expect(ackRequestHash(reordered)).toBe(ackRequestHash(claim()));
  });
});
