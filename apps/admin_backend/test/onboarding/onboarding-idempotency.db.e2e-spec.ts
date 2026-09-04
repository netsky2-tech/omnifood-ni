import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { ConflictException } from '@nestjs/common';
import {
  OnboardingSession,
  OnboardingLifecycleState,
} from '../../src/modules/onboarding/entities/onboarding-session.entity';
import {
  OnboardingIdempotencyRecord,
  OnboardingIdempotencyStatus,
} from '../../src/modules/onboarding/entities/onboarding-idempotency.entity';
import { OnboardingIdempotencyCoordinator } from '../../src/modules/onboarding/services/onboarding-idempotency.coordinator';
import { OnboardingSessionService } from '../../src/modules/onboarding/services/onboarding-session.service';

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? 5432),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

async function withIdempotencyIsolatedSchema(
  schemaPrefix: string,
  assertion: (ctx: {
    dataSource: DataSource;
    coordinator: OnboardingIdempotencyCoordinator;
    sessionService: OnboardingSessionService;
    tenantId: string;
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

    const recordRepo = dataSource.getRepository(OnboardingIdempotencyRecord);
    const sessionRepo = dataSource.getRepository(OnboardingSession);

    const coordinator = new OnboardingIdempotencyCoordinator(recordRepo);
    const sessionService = new OnboardingSessionService(sessionRepo);

    await assertion({
      dataSource,
      coordinator,
      sessionService,
      tenantId: `tenant_${randomUUID().slice(0, 8)}`,
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

describe('Onboarding Idempotency & Optimistic Concurrency (Real PostgreSQL DB)', () => {
  jest.setTimeout(30000);

  it('runs full idempotency lease lifecycle: acquire -> in progress lock -> complete -> replay cached result', async () => {
    await withIdempotencyIsolatedSchema('onb_idem_full', async ({ coordinator, tenantId }) => {
      const payload = { templateCode: 'CAFETERIA', selectedItems: ['latte', 'croissant'] };
      const idempotencyKey = 'cmd-template-apply-001';

      // 1. Initial acquire lease
      const lease1 = await coordinator.acquireLease({
        tenantId,
        idempotencyKey,
        commandType: 'ApplyTemplate',
        payload,
        leaseOwner: 'worker-primary',
        leaseTtlMs: 20000,
      });

      expect(lease1.state).toBe('ACQUIRED');
      if (lease1.state === 'ACQUIRED') {
        expect(lease1.record.status).toBe(OnboardingIdempotencyStatus.IN_PROGRESS);
        expect(lease1.record.attemptCount).toBe(1);
      }

      // 2. Concurrent worker with same key and payload while lease is active gets locked out
      await expect(
        coordinator.acquireLease({
          tenantId,
          idempotencyKey,
          commandType: 'ApplyTemplate',
          payload,
          leaseOwner: 'worker-secondary',
        }),
      ).rejects.toThrow(ConflictException);

      // 3. Worker with same key but different payload gets INTEGRITY_CONFLICT
      await expect(
        coordinator.acquireLease({
          tenantId,
          idempotencyKey,
          commandType: 'ApplyTemplate',
          payload: { templateCode: 'RETAIL', selectedItems: [] },
          leaseOwner: 'worker-attacker',
        }),
      ).rejects.toThrow(ConflictException);

      // 4. Primary worker completes successfully
      if (lease1.state === 'ACQUIRED') {
        await coordinator.completeSuccess(lease1.record.id, {
          applied: true,
          productsCreated: 2,
        });
      }

      // 5. Subsequent call with same key/payload returns ALREADY_COMPLETED with cached result without re-execution
      const leaseReplay = await coordinator.acquireLease({
        tenantId,
        idempotencyKey,
        commandType: 'ApplyTemplate',
        payload,
      });

      expect(leaseReplay.state).toBe('ALREADY_COMPLETED');
      if (leaseReplay.state === 'ALREADY_COMPLETED') {
        expect(leaseReplay.result).toEqual({ applied: true, productsCreated: 2 });
      }
    });
  });

  it('reclaims expired lease after worker failure and increments attempt count', async () => {
    await withIdempotencyIsolatedSchema('onb_idem_recovery', async ({ dataSource, coordinator, tenantId }) => {
      const payload = { importSessionId: randomUUID() };
      const idempotencyKey = 'cmd-import-commit-002';

      // 1. Worker 1 acquires short lease
      const lease1 = await coordinator.acquireLease({
        tenantId,
        idempotencyKey,
        commandType: 'CommitImport',
        payload,
        leaseOwner: 'worker-crashed',
        leaseTtlMs: 20, // 20ms TTL
      });

      expect(lease1.state).toBe('ACQUIRED');

      // Wait for lease to expire
      await new Promise((r) => setTimeout(r, 40));

      // 2. Worker 2 reclaims the expired lease
      const lease2 = await coordinator.acquireLease({
        tenantId,
        idempotencyKey,
        commandType: 'CommitImport',
        payload,
        leaseOwner: 'worker-recovered',
        leaseTtlMs: 20000,
      });

      expect(lease2.state).toBe('ACQUIRED');
      if (lease2.state === 'ACQUIRED') {
        expect(lease2.record.leaseOwner).toBe('worker-recovered');
        expect(lease2.record.attemptCount).toBe(2);
      }
    });
  });

  it('enforces optimistic session concurrency in PostgreSQL, preventing lost updates', async () => {
    await withIdempotencyIsolatedSchema('onb_opt_lock', async ({ sessionService, tenantId }) => {
      // 1. Start session (version = 1)
      const session = await sessionService.ensureOnboardingStarted({
        tenantId,
        source: 'SETUP_CENTER' as any,
      });

      expect(session.optimisticVersion).toBe(1);

      // 2. Writer A updates with expectedVersion = 1 -> succeeds, version becomes 2
      const updatedA = await sessionService.updateSessionWithOptimisticLock(
        session,
        1,
        { lifecycleState: OnboardingLifecycleState.SETUP_IN_PROGRESS },
      );
      expect(updatedA.optimisticVersion).toBe(2);

      // 3. Writer B (holding stale expectedVersion = 1) tries to update -> FAILS with ConflictException
      await expect(
        sessionService.updateSessionWithOptimisticLock(
          session,
          1, // Stale version!
          { lifecycleState: OnboardingLifecycleState.SALE_READY },
        ),
      ).rejects.toThrow(ConflictException);

      // 4. Writer B reloads session (version 2) and retries -> succeeds, version becomes 3
      const updatedB = await sessionService.updateSessionWithOptimisticLock(
        updatedA,
        2,
        { lifecycleState: OnboardingLifecycleState.SALE_READY },
      );
      expect(updatedB.optimisticVersion).toBe(3);
      expect(updatedB.lifecycleState).toBe(OnboardingLifecycleState.SALE_READY);
    });
  });
});
