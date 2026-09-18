import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { GENESIS_DIGEST } from '../contracts/staff-policy-epoch.v1';
import { OHAC_ERROR_CODE } from '../contracts/error-codes';
import { StaffPolicySnapshotPublisher } from '../services/staff-policy-snapshot-publisher.service';
import { markTenantPublicationDirty } from '../services/tenant-publication-marker';
import {
  createOhacPublicationFixture,
  type OhacPublicationFixture,
} from './ohac-publication-db.fixture';

/**
 * Test-only real-database coverage for the serialized staff-policy snapshot
 * publisher (design §4.1 rule 6, §11.2 decisions 16–19): the publisher and
 * its OhacTenantTransaction seam run on a DataSource owned by a dedicated
 * NOSUPERUSER NOBYPASSRLS role against the real migrations, with no Nest
 * bootstrap. Seeding and assertions on cross-tenant state go through the
 * admin (superuser) connection.
 */
const BUILD = 'pos-backend-4.1.0-p4-test';

interface FixtureStaffMember {
  readonly role: string;
  readonly isActive: boolean;
  readonly pinHash: string | null;
}

const staffMember = (
  role = 'MANAGER',
  pinHash: string | null = `$2b$10$${'x'.repeat(53)}`,
): FixtureStaffMember => ({ role, isActive: true, pinHash });

describe('StaffPolicySnapshotPublisher on the restricted real database', () => {
  let fixture: OhacPublicationFixture;
  let admin: DataSource;
  let publisher: StaffPolicySnapshotPublisher;
  let firstTenant: string;
  let replayTenant: string;
  let changedTenant: string;
  let concurrentTenant: string;
  let failClosedTenant: string;
  let tenantB: string;

  const rowsFor = async (
    tenantId: string,
  ): Promise<Record<string, unknown>[]> =>
    admin.query(
      `SELECT sequence, previous_sequence AS "previousSequence", previous_digest AS "previousDigest",
              schema, cohort_decision AS "cohortDecision", digest,
              payload->>'sequence' AS "payloadSequence",
              payload->>'previousDigest' AS "payloadPreviousDigest"
         FROM human_auth_policy_snapshots WHERE tenant_id = $1 ORDER BY sequence`,
      [tenantId],
    );

  const seedEligibleTenant = async (
    tenantId: string,
    staff: readonly FixtureStaffMember[],
  ): Promise<void> => {
    await fixture.seedCohort(tenantId, BUILD);
    await fixture.seedTenantStaff(
      tenantId,
      staff.map((member) => ({
        role: member.role,
        isActive: member.isActive,
        pinHash: member.pinHash,
        customPermissions: [],
      })),
    );
  };

  /** Re-marks a tenant dirty through the restricted seam, exactly like the mutation path does (§11.2 decision 16). */
  const remarkDirty = (tenantId: string): Promise<void> =>
    fixture.transaction.run(tenantId, (manager) =>
      markTenantPublicationDirty(manager, tenantId),
    );

  beforeAll(async () => {
    fixture = await createOhacPublicationFixture();
    admin = fixture.admin;
    publisher = fixture.publisher;

    firstTenant = randomUUID();
    replayTenant = randomUUID();
    changedTenant = randomUUID();
    concurrentTenant = randomUUID();
    failClosedTenant = randomUUID();
    tenantB = randomUUID();

    await seedEligibleTenant(firstTenant, [
      staffMember(),
      staffMember('CASHIER'),
    ]);
    await seedEligibleTenant(replayTenant, [staffMember()]);
    await seedEligibleTenant(changedTenant, [staffMember()]);
    await seedEligibleTenant(concurrentTenant, [staffMember()]);
    await seedEligibleTenant(failClosedTenant, [staffMember('CASHIER', null)]);
    await seedEligibleTenant(tenantB, [staffMember()]);
  });

  afterAll(async () => {
    // Provisioning may have thrown before the fixture object existed; close()
    // itself already attempts every cleanup step even when an earlier one
    // fails, so this guard only avoids dereferencing an undefined fixture.
    if (fixture) await fixture.close();
  });

  it('publishes the first snapshot as sequence 1 chained from GENESIS and clears the marker', async () => {
    const outcome = await publisher.publish({
      tenantId: firstTenant,
      publisherBackendBuild: BUILD,
    });
    expect(outcome).toMatchObject({
      status: 'published',
      sequence: '1',
      markerCleared: true,
    });

    const rows = await rowsFor(firstTenant);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sequence: '1',
      previousSequence: '0',
      previousDigest: GENESIS_DIGEST,
      payloadSequence: '1',
      payloadPreviousDigest: GENESIS_DIGEST,
      cohortDecision: 'ELIGIBLE',
      schema: 'ohac.staff-policy-snapshot.v1',
    });

    const marker: { dirty: boolean }[] = await admin.query(
      'SELECT dirty FROM human_auth_tenant_publication_state WHERE tenant_id = $1',
      [firstTenant],
    );
    expect(marker[0].dirty).toBe(false);
  });

  it('keeps an unchanged republish idempotent as a replay', async () => {
    const outcome = await publisher.publish({
      tenantId: replayTenant,
      publisherBackendBuild: BUILD,
    });
    expect(outcome).toMatchObject({ status: 'published', sequence: '1' });

    // The mutation transaction re-marks the tenant dirty before publishing again.
    await remarkDirty(replayTenant);
    const replay = await publisher.publish({
      tenantId: replayTenant,
      publisherBackendBuild: BUILD,
    });
    expect(replay).toMatchObject({
      status: 'unchanged',
      reason: 'replay-identical',
      markerCleared: true,
    });

    const rows = await rowsFor(replayTenant);
    expect(rows).toHaveLength(1);

    // Do not trust the returned flag alone: the marker must actually be clean
    // in the database after the replay, read independently through the admin
    // connection (superuser, outside the RLS tenant binding).
    const marker: { dirty: boolean }[] = await admin.query(
      'SELECT dirty FROM human_auth_tenant_publication_state WHERE tenant_id = $1',
      [replayTenant],
    );
    expect(marker).toHaveLength(1);
    expect(marker[0].dirty).toBe(false);
  });

  it('chains sequence 2 from the previous digest after a policy change', async () => {
    await publisher.publish({
      tenantId: changedTenant,
      publisherBackendBuild: BUILD,
    });

    await admin.query(
      'UPDATE security_profiles SET pin_hash = $1 WHERE user_id IN (SELECT id FROM users WHERE tenant_id = $2)',
      [`$2b$10$${'y'.repeat(53)}`, changedTenant],
    );
    // The mutation transaction re-marks the tenant dirty before publishing again.
    await remarkDirty(changedTenant);
    const outcome = await publisher.publish({
      tenantId: changedTenant,
      publisherBackendBuild: BUILD,
    });
    expect(outcome).toMatchObject({ status: 'published', sequence: '2' });

    const rows = await rowsFor(changedTenant);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      sequence: '2',
      previousSequence: '1',
      previousDigest: rows[0].digest,
    });
  });

  it('serializes concurrent publishes so the loser observes the marker already cleared', async () => {
    const [left, right] = await Promise.all([
      publisher.publish({
        tenantId: concurrentTenant,
        publisherBackendBuild: BUILD,
      }),
      publisher.publish({
        tenantId: concurrentTenant,
        publisherBackendBuild: BUILD,
      }),
    ]);

    // The lock's observable signature is the outcome PAIR: the second
    // publisher, waiting on `pg_advisory_xact_lock`, re-reads the marker
    // after the winner commits, finds it already cleared, and returns the
    // no-op outcome. Exactly one `published` and exactly one `noop`, in
    // either order — an `unchanged` outcome would mean the loser raced past
    // the marker read into the already-published branch, and `failed` would
    // mean the serialization broke outright.
    const outcomes = [left, right].map((outcome) => outcome.status);
    expect(outcomes.filter((status) => status === 'published')).toHaveLength(1);
    expect(outcomes.filter((status) => status === 'noop')).toHaveLength(1);

    const rows = await rowsFor(concurrentTenant);
    const sequences = rows.map((row) => row.sequence);
    // Exactly one snapshot, sequence 1. The lock guarantees the loser never
    // derives a second sequence, so ['1'] is the lock's expected outcome —
    // not an accident of a single row making a contiguity check vacuous.
    expect(sequences).toEqual(['1']);
  });

  it('fails closed with no insert and a dirty marker when the projection rejects', async () => {
    const outcome = await publisher.publish({
      tenantId: failClosedTenant,
      publisherBackendBuild: BUILD,
    });
    expect(outcome).toMatchObject({
      status: 'failed',
      error: { code: OHAC_ERROR_CODE.INVALID_FIELD, field: 'policyEntries' },
    });

    const rows = await rowsFor(failClosedTenant);
    expect(rows).toHaveLength(0);

    const marker: { dirty: boolean }[] = await admin.query(
      'SELECT dirty FROM human_auth_tenant_publication_state WHERE tenant_id = $1',
      [failClosedTenant],
    );
    expect(marker[0].dirty).toBe(true);
  });

  it('gives tenant B its own sequence 1 and no visibility into tenant A rows', async () => {
    const outcome = await publisher.publish({
      tenantId: tenantB,
      publisherBackendBuild: BUILD,
    });
    expect(outcome).toMatchObject({ status: 'published', sequence: '1' });

    const ownRows = await fixture.transaction.run(tenantB, (manager) =>
      manager.query(
        'SELECT tenant_id, sequence FROM human_auth_policy_snapshots ORDER BY sequence',
      ),
    );
    expect(ownRows).toHaveLength(1);
    expect(ownRows[0].tenant_id).toBe(tenantB);
    expect(ownRows[0].sequence).toBe('1');
  });
});
