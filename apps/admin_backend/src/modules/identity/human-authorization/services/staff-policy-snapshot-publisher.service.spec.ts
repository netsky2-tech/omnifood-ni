import { DataSource, type EntityManager } from 'typeorm';
import { OhacTenantTransaction } from '../rls/ohac-tenant-transaction';
import {
  STAFF_POLICY_SNAPSHOT_V1_SCHEMA,
  projectStaffPolicySnapshotV1,
} from '../projection/staff-policy-snapshot-projector';
import { MINIMUM_ASSERTION_SCHEMA } from '../contracts/staff-policy-epoch.v1';
import { OHAC_ERROR_CODE } from '../contracts/error-codes';
import { readStaffPolicySourceRecords } from './staff-policy-source-reader';
import { StaffPolicySnapshotPublisher } from './staff-policy-snapshot-publisher.service';

const TENANT = 'a1b2c3d4-0000-4000-8000-000000000001';
const BUILD = 'backend-2025.01.0';
const PIN = '$2b$12$KIXQeQ1vZqZ5uYyZ0O1zXe';
const USER_A = 'd4c3b2a1-0000-4000-8000-00000000000a';
const USER_B = 'd4c3b2a1-0000-4000-8000-00000000000b';
const USER_C = 'd4c3b2a1-0000-4000-8000-00000000000c';
const DIGEST_A = 'sha256:' + 'a'.repeat(64);

// Digests are computed through the real reader mapping of DEFAULT_SOURCES
// below, so the fixtures cannot drift from what the publisher reads.
const projectDigest = async (
  sequence: string,
  previousSequence: string,
  previousDigest: string,
  publisherBackendBuild: string,
): Promise<string> => {
  const manager = {
    query: jest.fn().mockResolvedValue(DEFAULT_SOURCES),
  } as unknown as EntityManager;
  const records = await readStaffPolicySourceRecords(manager, TENANT);
  const projection = projectStaffPolicySnapshotV1(
    {
      tenantId: TENANT,
      sequence,
      previousSequence,
      previousDigest,
      publisherBackendBuild,
    },
    records,
  );
  if (projection.ok === false) throw new Error(projection.error.code);
  return projection.value.digest;
};

// Replay digest: the source records reprojected under the default newest
// snapshot's own chain metadata (sequence 7, previous 6, previousDigest A).
// Publish digest: the next publication body (sequence 8 chained from it).
let REPLAY_DIGEST = '';
let PUBLISH_DIGEST = '';

beforeAll(async () => {
  REPLAY_DIGEST = await projectDigest('7', '6', DIGEST_A, BUILD);
  PUBLISH_DIGEST = await projectDigest('8', '7', DIGEST_A, BUILD);
});

// Shaped exactly as the aliased newest-snapshot read returns rows to the
// publisher: camelCase aliases from the SELECT.
const DEFAULT_NEWEST = {
  sequence: '7',
  previousSequence: '6',
  previousDigest: DIGEST_A,
  // Differs from REPLAY_DIGEST, so the default scenario publishes.
  digest: DIGEST_A,
  cohortDecision: 'DISABLED',
};

const DEFAULT_SOURCES = [
  {
    id: USER_A,
    role: 'MANAGER',
    is_active: true,
    attempt_reset_generation: '2',
    pin_hash: PIN,
    custom_permissions: ['sales:void_invoice', 'sales:void_invoice'],
  },
  {
    id: USER_B,
    role: 'WAITER',
    is_active: false,
    attempt_reset_generation: '0',
    pin_hash: null,
    custom_permissions: null,
  },
  {
    id: USER_C,
    role: 'CASHIER',
    is_active: true,
    attempt_reset_generation: '0',
    pin_hash: null,
    custom_permissions: null,
  },
];

const INSERT_SNAPSHOT = 'INSERT INTO human_auth_policy_snapshots';
const CAS_UPDATE = 'UPDATE human_auth_tenant_publication_state';

interface QueryCall {
  sql: string;
  params?: unknown[];
}

interface Answers {
  marker?: unknown[];
  newest?: unknown[];
  cohort?: unknown[];
  sources?: unknown[];
  updateResult?: unknown[];
  insertError?: { code: string };
}

const makeQuery = (calls: QueryCall[], answers: Answers) =>
  jest.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    if (sql.includes('set_config')) return [];
    if (sql.includes('pg_advisory_xact_lock')) return [];
    if (sql.includes('FROM human_auth_tenant_publication_state'))
      return answers.marker ?? [{ dirty: true, revision: '3' }];
    if (sql.startsWith('INSERT INTO human_auth_tenant_publication_state'))
      return [];
    if (sql.includes('FROM human_auth_policy_snapshots'))
      return answers.newest ?? [DEFAULT_NEWEST];
    if (sql.includes('FROM human_auth_rollout_cohorts'))
      return answers.cohort ?? [];
    if (sql.includes('FROM users')) return answers.sources ?? DEFAULT_SOURCES;
    if (sql.includes(INSERT_SNAPSHOT)) {
      if (answers.insertError)
        throw Object.assign(new Error('unique constraint violated'), {
          code: answers.insertError.code,
        });
      return [];
    }
    if (sql.includes(CAS_UPDATE)) return answers.updateResult ?? [[], 1];
    throw new Error(`unexpected query: ${sql}`);
  });

const runPublish = async (answers: Answers = {}, build = BUILD) => {
  const calls: QueryCall[] = [];
  const manager = {
    query: makeQuery(calls, answers),
  } as unknown as EntityManager;
  const seam = {
    run: async (_tenant: unknown, work: (m: EntityManager) => unknown) =>
      await work(manager),
  };
  const service = new StaffPolicySnapshotPublisher(
    seam as unknown as OhacTenantTransaction,
  );
  const outcome = await service.publish({
    tenantId: TENANT,
    publisherBackendBuild: build,
  });
  return { outcome, calls };
};

const callFor = (calls: QueryCall[], fragment: string) => {
  const call = calls.find((c) => c.sql.includes(fragment));
  if (!call) throw new Error(`no query containing ${fragment}`);
  return call;
};

describe('StaffPolicySnapshotPublisher', () => {
  it('runs inside the RLS seam and takes the advisory lock before any tenant read or write', async () => {
    const calls: QueryCall[] = [];
    const dataSource = {
      transaction: async (cb: (m: EntityManager) => unknown) =>
        await cb({ query: makeQuery(calls, {}) } as unknown as EntityManager),
    } as unknown as DataSource;
    const service = new StaffPolicySnapshotPublisher(
      new OhacTenantTransaction(dataSource),
    );
    await service.publish({ tenantId: TENANT, publisherBackendBuild: BUILD });
    expect(calls[0].sql).toContain('set_config');
    expect(calls[0].params).toEqual([TENANT]);
    expect(calls[1].sql).toContain('pg_advisory_xact_lock');
    expect(calls[1].params).toEqual([TENANT]);
    for (const call of calls.slice(2)) {
      expect(call.sql).not.toMatch(/pg_advisory_xact_lock|set_config/);
    }
  });

  it('no-ops on a clean marker without reading sources or writing anything', async () => {
    const { outcome, calls } = await runPublish({
      marker: [{ dirty: false, revision: '5' }],
    });
    expect(outcome).toEqual({ status: 'noop' });
    expect(
      callFor(calls, 'FROM human_auth_tenant_publication_state').params,
    ).toEqual([TENANT]);
    for (const call of calls.slice(2)) {
      expect(call.sql).not.toMatch(
        /FROM users|human_auth_policy_snapshots|INSERT|UPDATE/,
      );
    }
  });

  it('materializes an absent marker on demand with schema defaults and treats it as dirty', async () => {
    const { outcome, calls } = await runPublish({ marker: [] });
    expect(outcome).toMatchObject({ status: 'published', sequence: '8' });
    expect(
      callFor(calls, 'INSERT INTO human_auth_tenant_publication_state').params,
    ).toEqual([TENANT]);
    expect(callFor(calls, CAS_UPDATE).params).toEqual([TENANT, '1']);
  });

  it('publishes the next sequence chained from the newest snapshot', async () => {
    const { outcome, calls } = await runPublish();
    expect(outcome).toEqual({
      status: 'published',
      sequence: '8',
      digest: PUBLISH_DIGEST,
      markerCleared: true,
    });
    expect(callFor(calls, INSERT_SNAPSHOT).params).toEqual([
      TENANT,
      '8',
      '7',
      STAFF_POLICY_SNAPSHOT_V1_SCHEMA,
      DIGEST_A,
      BUILD,
      MINIMUM_ASSERTION_SCHEMA,
      'DISABLED',
      PUBLISH_DIGEST,
      expect.objectContaining({ digest: PUBLISH_DIGEST, sequence: '8' }),
    ]);
    expect(callFor(calls, CAS_UPDATE).params).toEqual([TENANT, '3']);
  });

  it('chains sequence 1 from 0/GENESIS when the tenant has no snapshot yet', async () => {
    const { outcome, calls } = await runPublish({ newest: [] });
    expect(outcome).toMatchObject({ status: 'published', sequence: '1' });
    expect(callFor(calls, INSERT_SNAPSHOT).params?.slice(0, 8)).toEqual([
      TENANT,
      '1',
      '0',
      STAFF_POLICY_SNAPSHOT_V1_SCHEMA,
      'GENESIS',
      BUILD,
      MINIMUM_ASSERTION_SCHEMA,
      'DISABLED',
    ]);
  });

  it.each([
    ['ELIGIBLE', [{ ok: 1 }]],
    ['DISABLED', []],
  ])(
    'persists cohort decision %s from the tenant-level read',
    async (decision, cohort) => {
      const { calls } = await runPublish({ cohort });
      expect(callFor(calls, 'FROM human_auth_rollout_cohorts').params).toEqual([
        TENANT,
        BUILD,
      ]);
      expect(callFor(calls, INSERT_SNAPSHOT).params?.[7]).toBe(decision);
    },
  );

  it('reports unchanged and clears the marker without inserting when the replay digest and cohort decision match', async () => {
    const { outcome, calls } = await runPublish({
      newest: [{ ...DEFAULT_NEWEST, digest: REPLAY_DIGEST }],
    });
    expect(outcome).toEqual({
      status: 'unchanged',
      reason: 'replay-identical',
      digest: REPLAY_DIGEST,
      markerCleared: true,
    });
    expect(calls.some((c) => c.sql.includes(INSERT_SNAPSHOT))).toBe(false);
    expect(callFor(calls, CAS_UPDATE).params).toEqual([TENANT, '3']);
  });

  const expectRepublish = async (answers: Answers, build = BUILD) => {
    const { outcome, calls } = await runPublish(answers, build);
    expect(outcome).toMatchObject({ status: 'published', sequence: '8' });
    expect(calls.some((c) => c.sql.includes(INSERT_SNAPSHOT))).toBe(true);
  };

  it('republishes on different entries', async () => {
    await expectRepublish({
      newest: [{ ...DEFAULT_NEWEST, digest: REPLAY_DIGEST }],
      sources: [
        { ...DEFAULT_SOURCES[0], custom_permissions: ['loyalty:redeem'] },
        ...DEFAULT_SOURCES.slice(1),
      ],
    });
  });

  it('republishes on a different cohort decision', async () => {
    await expectRepublish({
      newest: [
        {
          ...DEFAULT_NEWEST,
          digest: REPLAY_DIGEST,
          cohortDecision: 'ELIGIBLE',
        },
      ],
    });
  });

  it('republishes on a different publisher build', async () => {
    await expectRepublish(
      { newest: [{ ...DEFAULT_NEWEST, digest: REPLAY_DIGEST }] },
      'backend-other',
    );
  });

  it('fails closed on projection failure, inserting nothing and leaving the marker dirty', async () => {
    const { outcome, calls } = await runPublish({
      sources: [
        {
          id: USER_A,
          role: 'MANAGER',
          is_active: true,
          attempt_reset_generation: '0',
          pin_hash: '$2x$not-a-bcrypt-prefix',
          custom_permissions: [],
        },
      ],
    });
    expect(outcome).toEqual({
      status: 'failed',
      error: { code: OHAC_ERROR_CODE.INVALID_FIELD, field: 'pinVerifier' },
    });
    expect(calls.some((c) => c.sql.includes(INSERT_SNAPSHOT))).toBe(false);
    expect(calls.some((c) => c.sql.includes(CAS_UPDATE))).toBe(false);
  });

  it('reports published but leaves the marker dirty when the tenant was re-marked during publication', async () => {
    const { outcome, calls } = await runPublish({ updateResult: [[], 0] });
    expect(outcome).toEqual({
      status: 'published',
      sequence: '8',
      digest: PUBLISH_DIGEST,
      markerCleared: false,
    });
    expect(calls.some((c) => c.sql.includes(INSERT_SNAPSHOT))).toBe(true);
    expect(callFor(calls, CAS_UPDATE).params).toEqual([TENANT, '3']);
  });

  it('treats a unique violation on insert as the idempotent already-published case', async () => {
    const { outcome, calls } = await runPublish({
      insertError: { code: '23505' },
    });
    expect(outcome).toEqual({
      status: 'unchanged',
      reason: 'already-published',
      digest: PUBLISH_DIGEST,
      markerCleared: true,
    });
    expect(callFor(calls, CAS_UPDATE).params).toEqual([TENANT, '3']);
  });

  it('binds the tenant as a parameter and never interpolates it into SQL', async () => {
    const { calls } = await runPublish();
    for (const call of calls) {
      expect(call.sql).not.toContain(TENANT);
    }
    expect(callFor(calls, 'pg_advisory_xact_lock').params).toEqual([TENANT]);
    expect(
      callFor(calls, 'FROM human_auth_tenant_publication_state').params,
    ).toEqual([TENANT]);
    expect(callFor(calls, 'FROM human_auth_policy_snapshots').params).toEqual([
      TENANT,
    ]);
    expect(callFor(calls, 'FROM human_auth_rollout_cohorts').params).toEqual([
      TENANT,
      BUILD,
    ]);
    expect(callFor(calls, 'FROM users').params).toEqual([TENANT]);
    expect(callFor(calls, INSERT_SNAPSHOT).params?.[0]).toBe(TENANT);
    expect(callFor(calls, CAS_UPDATE).params?.[0]).toBe(TENANT);
  });
});
