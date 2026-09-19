import {
  OHAC_ACK_RESULT_CODE,
  ackRequestHash,
} from '../contracts/acknowledgement';
import { GENESIS_DIGEST } from '../contracts/staff-policy-epoch.v1';
import type { EntityManager } from 'typeorm';
import { OhacTenantTransaction } from '../rls/ohac-tenant-transaction';
import {
  OhacAcknowledgementIntegrityError,
  StaffPolicyEpochAcknowledgementService,
  type AcknowledgeStaffPolicyEpochInput,
} from './staff-policy-epoch-acknowledgement.service';

const DIGEST_A = 'sha256:' + 'a'.repeat(64);
const DIGEST_B = 'sha256:' + 'b'.repeat(64);
const TENANT = '11111111-1111-4111-8111-111111111111';
const TERMINAL = 'Q802024120001';

const input = (
  overrides: Partial<AcknowledgeStaffPolicyEpochInput> = {},
): AcknowledgeStaffPolicyEpochInput => ({
  tenantId: TENANT,
  terminalId: TERMINAL,
  posBuild: 'pos-build-1',
  assertionSchema: 'ohac.assertion.v1',
  idempotencyKey: 'idem-1',
  claim: {
    sequence: '1',
    digest: DIGEST_A,
    previousSequence: '0',
    previousDigest: GENESIS_DIGEST,
  },
  ...overrides,
});

interface ScriptedQuery {
  readonly match: string | RegExp;
  /** The single answer this statement always returns. */
  readonly rows?: unknown[];
  /**
   * Successive answers for a statement that is issued more than once, such as
   * an idempotency lookup that misses and then hits. The last entry repeats.
   */
  readonly responses?: unknown[][];
}

/**
 * Builds the service with a scripted manager. Each script entry answers the
 * first statement whose text matches, so a test states only the rows the code
 * under test should observe.
 */
const serviceWith = (script: readonly ScriptedQuery[]) => {
  const statements: { sql: string; params: unknown[] }[] = [];
  const responseCursor = new Map<ScriptedQuery, number>();
  const manager = {
    query: jest.fn((sql: string, params: unknown[] = []) => {
      statements.push({ sql, params });
      const entry = script.find((candidate) =>
        typeof candidate.match === 'string'
          ? sql.includes(candidate.match)
          : candidate.match.test(sql),
      );
      if (!entry) return Promise.resolve([]);
      if (!entry.responses) return Promise.resolve(entry.rows ?? []);
      const next = responseCursor.get(entry) ?? 0;
      responseCursor.set(entry, Math.min(next + 1, entry.responses.length - 1));
      return Promise.resolve(entry.responses[next]);
    }),
  } as unknown as EntityManager;
  const boundTenants: unknown[] = [];
  const transaction = {
    run: jest.fn(
      async (
        tenantId: unknown,
        work: (mgr: EntityManager) => Promise<unknown>,
      ) => {
        boundTenants.push(tenantId);
        return await work(manager);
      },
    ),
  } as unknown as OhacTenantTransaction;
  return {
    service: new StaffPolicyEpochAcknowledgementService(transaction),
    statements,
    boundTenants,
  };
};

const statementContaining = (
  statements: { sql: string }[],
  fragment: string,
): string | undefined =>
  statements.find((entry) => entry.sql.includes(fragment))?.sql;

describe('StaffPolicyEpochAcknowledgementService', () => {
  it('accepts a first acknowledgement, records it, and advances the floor from zero', async () => {
    const { service, statements } = serviceWith([
      { match: 'FROM human_auth_terminal_ack_history', rows: [] },
      { match: 'FROM human_auth_terminal_ack_floor', rows: [] },
      { match: 'FROM human_auth_policy_epochs', rows: [{ digest: DIGEST_A }] },
      {
        match: 'INSERT INTO human_auth_terminal_ack_history',
        rows: [{ receiptId: 'receipt-1' }],
      },
      {
        match: 'INSERT INTO human_auth_terminal_ack_floor',
        rows: [{ sequence: '1' }],
      },
    ]);

    const outcome = await service.acknowledge(input());

    expect(outcome).toEqual({
      status: 'accepted',
      receipt: {
        receiptId: 'receipt-1',
        status: 'ACCEPTED',
        sequence: '1',
        digest: DIGEST_A,
        floorSequence: '1',
      },
    });
    const floorSql = statementContaining(
      statements,
      'INSERT INTO human_auth_terminal_ack_floor',
    );
    expect(floorSql).toContain(
      'ON CONFLICT (tenant_id, terminal_id) DO UPDATE',
    );
    expect(floorSql).toContain(
      'WHERE human_auth_terminal_ack_floor.sequence = $5',
    );
  });

  it('binds the tenant and terminal as parameters on every statement', async () => {
    const { service, statements } = serviceWith([
      { match: 'FROM human_auth_terminal_ack_history', rows: [] },
      { match: 'FROM human_auth_terminal_ack_floor', rows: [] },
      { match: 'FROM human_auth_policy_epochs', rows: [{ digest: DIGEST_A }] },
      {
        match: 'INSERT INTO human_auth_terminal_ack_history',
        rows: [{ receiptId: 'receipt-1' }],
      },
      {
        match: 'INSERT INTO human_auth_terminal_ack_floor',
        rows: [{ sequence: '1' }],
      },
    ]);

    await service.acknowledge(input());

    for (const statement of statements) {
      expect(statement.sql).not.toContain(TENANT);
      expect(statement.sql).not.toContain(TERMINAL);
      expect(statement.params[0]).toBe(TENANT);
    }
  });

  it('returns the stored receipt when the same key repeats the same claim', async () => {
    // A lost response must not cost the terminal its proof of acceptance, so
    // the retry is answered from storage and nothing new is written.
    const { service, statements } = serviceWith([
      // The first claim is new, so the lookup misses; the retry hits.
      {
        match: 'FROM human_auth_terminal_ack_history',
        responses: [
          [],
          [
            {
              requestHash: ackRequestHash(input().claim),
              receiptId: 'receipt-1',
              sequence: '1',
              digest: DIGEST_A,
              floorSequence: '1',
            },
          ],
        ],
      },
      { match: 'FROM human_auth_terminal_ack_floor', rows: [] },
      { match: 'FROM human_auth_policy_epochs', rows: [{ digest: DIGEST_A }] },
      {
        match: 'INSERT INTO human_auth_terminal_ack_history',
        rows: [{ receiptId: 'receipt-1' }],
      },
      {
        match: 'INSERT INTO human_auth_terminal_ack_floor',
        rows: [{ sequence: '1' }],
      },
    ]);

    const first = await service.acknowledge(input());
    if (first.status !== 'accepted') {
      throw new Error(`expected acceptance, received ${first.status}`);
    }

    const second = await service.acknowledge(input());
    expect(second).toEqual({ status: 'replayed', receipt: first.receipt });
    expect(
      statements.filter((statement) =>
        statement.sql.includes('INSERT INTO human_auth_terminal_ack_history'),
      ),
    ).toHaveLength(1);
  });

  it('rejects the same key carrying different content instead of returning a foreign receipt', async () => {
    // Answering with the stored receipt here would tell the terminal that a
    // different claim was accepted, which is worse than a conflict.
    const { service, statements } = serviceWith([
      {
        match: 'FROM human_auth_terminal_ack_history',
        rows: [
          {
            requestHash: 'sha256:' + 'c'.repeat(64),
            receiptId: 'receipt-other',
            sequence: '1',
            digest: DIGEST_A,
            floorSequence: '1',
          },
        ],
      },
      { match: 'INSERT INTO human_auth_terminal_ack_history', rows: [] },
    ]);

    const outcome = await service.acknowledge(input());

    expect(outcome).toEqual({
      status: 'rejected',
      resultCode: OHAC_ACK_RESULT_CODE.IDEMPOTENCY_CONFLICT,
      sequence: '1',
    });
    const rejection = statements.find((statement) =>
      statement.sql.includes('INSERT INTO human_auth_terminal_ack_history'),
    );
    expect(rejection?.params).toContain('REJECTED');
    expect(rejection?.params).toContain(
      OHAC_ACK_RESULT_CODE.IDEMPOTENCY_CONFLICT,
    );
  });

  it('records a rejection and never advances the floor when the epoch is unknown', async () => {
    const { service, statements } = serviceWith([
      { match: 'FROM human_auth_terminal_ack_history', rows: [] },
      { match: 'FROM human_auth_terminal_ack_floor', rows: [] },
      { match: 'FROM human_auth_policy_epochs', rows: [] },
      { match: 'INSERT INTO human_auth_terminal_ack_history', rows: [] },
    ]);

    const outcome = await service.acknowledge(input());

    expect(outcome).toEqual({
      status: 'rejected',
      resultCode: OHAC_ACK_RESULT_CODE.UNKNOWN_EPOCH,
      sequence: '1',
    });
    expect(
      statementContaining(
        statements,
        'INSERT INTO human_auth_terminal_ack_floor',
      ),
    ).toBeUndefined();
  });

  it('records a rejection for a digest that is not the epoch digest', async () => {
    const { service } = serviceWith([
      { match: 'FROM human_auth_terminal_ack_history', rows: [] },
      { match: 'FROM human_auth_terminal_ack_floor', rows: [] },
      { match: 'FROM human_auth_policy_epochs', rows: [{ digest: DIGEST_B }] },
      { match: 'INSERT INTO human_auth_terminal_ack_history', rows: [] },
    ]);

    const outcome = await service.acknowledge(input());

    expect(outcome).toMatchObject({
      status: 'rejected',
      resultCode: OHAC_ACK_RESULT_CODE.DIGEST_MISMATCH,
    });
  });

  it('returns the original receipt when the claim restates the accepted floor', async () => {
    const { service, statements } = serviceWith([
      // First lookup is by idempotency key (a new key), the second by sequence.
      { match: 'idempotency_key = $3', rows: [] },
      {
        match: 'FROM human_auth_terminal_ack_floor',
        rows: [{ sequence: '4', digest: DIGEST_A }],
      },
      { match: 'FROM human_auth_policy_epochs', rows: [{ digest: DIGEST_A }] },
      {
        match: 'sequence = $3',
        rows: [
          {
            requestHash: 'sha256:' + 'd'.repeat(64),
            receiptId: 'receipt-4',
            sequence: '4',
            digest: DIGEST_A,
            floorSequence: '4',
          },
        ],
      },
    ]);

    const outcome = await service.acknowledge(
      input({
        claim: {
          sequence: '4',
          digest: DIGEST_A,
          previousSequence: '3',
          previousDigest: DIGEST_A,
        },
      }),
    );

    expect(outcome).toEqual({
      status: 'replayed',
      receipt: {
        receiptId: 'receipt-4',
        status: 'ACCEPTED',
        sequence: '4',
        digest: DIGEST_A,
        floorSequence: '4',
      },
    });
    expect(
      statementContaining(
        statements,
        'INSERT INTO human_auth_terminal_ack_floor',
      ),
    ).toBeUndefined();
  });

  it('fails closed when the floor claims an acceptance with no history row', async () => {
    // This service is the only writer that moves the floor, and it does so in
    // the same transaction as the insert, so a floor without history is
    // corruption rather than a client error.
    const { service } = serviceWith([
      { match: 'idempotency_key = $3', rows: [] },
      {
        match: 'FROM human_auth_terminal_ack_floor',
        rows: [{ sequence: '4', digest: DIGEST_A }],
      },
      { match: 'FROM human_auth_policy_epochs', rows: [{ digest: DIGEST_A }] },
      { match: 'sequence = $3', rows: [] },
    ]);

    await expect(
      service.acknowledge(
        input({
          claim: {
            sequence: '4',
            digest: DIGEST_A,
            previousSequence: '3',
            previousDigest: DIGEST_A,
          },
        }),
      ),
    ).rejects.toBeInstanceOf(OhacAcknowledgementIntegrityError);
  });

  it('fails closed when the floor compare-and-set matches no row', async () => {
    // Another acknowledgement moved the floor between the read and the write.
    // Recording the acceptance anyway would leave the stored floor and the
    // record of what the terminal applied in disagreement.
    const { service } = serviceWith([
      { match: 'FROM human_auth_terminal_ack_history', rows: [] },
      {
        match: 'FROM human_auth_terminal_ack_floor',
        rows: [{ sequence: '1', digest: DIGEST_A }],
      },
      { match: 'FROM human_auth_policy_epochs', rows: [{ digest: DIGEST_A }] },
      {
        match: 'INSERT INTO human_auth_terminal_ack_history',
        rows: [{ receiptId: 'receipt-2' }],
      },
      { match: 'INSERT INTO human_auth_terminal_ack_floor', rows: [] },
    ]);

    await expect(
      service.acknowledge(
        input({
          claim: {
            sequence: '2',
            digest: DIGEST_A,
            previousSequence: '1',
            previousDigest: DIGEST_A,
          },
        }),
      ),
    ).rejects.toBeInstanceOf(OhacAcknowledgementIntegrityError);
  });

  it('records the negotiated build and assertion schema with the decision', async () => {
    const { service, statements } = serviceWith([
      { match: 'FROM human_auth_terminal_ack_history', rows: [] },
      { match: 'FROM human_auth_terminal_ack_floor', rows: [] },
      { match: 'FROM human_auth_policy_epochs', rows: [{ digest: DIGEST_A }] },
      {
        match: 'INSERT INTO human_auth_terminal_ack_history',
        rows: [{ receiptId: 'receipt-1' }],
      },
      {
        match: 'INSERT INTO human_auth_terminal_ack_floor',
        rows: [{ sequence: '1' }],
      },
    ]);

    await service.acknowledge(input());

    const insert = statements.find((statement) =>
      statement.sql.includes('INSERT INTO human_auth_terminal_ack_history'),
    );
    expect(insert?.params).toContain('pos-build-1');
    expect(insert?.params).toContain('ohac.assertion.v1');
    expect(insert?.params).toContain('idem-1');
  });

  it('runs entirely inside the tenant transaction seam, bound to the caller tenant', async () => {
    const { service, boundTenants } = serviceWith([
      { match: 'FROM human_auth_terminal_ack_history', rows: [] },
      { match: 'FROM human_auth_terminal_ack_floor', rows: [] },
      { match: 'FROM human_auth_policy_epochs', rows: [{ digest: DIGEST_A }] },
      {
        match: 'INSERT INTO human_auth_terminal_ack_history',
        rows: [{ receiptId: 'receipt-1' }],
      },
      {
        match: 'INSERT INTO human_auth_terminal_ack_floor',
        rows: [{ sequence: '1' }],
      },
    ]);

    await service.acknowledge(input());

    expect(boundTenants).toEqual([TENANT]);
  });
});
