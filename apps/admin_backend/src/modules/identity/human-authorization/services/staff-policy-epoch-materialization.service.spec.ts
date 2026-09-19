import { DataSource, type EntityManager } from 'typeorm';
import { OhacTenantTransaction } from '../rls/ohac-tenant-transaction';
import {
  GENESIS_DIGEST,
  MINIMUM_ASSERTION_SCHEMA,
  STAFF_POLICY_EPOCH_V1_SCHEMA,
} from '../contracts/staff-policy-epoch.v1';
import { projectStaffPolicySnapshotV1 } from '../projection/staff-policy-snapshot-projector';
import { materializeStaffPolicyEpochV1 } from '../projection/staff-policy-epoch-materializer';
import { OHAC_ERROR_CODE } from '../contracts/error-codes';
import { StaffPolicyEpochMaterializationService } from './staff-policy-epoch-materialization.service';

const TENANT = 'a1b2c3d4-0000-4000-8000-000000000001';
const OTHER_TENANT = 'a1b2c3d4-0000-4000-8000-000000000002';
const TERMINAL = 'terminal-001';
const POS_BUILD = 'pos-2025.02.0';
const BACKEND_BUILD = 'backend-2025.01.0';
const PIN = '$2b$12$KIXQeQ1vZqZ5uYyZ0O1zXe';
const USER_A = 'd4c3b2a1-0000-4000-8000-00000000000a';
const USER_B = 'd4c3b2a1-0000-4000-8000-00000000000b';
const FLOOR_DIGEST = 'sha256:' + 'b'.repeat(64);
const OTHER_DIGEST = 'sha256:' + 'c'.repeat(64);

const DEFAULT_SOURCES = [
  {
    userId: USER_A,
    role: 'MANAGER',
    isActive: true,
    attemptResetGeneration: '2',
    pinHash: PIN,
    customPermissions: ['sales:void_invoice'],
  },
  {
    userId: USER_B,
    role: 'WAITER',
    isActive: false,
    attemptResetGeneration: '0',
    pinHash: null,
    customPermissions: null,
  },
];

const projectSnapshot = (
  sequence: string,
  previousSequence: string,
  previousDigest: string,
  publisherBackendBuild = BACKEND_BUILD,
  tenantId = TENANT,
) => {
  const projection = projectStaffPolicySnapshotV1(
    {
      tenantId,
      sequence,
      previousSequence,
      previousDigest,
      publisherBackendBuild,
    },
    DEFAULT_SOURCES,
  );
  if (projection.ok === false) throw new Error(projection.error.code);
  return projection.value;
};

// Default scenario: the terminal's floor sits at 6/FLOOR_DIGEST and the
// tenant snapshot at sequence 7 exists, so the terminal is delivered 7.
const SNAPSHOT_7 = projectSnapshot('7', '6', FLOOR_DIGEST);
const DEFAULT_FLOOR = { sequence: '6', digest: FLOOR_DIGEST };
const DEFAULT_SNAPSHOT_ROW = {
  sequence: '7',
  publisherBackendBuild: BACKEND_BUILD,
  payload: SNAPSHOT_7,
  digest: SNAPSHOT_7.digest,
};

interface QueryCall {
  sql: string;
  params?: unknown[];
}

type SnapshotAnswer = unknown[] | ((params: unknown[]) => unknown[]);

interface Answers {
  floor?: unknown[];
  snapshot?: SnapshotAnswer;
  cohort?: unknown[];
  insertError?: Error;
  readBack?: unknown[];
}

const makeQuery = (calls: QueryCall[], answers: Answers) => {
  let inserted: unknown[] | undefined;
  return jest.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    if (sql.includes('set_config')) return [];
    if (sql.includes('FROM human_auth_terminal_ack_floor'))
      return answers.floor ?? [];
    if (sql.includes('FROM human_auth_policy_snapshots')) {
      if (typeof answers.snapshot === 'function')
        return answers.snapshot(params ?? []);
      return answers.snapshot ?? [DEFAULT_SNAPSHOT_ROW];
    }
    if (sql.includes('FROM human_auth_rollout_cohorts'))
      return answers.cohort ?? [{ ok: 1 }];
    if (sql.startsWith('INSERT INTO human_auth_policy_epochs')) {
      if (answers.insertError) throw answers.insertError;
      inserted = params;
      return [];
    }
    if (sql.includes('FROM human_auth_policy_epochs')) {
      // Default: the authoritative row is exactly what this pull inserted,
      // which is the fresh-materialization case. A replay scenario overrides
      // it with an earlier pull's stored row.
      return (
        answers.readBack ?? [
          {
            payload: inserted?.[11],
            digest: inserted?.[10],
            targetPosBuild: inserted?.[7],
            publisherBackendBuild: inserted?.[6],
          },
        ]
      );
    }
    throw new Error(`unexpected query: ${sql}`);
  });
};

const runMaterialize = async (answers: Answers = {}) => {
  const calls: QueryCall[] = [];
  const manager = {
    query: makeQuery(calls, answers),
  } as unknown as EntityManager;
  const seam = {
    run: async (_tenant: unknown, work: (m: EntityManager) => unknown) =>
      await work(manager),
  };
  const service = new StaffPolicyEpochMaterializationService(
    seam as unknown as OhacTenantTransaction,
  );
  const outcome = await service.materialize({
    tenantId: TENANT,
    terminalId: TERMINAL,
    posBuild: POS_BUILD,
  });
  return { outcome, calls };
};

const callFor = (calls: QueryCall[], fragment: string) => {
  const call = calls.find((c) => c.sql.includes(fragment));
  if (!call) throw new Error(`no query containing ${fragment}`);
  return call;
};

const INSERT_EPOCH = 'INSERT INTO human_auth_policy_epochs';

describe('StaffPolicyEpochMaterializationService', () => {
  it('runs inside the RLS seam with the tenant bound before any statement', async () => {
    const calls: QueryCall[] = [];
    const dataSource = {
      transaction: async (cb: (m: EntityManager) => unknown) =>
        await cb({
          query: makeQuery(calls, { floor: [DEFAULT_FLOOR] }),
        } as unknown as EntityManager),
    } as unknown as DataSource;
    const service = new StaffPolicyEpochMaterializationService(
      new OhacTenantTransaction(dataSource),
    );
    await service.materialize({
      tenantId: TENANT,
      terminalId: TERMINAL,
      posBuild: POS_BUILD,
    });
    expect(calls[0].sql).toContain('set_config');
    expect(calls[0].params).toEqual([TENANT]);
    expect(calls[1].sql).toContain('human_auth_terminal_ack_floor');
  });

  it('chains sequence 1 from 0/GENESIS when the terminal has never acknowledged', async () => {
    const genesisPayload = projectSnapshot('1', '0', GENESIS_DIGEST);
    const { outcome, calls } = await runMaterialize({
      floor: [],
      snapshot: [
        {
          sequence: '1',
          publisherBackendBuild: BACKEND_BUILD,
          payload: genesisPayload,
          digest: genesisPayload.digest,
        },
      ],
    });
    expect(outcome).toMatchObject({ status: 'deliver', sequence: '1' });
    expect(callFor(calls, 'FROM human_auth_terminal_ack_floor').params).toEqual(
      [TENANT, TERMINAL],
    );
    expect(callFor(calls, INSERT_EPOCH).params?.slice(0, 6)).toEqual([
      TENANT,
      TERMINAL,
      STAFF_POLICY_EPOCH_V1_SCHEMA,
      '1',
      '0',
      GENESIS_DIGEST,
    ]);
  });

  it('chains from the terminal floor sequence and digest when the floor exists', async () => {
    const { outcome, calls } = await runMaterialize({
      floor: [DEFAULT_FLOOR],
    });
    expect(outcome).toMatchObject({ status: 'deliver', sequence: '7' });
    expect(callFor(calls, INSERT_EPOCH).params?.slice(3, 6)).toEqual([
      '7',
      '6',
      FLOOR_DIGEST,
    ]);
  });

  it('delivers the floor successor snapshot, never the newest snapshot', async () => {
    // Sequence 9 is the newest tenant snapshot, but this terminal's floor is
    // at 6, so only 7 is read and materialized.
    const { outcome, calls } = await runMaterialize({
      floor: [DEFAULT_FLOOR],
      snapshot: (params) =>
        params[1] === '7'
          ? [DEFAULT_SNAPSHOT_ROW]
          : [
              {
                sequence: '9',
                publisherBackendBuild: BACKEND_BUILD,
                payload: projectSnapshot('9', '8', OTHER_DIGEST),
              },
            ],
    });
    expect(callFor(calls, 'FROM human_auth_policy_snapshots').params).toEqual([
      TENANT,
      '7',
    ]);
    expect(outcome).toMatchObject({ status: 'deliver', sequence: '7' });
  });

  it('returns nothing-to-deliver without writing anything when the tenant has no snapshot beyond the floor', async () => {
    const { outcome, calls } = await runMaterialize({
      floor: [DEFAULT_FLOOR],
      snapshot: [],
    });
    expect(outcome).toEqual({ status: 'nothing-to-deliver' });
    expect(calls.some((c) => c.sql.startsWith(INSERT_EPOCH))).toBe(false);
    expect(
      calls.some((c) => c.sql.includes('FROM human_auth_policy_epochs')),
    ).toBe(false);
    expect(
      calls.some((c) => c.sql.includes('FROM human_auth_rollout_cohorts')),
    ).toBe(false);
  });

  it('returns cohort-disabled without writing anything when the tenant has no cohort row for the exact build pair', async () => {
    // No row at all exists for the pair, so the discriminator is the exact
    // pair the service binds: negotiated POS build and the snapshot's own
    // publisher build, never a tenant-level or schema-level check.
    const { outcome, calls } = await runMaterialize({
      floor: [DEFAULT_FLOOR],
      cohort: [],
    });
    expect(outcome).toEqual({
      status: 'cohort-disabled',
      decision: 'DISABLED',
    });
    expect(callFor(calls, 'FROM human_auth_rollout_cohorts').params).toEqual([
      TENANT,
      POS_BUILD,
      BACKEND_BUILD,
    ]);
    expect(calls.some((c) => c.sql.startsWith(INSERT_EPOCH))).toBe(false);
    expect(
      calls.some((c) => c.sql.includes('FROM human_auth_policy_epochs')),
    ).toBe(false);
  });

  it('treats a present-but-disabled cohort row as no match because the statement filters enabled = TRUE', async () => {
    // A disabled row exists in the table, but the mock answers at the
    // statement level: the discriminator here is the statement itself, which
    // must filter on enabled = TRUE alongside the exact pair columns, so a
    // stored disabled row can never be returned as a match.
    const { outcome, calls } = await runMaterialize({
      floor: [DEFAULT_FLOOR],
      cohort: [],
    });
    expect(outcome).toEqual({
      status: 'cohort-disabled',
      decision: 'DISABLED',
    });
    const cohortCall = callFor(calls, 'FROM human_auth_rollout_cohorts');
    expect(cohortCall.sql).toContain('enabled = TRUE');
    expect(cohortCall.sql).toContain('pos_build');
    expect(cohortCall.sql).toContain('backend_build');
    expect(calls.some((c) => c.sql.startsWith(INSERT_EPOCH))).toBe(false);
  });

  it('fails closed with a tenant-scope mismatch on a cross-tenant payload', async () => {
    const foreign = projectSnapshot(
      '7',
      '6',
      FLOOR_DIGEST,
      BACKEND_BUILD,
      OTHER_TENANT,
    );
    const { outcome, calls } = await runMaterialize({
      floor: [DEFAULT_FLOOR],
      snapshot: [
        {
          sequence: '7',
          publisherBackendBuild: BACKEND_BUILD,
          payload: foreign,
        },
      ],
    });
    expect(outcome).toEqual({
      status: 'failed',
      error: { code: OHAC_ERROR_CODE.TENANT_SCOPE_MISMATCH, field: 'tenantId' },
    });
    expect(calls.some((c) => c.sql.startsWith(INSERT_EPOCH))).toBe(false);
  });

  it('fails closed on a snapshot schema mismatch', async () => {
    const { outcome, calls } = await runMaterialize({
      floor: [DEFAULT_FLOOR],
      snapshot: [
        {
          sequence: '7',
          publisherBackendBuild: BACKEND_BUILD,
          payload: { ...SNAPSHOT_7, schema: 'ohac.staff-policy-epoch.v1' },
        },
      ],
    });
    expect(outcome).toEqual({
      status: 'failed',
      error: { code: OHAC_ERROR_CODE.UNSUPPORTED_SCHEMA, field: 'schema' },
    });
    expect(calls.some((c) => c.sql.startsWith(INSERT_EPOCH))).toBe(false);
  });

  it('fails closed when the payload build disagrees with the row column', async () => {
    const { outcome } = await runMaterialize({
      floor: [DEFAULT_FLOOR],
      snapshot: [
        {
          sequence: '7',
          publisherBackendBuild: 'backend-other',
          payload: SNAPSHOT_7,
        },
      ],
    });
    expect(outcome).toEqual({
      status: 'failed',
      error: {
        code: OHAC_ERROR_CODE.INVALID_FIELD,
        field: 'publisherBackendBuild',
      },
    });
  });

  it('fails closed on a blank payload build', async () => {
    const blank = { ...SNAPSHOT_7, publisherBackendBuild: '   ' };
    const { outcome } = await runMaterialize({
      floor: [DEFAULT_FLOOR],
      snapshot: [
        { sequence: '7', publisherBackendBuild: '   ', payload: blank },
      ],
    });
    expect(outcome).toEqual({
      status: 'failed',
      error: {
        code: OHAC_ERROR_CODE.INVALID_FIELD,
        field: 'publisherBackendBuild',
      },
    });
  });

  it('fails closed on a snapshot payload whose digest disagrees with the signed digest column', async () => {
    // The digest column is the signed value the publisher persisted; a
    // payload whose own digest field no longer matches it was tampered with
    // or drifted after signing, so it must never be re-signed into a fresh
    // epoch.
    const { outcome, calls } = await runMaterialize({
      floor: [DEFAULT_FLOOR],
      snapshot: [
        {
          sequence: '7',
          publisherBackendBuild: BACKEND_BUILD,
          payload: { ...SNAPSHOT_7, digest: OTHER_DIGEST },
          digest: SNAPSHOT_7.digest,
        },
      ],
    });
    expect(outcome).toEqual({
      status: 'failed',
      error: { code: OHAC_ERROR_CODE.DIGEST_MISMATCH, field: 'digest' },
    });
    expect(calls.some((c) => c.sql.startsWith(INSERT_EPOCH))).toBe(false);
  });

  it('fails closed when the snapshot payload is not an object', async () => {
    const { outcome, calls } = await runMaterialize({
      floor: [DEFAULT_FLOOR],
      snapshot: [
        {
          sequence: '7',
          publisherBackendBuild: BACKEND_BUILD,
          payload: 42,
          digest: SNAPSHOT_7.digest,
        },
      ],
    });
    expect(outcome).toEqual({
      status: 'failed',
      error: { code: OHAC_ERROR_CODE.INVALID_FIELD, field: 'payload' },
    });
    expect(calls.some((c) => c.sql.startsWith(INSERT_EPOCH))).toBe(false);
  });

  it('fails closed on empty policy entries', async () => {
    const { outcome } = await runMaterialize({
      floor: [DEFAULT_FLOOR],
      snapshot: [
        {
          sequence: '7',
          publisherBackendBuild: BACKEND_BUILD,
          payload: { ...SNAPSHOT_7, policyEntries: [] },
          digest: SNAPSHOT_7.digest,
        },
      ],
    });
    expect(outcome).toEqual({
      status: 'failed',
      error: { code: OHAC_ERROR_CODE.INVALID_FIELD, field: 'policyEntries' },
    });
  });

  it('propagates a materializer failure unchanged on malformed entries', async () => {
    // The shallow payload validation passes (entries is a non-empty array),
    // so the pure materializer's own rejection must come back untouched.
    const malformed = {
      ...SNAPSHOT_7,
      policyEntries: [
        {
          ...SNAPSHOT_7.policyEntries[0],
          role: 'SUPERUSER',
        },
      ],
    };
    const { outcome, calls } = await runMaterialize({
      floor: [DEFAULT_FLOOR],
      snapshot: [
        {
          sequence: '7',
          publisherBackendBuild: BACKEND_BUILD,
          payload: malformed,
          digest: SNAPSHOT_7.digest,
        },
      ],
    });
    expect(outcome).toEqual({
      status: 'failed',
      error: { code: OHAC_ERROR_CODE.INVALID_FIELD, field: 'role' },
    });
    expect(calls.some((c) => c.sql.startsWith(INSERT_EPOCH))).toBe(false);
  });

  it('propagates an infrastructure failure from the epoch insert', async () => {
    // Only unexpected infrastructure failures propagate as exceptions; the
    // statement-level failure must surface, never be swallowed into an
    // outcome.
    await expect(
      runMaterialize({
        floor: [DEFAULT_FLOOR],
        insertError: new Error('relation "human_auth_policy_epochs" exists'),
      }),
    ).rejects.toThrow('relation "human_auth_policy_epochs" exists');
  });

  it('returns the existing stored row on an idempotent replay instead of duplicating', async () => {
    // An earlier pull materialized sequence 7 under a different terminal
    // chain head, so its stored digest differs from the fresh projection:
    // the authoritative row must win. The stored body is built through the
    // real materializer so it is a self-consistent epoch envelope.
    const replay = materializeStaffPolicyEpochV1(SNAPSHOT_7, {
      targetTerminalId: TERMINAL,
      targetPosBuild: POS_BUILD,
      previousSequence: '6',
      previousDigest: OTHER_DIGEST,
    });
    if (replay.ok === false) throw new Error(replay.error.code);
    const { outcome, calls } = await runMaterialize({
      floor: [DEFAULT_FLOOR],
      readBack: [
        {
          payload: replay.value,
          digest: replay.value.digest,
          targetPosBuild: replay.value.targetPosBuild,
          publisherBackendBuild: replay.value.publisherBackendBuild,
        },
      ],
    });
    expect(outcome).toEqual({
      status: 'deliver',
      epoch: expect.objectContaining({ digest: replay.value.digest }),
      sequence: '7',
      digest: replay.value.digest,
    });
    expect(callFor(calls, INSERT_EPOCH).sql).toContain(
      'ON CONFLICT (tenant_id, terminal_id, sequence) DO NOTHING',
    );
    expect(callFor(calls, 'FROM human_auth_policy_epochs').params).toEqual([
      TENANT,
      TERMINAL,
      '7',
    ]);
  });

  it('reports a concurrent no-op insert as a delivery, not a failure', async () => {
    // ON CONFLICT DO NOTHING never raises; the read-back then hands back the
    // row the concurrent pull created, and the outcome stays deliverable.
    const { outcome, calls } = await runMaterialize({
      floor: [DEFAULT_FLOOR],
    });
    expect(outcome).toMatchObject({ status: 'deliver', sequence: '7' });
    expect(callFor(calls, INSERT_EPOCH).sql).toContain(
      'ON CONFLICT (tenant_id, terminal_id, sequence) DO NOTHING',
    );
    expect((outcome as { digest?: string }).digest).toBeDefined();
  });

  it('refuses the stored epoch when it was materialized for a different negotiated POS build', async () => {
    // The epoch row froze targetPosBuild at the earlier pull's negotiated
    // build. The stored body and its digest are internally consistent, so
    // only the column comparison can catch this: the row must not be
    // delivered to a terminal negotiating a newer build, and it must not be
    // rewritten in place.
    const stale = materializeStaffPolicyEpochV1(SNAPSHOT_7, {
      targetTerminalId: TERMINAL,
      targetPosBuild: 'pos-2024.12.0',
      previousSequence: '6',
      previousDigest: FLOOR_DIGEST,
    });
    if (stale.ok === false) throw new Error(stale.error.code);
    const { outcome } = await runMaterialize({
      floor: [DEFAULT_FLOOR],
      readBack: [
        {
          payload: stale.value,
          digest: stale.value.digest,
          targetPosBuild: 'pos-2024.12.0',
          publisherBackendBuild: BACKEND_BUILD,
        },
      ],
    });
    expect(outcome).toEqual({
      status: 'build-mismatch',
      storedTargetPosBuild: 'pos-2024.12.0',
      storedPublisherBackendBuild: BACKEND_BUILD,
    });
  });

  it('refuses the stored epoch when it was materialized for a different publisher backend build', async () => {
    // The stored epoch was built from a snapshot published under an older
    // backend build; the snapshot this pull read is the newer build, so the
    // frozen pair no longer matches and the stored row must not be
    // delivered.
    const olderSnapshot = projectSnapshot(
      '7',
      '6',
      FLOOR_DIGEST,
      'backend-2024.12.0',
    );
    const stale = materializeStaffPolicyEpochV1(olderSnapshot, {
      targetTerminalId: TERMINAL,
      targetPosBuild: POS_BUILD,
      previousSequence: '6',
      previousDigest: FLOOR_DIGEST,
    });
    if (stale.ok === false) throw new Error(stale.error.code);
    const { outcome } = await runMaterialize({
      floor: [DEFAULT_FLOOR],
      readBack: [
        {
          payload: stale.value,
          digest: stale.value.digest,
          targetPosBuild: POS_BUILD,
          publisherBackendBuild: 'backend-2024.12.0',
        },
      ],
    });
    expect(outcome).toEqual({
      status: 'build-mismatch',
      storedTargetPosBuild: POS_BUILD,
      storedPublisherBackendBuild: 'backend-2024.12.0',
    });
  });

  it('binds every statement parameter and never interpolates tenant or terminal', async () => {
    const { calls } = await runMaterialize({ floor: [DEFAULT_FLOOR] });
    for (const call of calls) {
      expect(call.sql).not.toContain(TENANT);
      expect(call.sql).not.toContain(TERMINAL);
      expect(Array.isArray(call.params)).toBe(true);
    }
    expect(callFor(calls, 'FROM human_auth_terminal_ack_floor').params).toEqual(
      [TENANT, TERMINAL],
    );
    expect(callFor(calls, 'FROM human_auth_policy_snapshots').params).toEqual([
      TENANT,
      '7',
    ]);
    expect(callFor(calls, 'FROM human_auth_rollout_cohorts').params).toEqual([
      TENANT,
      POS_BUILD,
      BACKEND_BUILD,
    ]);
    const insert = callFor(calls, INSERT_EPOCH);
    expect(insert.params?.[0]).toBe(TENANT);
    expect(insert.params?.[1]).toBe(TERMINAL);
    expect(insert.params?.[9]).toBe('ELIGIBLE');
    expect(callFor(calls, 'FROM human_auth_policy_epochs').params).toEqual([
      TENANT,
      TERMINAL,
      '7',
    ]);
  });

  it('delivers the materialized epoch with the negotiated build and terminal chain', async () => {
    const { outcome } = await runMaterialize({ floor: [DEFAULT_FLOOR] });
    const deliverable = outcome as {
      status: string;
      epoch: Record<string, unknown>;
    };
    expect(deliverable.status).toBe('deliver');
    expect(deliverable.epoch).toMatchObject({
      schema: STAFF_POLICY_EPOCH_V1_SCHEMA,
      tenantId: TENANT,
      targetTerminalId: TERMINAL,
      sequence: '7',
      previousSequence: '6',
      previousDigest: FLOOR_DIGEST,
      publisherBackendBuild: BACKEND_BUILD,
      targetPosBuild: POS_BUILD,
      minimumAssertionSchema: MINIMUM_ASSERTION_SCHEMA,
    });
  });
});
