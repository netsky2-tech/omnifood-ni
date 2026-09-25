import { randomUUID } from 'crypto';
import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  OnboardingSession,
  OnboardingLifecycleState,
} from '../../src/modules/onboarding/entities/onboarding-session.entity';
import {
  OnboardingSessionService,
  OnboardingStartSource,
} from '../../src/modules/onboarding/services/onboarding-session.service';
import { TenantContextRequiredError } from '../../src/core/database/tenant-transaction';
import { createMigrationBuiltSchemaFixture } from '../support/migration-built-schema.helper';

/**
 * Issue #493 T2.S2a: the production `OnboardingSessionService` exercised
 * against the MIGRATION-BUILT schema (never `synchronize: true`) and the
 * fixture's runtime role — `NOSUPERUSER NOBYPASSRLS`, owner of nothing, holding
 * exactly ordinary DML grants. `onboarding_sessions` has FORCEd row-level
 * security (migration 1809220000000), so every statement this service issues
 * through an unbound pooled connection is subject to the migrated policies and
 * must fail closed; tenant-local behavior is only reachable through the
 * service's tenant-bound transaction path.
 *
 * The superuser connection exists only to seed two tenants' probe rows and to
 * assert catalog/persistence facts that RLS would hide. All tenant ids are
 * synthetic UUIDs (tenant_id is a uuid column and carries no FK to tenants).
 */

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? 5432),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

const poolCleanupExtra = { extra: { allowExitOnIdle: true } };

describe('OnboardingSessionService under migration-built FORCE RLS (Real PostgreSQL DB, table non-owner role)', () => {
  jest.setTimeout(180000);

  let admin: DataSource;
  let runtime: DataSource;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;
  let schema: string;

  // Seeded probe rows: A and B each own exactly one session.
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const sessionAId = randomUUID();
  const sessionBId = randomUUID();
  // Fresh tenants for the create/concurrency paths (uq_onboarding_sessions_tenant_id
  // admits one session per tenant, so the create path needs untouched ids).
  const tenantCId = randomUUID();
  const tenantDId = randomUUID();

  const adminCountFor = async (tenantId: string): Promise<number> => {
    const rows = await admin.query(
      `SELECT count(*)::int AS count FROM onboarding_sessions WHERE tenant_id = $1`,
      [tenantId],
    );
    return rows[0].count;
  };

  beforeAll(async () => {
    fixture = await createMigrationBuiltSchemaFixture();
    schema = fixture.schema;

    admin = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema,
      ...poolCleanupExtra,
      extra: {
        ...poolCleanupExtra.extra,
        options: `-c search_path=${schema},public`,
      },
    });
    await admin.initialize();

    await admin.query(
      `INSERT INTO onboarding_sessions (id, tenant_id)
       VALUES ($1, $2), ($3, $4)`,
      [sessionAId, tenantAId, sessionBId, tenantBId],
    );

    // The runtime connection registers only the entity metadata (never
    // `synchronize`): the schema is exclusively the migrations' output, and the
    // repository needs the metadata to exercise the production service.
    runtime = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      username: fixture.runtimeRoleName,
      password: fixture.runtimeRolePassword,
      entities: [OnboardingSession],
      ...poolCleanupExtra,
    });
    await runtime.initialize();
  });

  afterAll(async () => {
    if (runtime?.isInitialized) await runtime.destroy();
    if (admin?.isInitialized) await admin.destroy();
    if (fixture) await fixture.close();
  });

  /**
   * Builds the production service on the application-shaped connection: the
   * runtime role's repository of `onboarding_sessions`. Before the tenant
   * binding this is an unbound pooled connection against a FORCE-RLS table.
   */
  const makeService = (): OnboardingSessionService =>
    new OnboardingSessionService(runtime.getRepository(OnboardingSession));

  it('runs as a NOSUPERUSER, NOBYPASSRLS role that owns none of the tables', async () => {
    const role = (
      await admin.query(
        `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1`,
        [fixture.runtimeRoleName],
      )
    )[0];
    expect(role).toBeDefined();
    expect(role.rolsuper).toBe(false);
    expect(role.rolbypassrls).toBe(false);

    const owned = await admin.query(
      `SELECT count(*)::int AS count FROM pg_tables
        WHERE schemaname = $1 AND tablename = 'onboarding_sessions'
          AND tableowner = $2`,
      [schema, fixture.runtimeRoleName],
    );
    expect(owned[0].count).toBe(0);
  });

  it('creates a single tenant-local session through the production service and keeps ensureOnboardingStarted idempotent', async () => {
    const service = makeService();

    const first = await service.ensureOnboardingStarted({
      tenantId: tenantCId,
      actorUserId: 'owner-c',
      source: OnboardingStartSource.SETUP_CENTER,
    });

    expect(first.id).toBeDefined();
    expect(first.tenantId).toBe(tenantCId);
    expect(first.lifecycleState).toBe(
      OnboardingLifecycleState.SETUP_IN_PROGRESS,
    );
    expect(first.onboardingStartedAt).toBeInstanceOf(Date);
    expect(first.optimisticVersion).toBe(1);

    const recordedStartedAt = new Date(first.onboardingStartedAt).getTime();
    await new Promise((r) => setTimeout(r, 15));

    const second = await service.ensureOnboardingStarted({
      tenantId: tenantCId,
      actorUserId: 'owner-c',
      source: OnboardingStartSource.FISCAL_SETUP,
    });

    expect(second.id).toBe(first.id);
    expect(new Date(second.onboardingStartedAt).getTime()).toBe(
      recordedStartedAt,
    );
    expect(second.optimisticVersion).toBe(2);
    expect(await adminCountFor(tenantCId)).toBe(1);
  });

  it('observes exactly the bound tenant session on reads (tenant-local, no cross-tenant rows)', async () => {
    const service = makeService();

    const fetchedA = await service.getSession(tenantAId);
    const fetchedB = await service.getSession(tenantBId);

    expect(fetchedA).not.toBeNull();
    expect(fetchedA?.id).toBe(sessionAId);
    expect(fetchedA?.tenantId).toBe(tenantAId);

    expect(fetchedB).not.toBeNull();
    expect(fetchedB?.id).toBe(sessionBId);
    expect(fetchedB?.tenantId).toBe(tenantBId);
  });

  it('updates the bound tenant session with optimistic locking and still conflicts on a stale version', async () => {
    const service = makeService();

    const sessionA = await service.getSession(tenantAId);
    expect(sessionA).not.toBeNull();

    const updated = await service.updateSessionWithOptimisticLock(sessionA, 1, {
      lifecycleState: OnboardingLifecycleState.SALE_READY,
    });
    expect(updated.optimisticVersion).toBe(2);
    expect(updated.lifecycleState).toBe(OnboardingLifecycleState.SALE_READY);

    const persisted = await admin.query(
      `SELECT optimistic_version, lifecycle_state FROM onboarding_sessions WHERE id = $1`,
      [sessionAId],
    );
    expect(persisted[0].optimistic_version).toBe(2);
    expect(persisted[0].lifecycle_state).toBe('SALE_READY');

    // Stale expected version: the row is now at version 2.
    await expect(
      service.updateSessionWithOptimisticLock(sessionA, 1, {
        lifecycleState: OnboardingLifecycleState.ACTIVATED,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('cannot update another tenant session through the service: a forged tenant binding affects zero rows', async () => {
    const service = makeService();

    const sessionB = await service.getSession(tenantBId);
    expect(sessionB).not.toBeNull();

    // Tenant A's context claiming tenant B's row id: the update runs bound to
    // A, so RLS hides B's row, the optimistic update affects zero rows, and
    // the service must surface the conflict instead of silently mutating.
    const forged = {
      ...sessionB,
      tenantId: tenantAId,
    };
    await expect(
      service.updateSessionWithOptimisticLock(forged, 1, {
        lifecycleState: OnboardingLifecycleState.ACTIVATED,
      }),
    ).rejects.toThrow(ConflictException);

    const untouched = await admin.query(
      `SELECT optimistic_version, lifecycle_state FROM onboarding_sessions WHERE id = $1`,
      [sessionBId],
    );
    expect(untouched[0].optimistic_version).toBe(1);
    expect(untouched[0].lifecycle_state).toBe('PROVISIONED');
  });

  it('persists saveSession for the bound tenant only and leaves the other tenant untouched', async () => {
    const service = makeService();

    const sessionA = await service.getSession(tenantAId);
    expect(sessionA).not.toBeNull();
    const mutated = {
      ...sessionA,
      measurementEligible: false,
    };
    await service.saveSession(mutated);

    const refetchedA = await service.getSession(tenantAId);
    expect(refetchedA?.measurementEligible).toBe(false);

    const refetchedB = await service.getSession(tenantBId);
    expect(refetchedB?.measurementEligible).toBe(true);
  });

  it('fails closed and non-disclosing when the tenant context is blank', async () => {
    const service = makeService();

    await expect(service.getSession('')).rejects.toThrow(
      TenantContextRequiredError,
    );
    await expect(service.getSession('   ')).rejects.toThrow(
      TenantContextRequiredError,
    );
    await expect(
      service.ensureOnboardingStarted({
        tenantId: '   ',
        source: OnboardingStartSource.SETUP_CENTER,
      }),
    ).rejects.toThrow(TenantContextRequiredError);

    // The error must not reveal which tenants exist.
    let message = '';
    try {
      await service.getSession('   ');
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain(tenantAId);
    expect(message).not.toContain(tenantBId);

    // And no session was created for the blank context.
    expect(await adminCountFor(tenantAId)).toBe(1);
    expect(await adminCountFor(tenantBId)).toBe(1);
  });

  it('tolerates concurrent start calls without duplicating the tenant session', async () => {
    const service = makeService();

    const results = await Promise.allSettled([
      service.ensureOnboardingStarted({
        tenantId: tenantDId,
        actorUserId: 'owner-tab-1',
        source: OnboardingStartSource.SETUP_CENTER,
      }),
      service.ensureOnboardingStarted({
        tenantId: tenantDId,
        actorUserId: 'owner-tab-2',
        source: OnboardingStartSource.SETUP_CENTER,
      }),
    ]);

    const fulfilled = results.filter(
      (r): r is PromiseFulfilledResult<OnboardingSession> =>
        r.status === 'fulfilled',
    );
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    expect(await adminCountFor(tenantDId)).toBe(1);
  });
});
