import { DataSource, type EntityManager } from 'typeorm';
import { randomUUID } from 'crypto';
import { OhacTenantTransaction } from '../rls/ohac-tenant-transaction';
import {
  markTenantPublicationDirty,
  readOrMaterializeMarker,
} from '../services/tenant-publication-marker';
import {
  createOhacPublicationFixture,
  type OhacPublicationFixture,
} from './ohac-publication-db.fixture';

/**
 * Test-only real-database coverage for the OHAC publication stack's schema
 * enforcement (migration 180904/180905): every assertion runs through a
 * dedicated NOSUPERUSER NOBYPASSRLS role against the real migrations — never
 * against hand-built tables. Admin (superuser) connections are used only for
 * provisioning, seeding, and policy-catalog inspection.
 */
const P4_DIGEST_A = `sha256:${'a'.repeat(64)}`;
const P4_DIGEST_B = `sha256:${'b'.repeat(64)}`;
const P4_DIGEST_C = `sha256:${'c'.repeat(64)}`;

describe('OHAC publication stack schema enforcement (restricted role, real migrations)', () => {
  let fixture: OhacPublicationFixture;
  let admin: DataSource;
  let restricted: DataSource;
  let transaction: OhacTenantTransaction;
  let tenantA: string;
  let tenantB: string;
  let tenantC: string;
  let schema: string;

  const bound = <T>(
    tenantId: string,
    fn: (manager: EntityManager) => Promise<T>,
  ): Promise<T> => transaction.run(tenantId, fn);

  beforeAll(async () => {
    fixture = await createOhacPublicationFixture();
    admin = fixture.admin;
    restricted = fixture.restricted;
    transaction = fixture.transaction;
    schema = fixture.schema;
    tenantA = randomUUID();
    tenantB = randomUUID();
    tenantC = randomUUID();

    await fixture.seedSnapshot(tenantA, 1, P4_DIGEST_A);
    await fixture.seedSnapshot(tenantA, 2, P4_DIGEST_B);
    await fixture.seedSnapshot(tenantB, 1, P4_DIGEST_C);
    await fixture.seedMarker(tenantA, 3);
  });

  afterAll(async () => {
    // Provisioning may have thrown before the fixture object existed; close()
    // itself already attempts every cleanup step even when an earlier one
    // fails, so this guard only avoids dereferencing an undefined fixture.
    if (fixture) await fixture.close();
  });

  it('refuses unbound reads of the RLS-guarded publication tables', async () => {
    const snapshots: { n: number }[] = await restricted.query(
      'SELECT count(*)::int AS n FROM human_auth_policy_snapshots',
    );
    const markers: { n: number }[] = await restricted.query(
      'SELECT count(*)::int AS n FROM human_auth_tenant_publication_state',
    );
    expect(snapshots[0].n).toBe(0);
    expect(markers[0].n).toBe(0);
  });

  it('refuses unbound inserts into the RLS-guarded publication tables', async () => {
    await expect(
      restricted.query(
        'INSERT INTO human_auth_tenant_publication_state (tenant_id) VALUES ($1)',
        [tenantA],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      restricted.query(
        `INSERT INTO human_auth_policy_snapshots
           (tenant_id, sequence, previous_sequence, schema, previous_digest,
            publisher_backend_build, minimum_assertion_schema, cohort_decision,
            digest, payload)
         VALUES ($1, 1, 0, 'ohac.staff-policy-snapshot.v1', 'GENESIS', 'b', 'b',
                 'ELIGIBLE', $2, '{}'::jsonb)`,
        [tenantA, P4_DIGEST_A],
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('shows a tenant-bound role only its own rows', async () => {
    const seen = await bound(tenantA, (manager) =>
      manager.query(
        'SELECT tenant_id, sequence FROM human_auth_policy_snapshots ORDER BY sequence',
      ),
    );
    expect(seen).toHaveLength(2);
    expect(seen.map((row: { tenant_id: string }) => row.tenant_id)).toEqual([
      tenantA,
      tenantA,
    ]);

    const marker = await bound(tenantB, (manager) =>
      manager.query(
        'SELECT tenant_id FROM human_auth_tenant_publication_state',
      ),
    );
    expect(marker).toHaveLength(0); // tenantB has no marker row seeded
  });

  it('refuses a cross-tenant insert with a row-level-security violation', async () => {
    await expect(
      bound(tenantA, (manager) =>
        manager.query(
          `INSERT INTO human_auth_policy_snapshots
             (tenant_id, sequence, previous_sequence, schema, previous_digest,
              publisher_backend_build, minimum_assertion_schema, cohort_decision,
              digest, payload)
           VALUES ($1, 1, 0, 'ohac.staff-policy-snapshot.v1', 'GENESIS', 'b', 'b',
                   'ELIGIBLE', $2, '{}'::jsonb)`,
          [tenantB, P4_DIGEST_A],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('refuses UPDATE and DELETE on the snapshot table via the append-only trigger even with full privileges', async () => {
    // The migration installs BOTH a `BEFORE UPDATE ... FOR EACH ROW` and a
    // `BEFORE UPDATE OR DELETE ... FOR EACH STATEMENT` append-only trigger
    // with the same message, and the statement-level one fires before rows
    // are scanned. This test therefore proves the table refuses UPDATE and
    // DELETE while the restricted role holds the corresponding privileges —
    // it cannot show rows were visible or distinguish the two triggers. The
    // catalog assertion below pins both triggers' existence instead of
    // claiming row-level behavior the statement does not demonstrate.
    await expect(
      bound(tenantA, (manager) =>
        manager.query(
          'UPDATE human_auth_policy_snapshots SET digest = $1 WHERE tenant_id = $2',
          [P4_DIGEST_C, tenantA],
        ),
      ),
    ).rejects.toThrow(/append-only: update and delete are forbidden/);
    // DELETE holds the table privilege, so a `42501` here would mean the ACL
    // or RLS refused; the append-only error instead proves the trigger — not
    // a missing grant — is the layer that forbids deletion.
    await expect(
      bound(tenantA, (manager) =>
        manager.query(
          'DELETE FROM human_auth_policy_snapshots WHERE tenant_id = $1',
          [tenantA],
        ),
      ),
    ).rejects.toThrow(/append-only: update and delete are forbidden/);

    const triggers: { tgname: string }[] = await admin.query(
      `SELECT tgname FROM pg_trigger
        WHERE tgrelid = $1::regclass AND NOT tgisinternal
        ORDER BY tgname`,
      [`"${schema}".human_auth_policy_snapshots`],
    );
    expect(triggers.map((trigger) => trigger.tgname)).toEqual([
      'trg_human_auth_policy_snapshots_append_only_row',
      'trg_human_auth_policy_snapshots_append_only_stmt',
    ]);
  });

  it('default-denies DELETE via the missing policy, not the missing grant', async () => {
    const policies: { policyname: string }[] = await admin.query(
      `SELECT policyname FROM pg_policies
        WHERE schemaname = $1
          AND tablename IN ('human_auth_policy_snapshots', 'human_auth_tenant_publication_state')
          AND cmd = 'DELETE'`,
      [schema],
    );
    expect(policies).toHaveLength(0);

    // The fixture GRANTS DELETE on the marker table, so this statement cannot
    // fail with a `42501` ACL refusal — the signature of a missing grant.
    // With no DELETE policy, FORCED RLS is default-deny: the USING predicate
    // is false for every row, so the statement completes without raising,
    // affects ZERO rows, and every row survives. A missing grant would raise;
    // a present DELETE policy would delete rows; this proves the middle case.
    const result: unknown[] = await bound(tenantA, (manager) =>
      manager.query(
        'DELETE FROM human_auth_tenant_publication_state WHERE tenant_id = $1',
        [tenantA],
      ),
    );
    expect(Number(result[1])).toBe(0);

    // Re-read through the admin connection: the marker row is still there,
    // unchanged, proving the delete touched nothing.
    const survived: { dirty: boolean; revision: string }[] = await admin.query(
      'SELECT dirty, revision FROM human_auth_tenant_publication_state WHERE tenant_id = $1',
      [tenantA],
    );
    expect(survived).toHaveLength(1);
    expect(survived[0]).toEqual({ dirty: true, revision: '3' });

    // The snapshot table cannot be exercised the same way: its statement-level
    // append-only trigger fires before RLS filtering (asserted above), so the
    // absence of a DELETE policy there is proven by the catalog assertion
    // plus the granted privilege, not by row survival.
  });

  it('rejects marker revision regression via the mutation guard', async () => {
    await expect(
      bound(tenantA, (manager) =>
        manager.query(
          'UPDATE human_auth_tenant_publication_state SET revision = revision - 1 WHERE tenant_id = $1',
          [tenantA],
        ),
      ),
    ).rejects.toThrow(/revision regression is forbidden/);
  });

  it('rejects marker tenant re-identification via the mutation guard', async () => {
    await expect(
      bound(tenantA, (manager) =>
        manager.query(
          'UPDATE human_auth_tenant_publication_state SET tenant_id = $1 WHERE tenant_id = $2',
          [tenantB, tenantA],
        ),
      ),
    ).rejects.toThrow(/tenant re-identification is forbidden/);
  });

  it('materializes the marker on first read and bumps its revision on marking', async () => {
    const result = await bound(tenantC, async (manager) => {
      const first = await readOrMaterializeMarker(manager, tenantC);
      await markTenantPublicationDirty(manager, tenantC);
      const second = await readOrMaterializeMarker(manager, tenantC);
      return { first, second };
    });
    expect(result.first).toEqual({ dirty: true, revision: '1' });
    expect(result.second).toEqual({ dirty: true, revision: '2' });

    const persisted: { revision: string; dirty: boolean }[] = await admin.query(
      'SELECT revision, dirty FROM human_auth_tenant_publication_state WHERE tenant_id = $1',
      [tenantC],
    );
    expect(persisted[0]).toEqual({ revision: '2', dirty: true });
  });
});
