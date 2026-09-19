import { randomUUID } from 'crypto';
import {
  MINIMUM_ASSERTION_SCHEMA,
  STAFF_POLICY_EPOCH_V1_SCHEMA,
} from '../contracts/staff-policy-epoch.v1';
import {
  createOhacPublicationFixture,
  type OhacPublicationFixture,
} from './ohac-publication-db.fixture';

/**
 * Real-database coverage for the per-terminal epoch materialization path
 * (design §11.2 decisions 17 and 19, §11.4 decisions 24-28). These assertions
 * only mean something against PostgreSQL: the unique keys that make a
 * repeated pull safe, the forced row-level security that scopes every read,
 * and the jsonb round trip the payload validation depends on are all server
 * behaviour, not application logic.
 */
describe('StaffPolicyEpochMaterializationService on the restricted real database', () => {
  const BUILD = 'pos-build-1';
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

  const materialize = (
    tenantId: string,
    terminalId: string,
    posBuild: string,
  ) => fixture.materialization.materialize({ tenantId, terminalId, posBuild });

  it('materializes the first epoch from the tenant snapshot and persists it', async () => {
    const tenantId = randomUUID();
    const terminalId = `terminal-${randomUUID().slice(0, 8)}`;
    const snapshot = await fixture.seedProjectedSnapshot(
      tenantId,
      { sequence: 1, publisherBackendBuild: 'backend-build-1' },
      staff,
    );
    await fixture.seedCohortPair(tenantId, BUILD, 'backend-build-1');

    const outcome = await materialize(tenantId, terminalId, BUILD);

    expect(outcome.status).toBe('deliver');
    if (outcome.status !== 'deliver') return;
    expect(outcome.sequence).toBe('1');
    // The per-terminal digest is deliberately not the snapshot digest: the
    // epoch covers the terminal identity and the negotiated build, which the
    // terminal-agnostic snapshot cannot contain.
    expect(outcome.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(outcome.digest).not.toBe(snapshot.digest);
    expect(outcome.epoch.schema).toBe(STAFF_POLICY_EPOCH_V1_SCHEMA);
    expect(outcome.epoch.targetTerminalId).toBe(terminalId);
    expect(outcome.epoch.targetPosBuild).toBe(BUILD);
    expect(outcome.epoch.minimumAssertionSchema).toBe(MINIMUM_ASSERTION_SCHEMA);
    expect(outcome.epoch.policyEntries).toHaveLength(1);

    const persisted = await fixture.readEpochs(tenantId, terminalId);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].sequence).toBe('1');
    expect(persisted[0].digest).toBe(outcome.digest);
    expect(persisted[0].targetPosBuild).toBe(BUILD);
  });

  it('does not duplicate the epoch when the same pull is repeated', async () => {
    const tenantId = randomUUID();
    const terminalId = `terminal-${randomUUID().slice(0, 8)}`;
    await fixture.seedProjectedSnapshot(
      tenantId,
      { sequence: 1, publisherBackendBuild: 'backend-build-1' },
      staff,
    );
    await fixture.seedCohortPair(tenantId, BUILD, 'backend-build-1');

    const first = await materialize(tenantId, terminalId, BUILD);
    const second = await materialize(tenantId, terminalId, BUILD);

    expect(first.status).toBe('deliver');
    expect(second.status).toBe('deliver');
    if (first.status !== 'deliver' || second.status !== 'deliver') return;
    // The stored row wins on the replay, so a repeated pull converges on the
    // same artifact instead of failing on the unique key.
    expect(second.digest).toBe(first.digest);
    expect(await fixture.readEpochs(tenantId, terminalId)).toHaveLength(1);
  });

  it('keeps exactly one epoch when two pulls race for the same sequence', async () => {
    const tenantId = randomUUID();
    const terminalId = `terminal-${randomUUID().slice(0, 8)}`;
    await fixture.seedProjectedSnapshot(
      tenantId,
      { sequence: 1, publisherBackendBuild: 'backend-build-1' },
      staff,
    );
    await fixture.seedCohortPair(tenantId, BUILD, 'backend-build-1');

    const [left, right] = await Promise.all([
      materialize(tenantId, terminalId, BUILD),
      materialize(tenantId, terminalId, BUILD),
    ]);

    // A losing race must not surface as a failure: the unique key makes the
    // second insert a no-op and the read-back returns the winner's row.
    expect([left.status, right.status]).toEqual(['deliver', 'deliver']);
    if (left.status !== 'deliver' || right.status !== 'deliver') return;
    expect(left.digest).toBe(right.digest);
    expect(await fixture.readEpochs(tenantId, terminalId)).toHaveLength(1);
  });

  it('gives each tenant its own sequence one and never sees another tenant snapshot', async () => {
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    const terminalA = `terminal-${randomUUID().slice(0, 8)}`;
    const terminalB = `terminal-${randomUUID().slice(0, 8)}`;
    await fixture.seedProjectedSnapshot(
      tenantA,
      { sequence: 1, publisherBackendBuild: 'backend-build-1' },
      staff,
    );
    await fixture.seedProjectedSnapshot(
      tenantB,
      { sequence: 1, publisherBackendBuild: 'backend-build-1' },
      staff,
    );
    await fixture.seedCohortPair(tenantA, BUILD, 'backend-build-1');
    await fixture.seedCohortPair(tenantB, BUILD, 'backend-build-1');

    const [a, b] = await Promise.all([
      materialize(tenantA, terminalA, BUILD),
      materialize(tenantB, terminalB, BUILD),
    ]);

    expect(a.status).toBe('deliver');
    expect(b.status).toBe('deliver');
    if (a.status !== 'deliver' || b.status !== 'deliver') return;
    expect(a.sequence).toBe('1');
    expect(b.sequence).toBe('1');
    expect(a.epoch.tenantId).toBe(tenantA);
    expect(b.epoch.tenantId).toBe(tenantB);
    expect(await fixture.readEpochs(tenantA, terminalB)).toHaveLength(0);
  });

  it('materializes nothing while the exact build pair has no enabled cohort', async () => {
    const tenantId = randomUUID();
    const terminalId = `terminal-${randomUUID().slice(0, 8)}`;
    await fixture.seedProjectedSnapshot(
      tenantId,
      { sequence: 1, publisherBackendBuild: 'backend-build-1' },
      staff,
    );
    // A cohort for a different POS build must not enable this one.
    await fixture.seedCohortPair(
      tenantId,
      'pos-build-other',
      'backend-build-1',
    );

    const outcome = await materialize(tenantId, terminalId, BUILD);

    expect(outcome.status).toBe('cohort-disabled');
    expect(await fixture.readEpochs(tenantId, terminalId)).toHaveLength(0);
  });

  it('refuses to deliver an epoch frozen for a different negotiated build', async () => {
    const tenantId = randomUUID();
    const terminalId = `terminal-${randomUUID().slice(0, 8)}`;
    await fixture.seedProjectedSnapshot(
      tenantId,
      { sequence: 1, publisherBackendBuild: 'backend-build-1' },
      staff,
    );
    await fixture.seedCohortPair(tenantId, BUILD, 'backend-build-1');
    const first = await materialize(tenantId, terminalId, BUILD);
    expect(first.status).toBe('deliver');

    // The terminal now negotiates a build that also has an enabled cohort, but
    // the only row for this sequence is immutable and was built for the old
    // one, so delivering it would strand the terminal.
    await fixture.seedCohortPair(tenantId, 'pos-build-2', 'backend-build-1');
    const second = await materialize(tenantId, terminalId, 'pos-build-2');

    expect(second.status).toBe('build-mismatch');
    const persisted = await fixture.readEpochs(tenantId, terminalId);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].targetPosBuild).toBe(BUILD);
  });

  it('fails closed when the stored snapshot payload disagrees with its signed digest', async () => {
    const tenantId = randomUUID();
    const terminalId = `terminal-${randomUUID().slice(0, 8)}`;
    // The row is seeded already disagreeing with itself: the payload carries a
    // different digest than the signed column. It cannot be produced by
    // updating a stored row, because the table is append-only and the trigger
    // refuses even a superuser, which is itself the property that keeps
    // published evidence intact.
    await fixture.seedProjectedSnapshot(
      tenantId,
      {
        sequence: 1,
        publisherBackendBuild: 'backend-build-1',
        payloadDigestOverride: 'sha256:' + '9'.repeat(64),
      },
      staff,
    );
    await fixture.seedCohortPair(tenantId, BUILD, 'backend-build-1');

    const outcome = await materialize(tenantId, terminalId, BUILD);

    expect(outcome).toMatchObject({
      status: 'failed',
      error: { code: 'OHAC_DIGEST_MISMATCH' },
    });
    expect(await fixture.readEpochs(tenantId, terminalId)).toHaveLength(0);
  });

  it('reports nothing to deliver when the tenant has no snapshot beyond the floor', async () => {
    const tenantId = randomUUID();
    const terminalId = `terminal-${randomUUID().slice(0, 8)}`;
    const snapshot = await fixture.seedProjectedSnapshot(
      tenantId,
      { sequence: 1, publisherBackendBuild: 'backend-build-1' },
      staff,
    );
    await fixture.seedCohortPair(tenantId, BUILD, 'backend-build-1');
    expect((await materialize(tenantId, terminalId, BUILD)).status).toBe(
      'deliver',
    );

    // The terminal has acknowledged sequence 1, so the next epoch it is owed is
    // sequence 2 and the tenant has no snapshot there: the terminal is current
    // rather than broken, and nothing new is written.
    await fixture.seedAckFloor(tenantId, terminalId, 1, snapshot.digest);
    const outcome = await materialize(tenantId, terminalId, BUILD);

    expect(outcome.status).toBe('nothing-to-deliver');
    expect(await fixture.readEpochs(tenantId, terminalId)).toHaveLength(1);
  });
});
