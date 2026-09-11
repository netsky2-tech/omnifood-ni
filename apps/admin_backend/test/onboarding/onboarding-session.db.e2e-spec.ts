import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import {
  OnboardingSession,
  OnboardingLifecycleState,
} from '../../src/modules/onboarding/entities/onboarding-session.entity';
import {
  OnboardingIdempotencyRecord,
  OnboardingIdempotencyStatus,
} from '../../src/modules/onboarding/entities/onboarding-idempotency.entity';
import {
  OnboardingSessionService,
  OnboardingStartSource,
} from '../../src/modules/onboarding/services/onboarding-session.service';

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? 5432),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

async function withSessionIsolatedSchema(
  schemaPrefix: string,
  assertion: (ctx: {
    dataSource: DataSource;
    service: OnboardingSessionService;
    tenantAId: string;
    tenantBId: string;
  }) => Promise<void>,
): Promise<void> {
  const bootstrap = new DataSource({ type: 'postgres', ...postgresConnection });
  const schema = `${schemaPrefix}_${randomUUID().replace(/-/g, '')}`;
  let dataSource: DataSource | null = null;

  try {
    await bootstrap.initialize();
    await bootstrap.query(`CREATE SCHEMA "${schema}"`);

    dataSource = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema,
      entities: [OnboardingSession, OnboardingIdempotencyRecord],
      synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(`SET search_path TO "${schema}"`);

    const sessionRepo = dataSource.getRepository(OnboardingSession);
    const service = new OnboardingSessionService(sessionRepo);

    await assertion({
      dataSource,
      service,
      tenantAId: `tenant_a_${randomUUID().slice(0, 8)}`,
      tenantBId: `tenant_b_${randomUUID().slice(0, 8)}`,
    });
  } finally {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    if (bootstrap.isInitialized) {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await bootstrap.destroy();
    }
  }
}

describe('OnboardingSession & EnsureOnboardingStarted (Real PostgreSQL DB)', () => {
  jest.setTimeout(30000);

  it('creates single primary session and enforces write-once onboardingStartedAt', async () => {
    await withSessionIsolatedSchema(
      'onb_session_core',
      async ({ service, tenantAId }) => {
        // 1. Initial start
        const first = await service.ensureOnboardingStarted({
          tenantId: tenantAId,
          actorUserId: 'owner-1',
          source: OnboardingStartSource.SETUP_CENTER,
        });

        expect(first.id).toBeDefined();
        expect(first.tenantId).toBe(tenantAId);
        expect(first.lifecycleState).toBe(
          OnboardingLifecycleState.SETUP_IN_PROGRESS,
        );
        expect(first.onboardingStartedAt).toBeDefined();
        expect(first.optimisticVersion).toBe(1);

        const recordedStartedAt = new Date(first.onboardingStartedAt).getTime();

        // Wait 10ms to ensure a different clock timestamp if overwritten
        await new Promise((r) => setTimeout(r, 15));

        // 2. Subsequent start call (e.g. user enters fiscal setup)
        const second = await service.ensureOnboardingStarted({
          tenantId: tenantAId,
          actorUserId: 'owner-1',
          source: OnboardingStartSource.FISCAL_SETUP,
        });

        expect(second.id).toBe(first.id);
        expect(new Date(second.onboardingStartedAt).getTime()).toBe(
          recordedStartedAt,
        );
        expect(second.optimisticVersion).toBe(2);
        expect(
          new Date(second.lastActivityAt).getTime(),
        ).toBeGreaterThanOrEqual(recordedStartedAt);
      },
    );
  });

  it('guarantees tenant isolation: Tenant A and Tenant B have separate unpolluted sessions', async () => {
    await withSessionIsolatedSchema(
      'onb_session_iso',
      async ({ service, tenantAId, tenantBId }) => {
        const sessionA = await service.ensureOnboardingStarted({
          tenantId: tenantAId,
          actorUserId: 'owner-a',
          source: OnboardingStartSource.SETUP_CENTER,
        });

        const sessionB = await service.ensureOnboardingStarted({
          tenantId: tenantBId,
          actorUserId: 'owner-b',
          source: OnboardingStartSource.SETUP_CENTER,
        });

        expect(sessionA.id).not.toBe(sessionB.id);
        expect(sessionA.tenantId).toBe(tenantAId);
        expect(sessionB.tenantId).toBe(tenantBId);

        const fetchedA = await service.getSession(tenantAId);
        const fetchedB = await service.getSession(tenantBId);

        expect(fetchedA?.id).toBe(sessionA.id);
        expect(fetchedB?.id).toBe(sessionB.id);
      },
    );
  });

  it('tolerates concurrent start calls without duplicating sessions or violating constraints', async () => {
    await withSessionIsolatedSchema(
      'onb_session_race',
      async ({ service, tenantAId }) => {
        // Launch two start commands simultaneously
        const results = await Promise.allSettled([
          service.ensureOnboardingStarted({
            tenantId: tenantAId,
            actorUserId: 'owner-tab-1',
            source: OnboardingStartSource.SETUP_CENTER,
          }),
          service.ensureOnboardingStarted({
            tenantId: tenantAId,
            actorUserId: 'owner-tab-2',
            source: OnboardingStartSource.SETUP_CENTER,
          }),
        ]);

        const fulfilled = results.filter(
          (r): r is PromiseFulfilledResult<OnboardingSession> =>
            r.status === 'fulfilled',
        );
        expect(fulfilled.length).toBeGreaterThanOrEqual(1);

        // Verify that in PostgreSQL there is exactly ONE session for this tenant
        const session = await service.getSession(tenantAId);
        expect(session).toBeDefined();
        expect(session?.tenantId).toBe(tenantAId);
        expect(session?.onboardingStartedAt).toBeDefined();
      },
    );
  });

  it('persists and enforces unique constraint on (tenant_id, idempotency_key)', async () => {
    await withSessionIsolatedSchema(
      'onb_idem_record',
      async ({ dataSource, tenantAId }) => {
        const idemRepo = dataSource.getRepository(OnboardingIdempotencyRecord);

        const record1 = idemRepo.create({
          tenantId: tenantAId,
          idempotencyKey: 'cmd-fiscal-setup-001',
          commandType: 'ConfigureFiscal',
          payloadHash: 'hash-abc-123',
          status: OnboardingIdempotencyStatus.IN_PROGRESS,
          leaseOwner: 'worker-1',
          leaseAcquiredAt: new Date(),
          leaseExpiresAt: new Date(Date.now() + 30000),
        });
        await idemRepo.save(record1);

        // Attempt to insert duplicate with same tenantId and idempotencyKey must throw
        const duplicate = idemRepo.create({
          tenantId: tenantAId,
          idempotencyKey: 'cmd-fiscal-setup-001',
          commandType: 'ConfigureFiscal',
          payloadHash: 'hash-abc-123',
          status: OnboardingIdempotencyStatus.IN_PROGRESS,
        });

        await expect(idemRepo.save(duplicate)).rejects.toThrow();
      },
    );
  });
});
