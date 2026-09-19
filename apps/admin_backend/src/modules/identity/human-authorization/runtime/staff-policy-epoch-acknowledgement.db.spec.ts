import { randomUUID } from 'crypto';
import { OHAC_ACK_RESULT_CODE } from '../contracts/acknowledgement';
import { GENESIS_DIGEST } from '../contracts/staff-policy-epoch.v1';
import type { AcknowledgeStaffPolicyEpochInput } from '../services/staff-policy-epoch-acknowledgement.service';
import {
  createOhacPublicationFixture,
  type OhacPublicationFixture,
} from './ohac-publication-db.fixture';

/**
 * Real-database coverage for the terminal acknowledgement path (design §4.1
 * rule 1, §5.3, §9). What is asserted here is server behaviour no mock can
 * stand in for: the append-only trigger on the history, the partial unique
 * indexes that make an accepted sequence and an idempotency key single-use,
 * the floor's monotonic guard, and the compare-and-set under a real race.
 */
describe('StaffPolicyEpochAcknowledgementService on the restricted real database', () => {
  const BUILD = 'pos-build-1';
  const BACKEND_BUILD = 'backend-build-1';
  const PIN_HASH = '$2b$10$abcdefghijklmnopqrstuv';
  const staff = [
    {
      role: 'MANAGER',
      isActive: true,
      pinHash: PIN_HASH,
      customPermissions: [],
    },
  ];

  let fixture: OhacPublicationFixture;

  beforeAll(async () => {
    fixture = await createOhacPublicationFixture();
  }, 60_000);

  afterAll(async () => {
    await fixture?.close();
  });

  /**
   * Brings a terminal to a real materialized epoch and returns the digest the
   * terminal would acknowledge. Going through materialization rather than
   * seeding an epoch row keeps this spec honest: an acknowledgement is only
   * ever accepted for an epoch the delivery path actually produced.
   */
  const materializeFor = async (tenantId: string, terminalId: string) => {
    await fixture.seedProjectedSnapshot(
      tenantId,
      { sequence: 1, publisherBackendBuild: BACKEND_BUILD },
      staff,
    );
    await fixture.seedCohortPair(tenantId, BUILD, BACKEND_BUILD);
    const outcome = await fixture.materialization.materialize({
      tenantId,
      terminalId,
      posBuild: BUILD,
    });
    if (outcome.status !== 'deliver') {
      throw new Error(`expected a deliverable epoch, got ${outcome.status}`);
    }
    return { digest: outcome.digest };
  };

  const ackInput = (
    tenantId: string,
    terminalId: string,
    digest: string,
    overrides: {
      readonly idempotencyKey?: string;
      readonly claim?: Partial<AcknowledgeStaffPolicyEpochInput['claim']>;
    } = {},
  ): AcknowledgeStaffPolicyEpochInput => ({
    tenantId,
    terminalId,
    posBuild: BUILD,
    assertionSchema: 'ohac.assertion.v1',
    idempotencyKey: overrides.idempotencyKey ?? randomUUID(),
    claim: {
      sequence: '1',
      digest,
      previousSequence: '0',
      previousDigest: GENESIS_DIGEST,
      ...overrides.claim,
    },
  });

  it('accepts the first acknowledgement, records it, and advances the floor', async () => {
    const tenantId = randomUUID();
    const terminalId = `terminal-${randomUUID().slice(0, 8)}`;
    const { digest } = await materializeFor(tenantId, terminalId);

    const outcome = await fixture.acknowledgement.acknowledge(
      ackInput(tenantId, terminalId, digest),
    );

    expect(outcome.status).toBe('accepted');
    if (outcome.status !== 'accepted') return;
    expect(outcome.receipt.sequence).toBe('1');
    expect(outcome.receipt.digest).toBe(digest);
    expect(outcome.receipt.floorSequence).toBe('1');
    expect(outcome.receipt.receiptId).toMatch(/^[0-9a-f-]{36}$/);

    const floor = await fixture.readFloor(tenantId, terminalId);
    expect(floor).toEqual({ sequence: '1', digest });

    const history = await fixture.readAckHistory(tenantId, terminalId);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      sequence: '1',
      status: 'ACCEPTED',
      receiptId: outcome.receipt.receiptId,
    });
  });

  it('returns the stored receipt for a repeated claim instead of deciding again', async () => {
    const tenantId = randomUUID();
    const terminalId = `terminal-${randomUUID().slice(0, 8)}`;
    const { digest } = await materializeFor(tenantId, terminalId);
    const input = ackInput(tenantId, terminalId, digest);

    const first = await fixture.acknowledgement.acknowledge(input);
    const second = await fixture.acknowledgement.acknowledge(input);

    expect(first.status).toBe('accepted');
    expect(second.status).toBe('replayed');
    if (first.status !== 'accepted' || second.status !== 'replayed') return;
    expect(second.receipt).toEqual(first.receipt);
    // The partial unique index on the accepted sequence makes a second accepted
    // row impossible, which is why the replay has to be answered from storage.
    const history = await fixture.readAckHistory(tenantId, terminalId);
    expect(history.filter((row) => row.status === 'ACCEPTED')).toHaveLength(1);
  });

  it('refuses the same idempotency key carrying a different claim', async () => {
    const tenantId = randomUUID();
    const terminalId = `terminal-${randomUUID().slice(0, 8)}`;
    const { digest } = await materializeFor(tenantId, terminalId);
    const key = randomUUID();
    await fixture.acknowledgement.acknowledge(
      ackInput(tenantId, terminalId, digest, { idempotencyKey: key }),
    );

    // Answering with the stored receipt here would tell the terminal that a
    // different claim had been accepted, which is worse than a conflict.
    const outcome = await fixture.acknowledgement.acknowledge(
      ackInput(tenantId, terminalId, 'sha256:' + '9'.repeat(64), {
        idempotencyKey: key,
      }),
    );

    expect(outcome).toMatchObject({
      status: 'rejected',
      resultCode: OHAC_ACK_RESULT_CODE.IDEMPOTENCY_CONFLICT,
    });
    const history = await fixture.readAckHistory(tenantId, terminalId);
    expect(history.filter((row) => row.status === 'ACCEPTED')).toHaveLength(1);
  });

  it('records a rejection for a digest that is not the epoch digest', async () => {
    const tenantId = randomUUID();
    const terminalId = `terminal-${randomUUID().slice(0, 8)}`;
    await materializeFor(tenantId, terminalId);

    const outcome = await fixture.acknowledgement.acknowledge(
      ackInput(tenantId, terminalId, 'sha256:' + '7'.repeat(64)),
    );

    expect(outcome).toMatchObject({
      status: 'rejected',
      resultCode: OHAC_ACK_RESULT_CODE.DIGEST_MISMATCH,
    });
    expect(await fixture.readFloor(tenantId, terminalId)).toBeUndefined();
    const history = await fixture.readAckHistory(tenantId, terminalId);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      status: 'REJECTED',
      resultCode: OHAC_ACK_RESULT_CODE.DIGEST_MISMATCH,
      receiptId: null,
    });
  });

  it('records a rejection for an epoch that was never materialized', async () => {
    const tenantId = randomUUID();
    const terminalId = `terminal-${randomUUID().slice(0, 8)}`;

    const outcome = await fixture.acknowledgement.acknowledge(
      ackInput(tenantId, terminalId, 'sha256:' + '3'.repeat(64)),
    );

    expect(outcome).toMatchObject({
      status: 'rejected',
      resultCode: OHAC_ACK_RESULT_CODE.UNKNOWN_EPOCH,
    });
    expect(await fixture.readFloor(tenantId, terminalId)).toBeUndefined();
  });

  it('rejects an acknowledgement that skips ahead of the epoch it is owed', async () => {
    const tenantId = randomUUID();
    const terminalId = `terminal-${randomUUID().slice(0, 8)}`;
    const { digest } = await materializeFor(tenantId, terminalId);
    await fixture.acknowledgement.acknowledge(
      ackInput(tenantId, terminalId, digest),
    );

    // An epoch exists at sequence 4 while the floor sits at 1, so the claim is
    // not unknown: it is a gap, and advancing the floor past epochs 2 and 3
    // would be exactly the state recovery exists to repair.
    const aheadDigest = 'sha256:' + '4'.repeat(64);
    await fixture.seedEpoch(tenantId, terminalId, 4, aheadDigest, BUILD);

    const outcome = await fixture.acknowledgement.acknowledge(
      ackInput(tenantId, terminalId, aheadDigest, {
        claim: { sequence: '4', previousSequence: '3' },
      }),
    );

    expect(outcome).toMatchObject({
      status: 'rejected',
      resultCode: OHAC_ACK_RESULT_CODE.SEQUENCE_GAP,
    });
    expect(await fixture.readFloor(tenantId, terminalId)).toEqual({
      sequence: '1',
      digest,
    });
  });

  it('keeps the acknowledgement history append-only even for an administrator', async () => {
    const tenantId = randomUUID();
    const terminalId = `terminal-${randomUUID().slice(0, 8)}`;
    const { digest } = await materializeFor(tenantId, terminalId);
    await fixture.acknowledgement.acknowledge(
      ackInput(tenantId, terminalId, digest),
    );

    await expect(
      fixture.admin.query(
        `UPDATE human_auth_terminal_ack_history SET status = 'ACCEPTED'
          WHERE tenant_id = $1 AND terminal_id = $2`,
        [tenantId, terminalId],
      ),
    ).rejects.toThrow(/append-only/);
    await expect(
      fixture.admin.query(
        `DELETE FROM human_auth_terminal_ack_history
          WHERE tenant_id = $1 AND terminal_id = $2`,
        [tenantId, terminalId],
      ),
    ).rejects.toThrow(/append-only/);
  });

  it('refuses a second accepted row for the same sequence at the index level', async () => {
    const tenantId = randomUUID();
    const terminalId = `terminal-${randomUUID().slice(0, 8)}`;
    const { digest } = await materializeFor(tenantId, terminalId);
    await fixture.acknowledgement.acknowledge(
      ackInput(tenantId, terminalId, digest),
    );

    // The service cannot produce this state, so it is provoked directly: the
    // partial unique index is what makes "one accepted acknowledgement per
    // sequence" a schema guarantee rather than a service convention.
    await expect(
      fixture.admin.query(
        `INSERT INTO human_auth_terminal_ack_history
           (tenant_id, terminal_id, sequence, previous_sequence, digest,
            previous_digest, status, idempotency_key, request_hash, pos_build,
            assertion_schema)
         VALUES ($1, $2, 1, 0, $3, 'GENESIS', 'ACCEPTED', $4, $5, $6, $7)`,
        [
          tenantId,
          terminalId,
          digest,
          randomUUID(),
          'sha256:' + '5'.repeat(64),
          BUILD,
          'ohac.assertion.v1',
        ],
      ),
    ).rejects.toThrow(/uq_human_auth_ack_history_accepted_sequence/);
  });

  it('refuses a floor regression at the trigger level', async () => {
    const tenantId = randomUUID();
    const terminalId = `terminal-${randomUUID().slice(0, 8)}`;
    const { digest } = await materializeFor(tenantId, terminalId);
    await fixture.acknowledgement.acknowledge(
      ackInput(tenantId, terminalId, digest),
    );

    await expect(
      fixture.admin.query(
        `UPDATE human_auth_terminal_ack_floor SET sequence = 0
          WHERE tenant_id = $1 AND terminal_id = $2`,
        [tenantId, terminalId],
      ),
    ).rejects.toThrow(/monotonic|regress/i);
  });

  it('lets exactly one of two racing acknowledgements win the floor', async () => {
    const tenantId = randomUUID();
    const terminalId = `terminal-${randomUUID().slice(0, 8)}`;
    const { digest } = await materializeFor(tenantId, terminalId);

    // Two different keys, the same claim. The partial unique index and the
    // floor compare-and-set decide together, so one acceptance is recorded and
    // the other must never be.
    const results = await Promise.allSettled([
      fixture.acknowledgement.acknowledge(
        ackInput(tenantId, terminalId, digest),
      ),
      fixture.acknowledgement.acknowledge(
        ackInput(tenantId, terminalId, digest),
      ),
    ]);

    const accepted = results.filter(
      (result) =>
        result.status === 'fulfilled' && result.value.status === 'accepted',
    );
    expect(accepted).toHaveLength(1);
    const history = await fixture.readAckHistory(tenantId, terminalId);
    expect(history.filter((row) => row.status === 'ACCEPTED')).toHaveLength(1);
    const floor = await fixture.readFloor(tenantId, terminalId);
    expect(floor).toEqual({ sequence: '1', digest });
  });

  it('keeps acknowledgements scoped to their own terminal and tenant', async () => {
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    const terminalA = `terminal-${randomUUID().slice(0, 8)}`;
    const terminalB = `terminal-${randomUUID().slice(0, 8)}`;
    const { digest: digestA } = await materializeFor(tenantA, terminalA);
    await materializeFor(tenantB, terminalB);

    await fixture.acknowledgement.acknowledge(
      ackInput(tenantA, terminalA, digestA),
    );

    expect(await fixture.readFloor(tenantA, terminalA)).toBeDefined();
    expect(await fixture.readFloor(tenantB, terminalB)).toBeUndefined();
    expect(await fixture.readAckHistory(tenantB, terminalB)).toHaveLength(0);
    // A terminal of another tenant reads nothing even for the same sequence.
    expect(await fixture.readAckHistory(tenantB, terminalA)).toHaveLength(0);
  });
});
