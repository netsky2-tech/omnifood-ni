import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  OnboardingSession,
  OnboardingLifecycleState,
} from '../entities/onboarding-session.entity';
import {
  TENANT_CONTEXT_SET_CONFIG_SQL,
  TenantContextRequiredError,
} from '../../../core/database/tenant-transaction';
import {
  OnboardingSessionService,
  OnboardingStartSource,
} from './onboarding-session.service';

/**
 * Issue #493 T2.S2a: the session service resolves every protected-table
 * repository from the tenant-bound transaction manager, never from the pooled
 * default connection. These tests prove the ordering (set_config binding
 * before any repository access), the manager-scoped repository use, and the
 * fail-fast behavior when binding or the transaction itself fails.
 */
describe('OnboardingSessionService (Unit)', () => {
  let service: OnboardingSessionService;
  let pooledRepo: jest.Mocked<Repository<OnboardingSession>>;
  let managerRepo: jest.Mocked<Repository<OnboardingSession>>;
  let mockManager: jest.Mocked<EntityManager>;
  let dataSource: jest.Mocked<DataSource>;

  const tenantId = '8f1d6a62-0b1f-4a52-9c3e-7a1b2c3d4e5f';

  /**
   * Earliest invocation order across every manager-scoped repository method,
   * so the ordering proof holds for operations whose first protected access is
   * a findOne (reads), a save (saveSession), or a createQueryBuilder
   * (optimistic-lock update).
   */
  const firstRepositoryAccessOrder = (): number =>
    [
      managerRepo.findOne.mock.invocationCallOrder[0],
      managerRepo.save.mock.invocationCallOrder[0],
      managerRepo.create.mock.invocationCallOrder[0],
      managerRepo.createQueryBuilder.mock.invocationCallOrder[0],
    ]
      .filter((order): order is number => typeof order === 'number')
      .sort((a, b) => a - b)[0];

  const existingSession: OnboardingSession = {
    id: 'session-uuid-2',
    tenantId,
    lifecycleState: OnboardingLifecycleState.SETUP_IN_PROGRESS,
    onboardingStartedAt: new Date('2026-09-01T10:00:00Z'),
    saleReadyFirstAt: null,
    activationStartedAt: null,
    activatedAt: null,
    firstSuccessfulSaleAt: null,
    firstCustomerSaleAt: null,
    lastActivityAt: new Date('2026-09-01T10:00:00Z'),
    currentActivationAttemptId: null,
    measurementEligible: true,
    legacyBaseline: false,
    optimisticVersion: 1,
    createdAt: new Date('2026-09-01T10:00:00Z'),
    updatedAt: new Date('2026-09-01T10:00:00Z'),
  };

  beforeEach(async () => {
    managerRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (entity: any) => entity),
      create: jest.fn().mockImplementation((dto) => dto),
      createQueryBuilder: jest.fn(),
    } as unknown as jest.Mocked<Repository<OnboardingSession>>;

    mockManager = {
      query: jest.fn().mockResolvedValue(undefined),
      getRepository: jest.fn((target: unknown) => {
        if (target === OnboardingSession) return managerRepo;
        throw new Error(
          `Unexpected repository target: ${(target as { name?: string }).name ?? '<anonymous>'}`,
        );
      }),
    } as unknown as jest.Mocked<EntityManager>;

    dataSource = {
      transaction: jest.fn((cb: (mgr: EntityManager) => Promise<unknown>) =>
        cb(mockManager),
      ),
    } as unknown as jest.Mocked<DataSource>;

    // The injected (pooled) repository is only the connection handle: it must
    // never see a protected-table statement.
    pooledRepo = {
      manager: { connection: dataSource },
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      createQueryBuilder: jest.fn(),
    } as unknown as jest.Mocked<Repository<OnboardingSession>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingSessionService,
        {
          provide: getRepositoryToken(OnboardingSession),
          useValue: pooledRepo,
        },
      ],
    }).compile();

    service = module.get<OnboardingSessionService>(OnboardingSessionService);
  });

  describe('tenant context binding (RLS)', () => {
    const protectedOperations: Array<[string, () => Promise<unknown>]> = [
      ['getSession', () => service.getSession(tenantId)],
      [
        'saveSession',
        () => service.saveSession({ ...existingSession }),
      ],
      [
        'updateSessionWithOptimisticLock',
        () =>
          service.updateSessionWithOptimisticLock(
            { ...existingSession },
            1,
            { lifecycleState: OnboardingLifecycleState.SALE_READY },
          ),
      ],
      [
        'ensureOnboardingStarted',
        () =>
          service.ensureOnboardingStarted({
            tenantId,
            source: OnboardingStartSource.SETUP_CENTER,
          }),
      ],
    ];

    it.each(protectedOperations)(
      '%s binds the tenant context with a parameterized set_config before any repository access',
      async (_name, operation) => {
        managerRepo.findOne.mockResolvedValue(null);
        const qb: any = {
          update: jest.fn().mockReturnThis(),
          set: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          execute: jest.fn().mockResolvedValue({ affected: 1 }),
        };
        managerRepo.createQueryBuilder.mockReturnValue(qb);

        await operation();

        expect(dataSource.transaction).toHaveBeenCalled();
        expect(mockManager.query).toHaveBeenCalledWith(
          TENANT_CONTEXT_SET_CONFIG_SQL,
          [tenantId],
        );
        expect(
          mockManager.query.mock.invocationCallOrder[0],
        ).toBeLessThan(firstRepositoryAccessOrder());
      },
    );

    it.each(protectedOperations)(
      '%s resolves the repository from the transaction manager, never from the pooled connection',
      async (_name, operation) => {
        managerRepo.findOne.mockResolvedValue(null);
        const qb: any = {
          update: jest.fn().mockReturnThis(),
          set: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          execute: jest.fn().mockResolvedValue({ affected: 1 }),
        };
        managerRepo.createQueryBuilder.mockReturnValue(qb);

        await operation();

        expect(mockManager.getRepository).toHaveBeenCalledWith(
          OnboardingSession,
        );
        expect(pooledRepo.findOne).not.toHaveBeenCalled();
        expect(pooledRepo.save).not.toHaveBeenCalled();
        expect(pooledRepo.create).not.toHaveBeenCalled();
        expect(pooledRepo.createQueryBuilder).not.toHaveBeenCalled();
      },
    );

    it('fails with TenantContextRequiredError before any SQL or repository access for a blank tenant id', async () => {
      await expect(service.getSession('   ')).rejects.toThrow(
        TenantContextRequiredError,
      );
      await expect(
        service.ensureOnboardingStarted({
          tenantId: '',
          source: OnboardingStartSource.SETUP_CENTER,
        }),
      ).rejects.toThrow(TenantContextRequiredError);
      await expect(
        service.saveSession({ ...existingSession, tenantId: '  ' }),
      ).rejects.toThrow(TenantContextRequiredError);

      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(mockManager.query).not.toHaveBeenCalled();
      expect(managerRepo.findOne).not.toHaveBeenCalled();
      expect(managerRepo.save).not.toHaveBeenCalled();
    });

    it('prevents protected access when the tenant binding fails inside the transaction', async () => {
      mockManager.query.mockRejectedValue(
        new Error('set_config unavailable'),
      );

      await expect(service.getSession(tenantId)).rejects.toThrow(
        'set_config unavailable',
      );
      await expect(
        service.ensureOnboardingStarted({
          tenantId,
          source: OnboardingStartSource.SETUP_CENTER,
        }),
      ).rejects.toThrow('set_config unavailable');

      expect(managerRepo.findOne).not.toHaveBeenCalled();
      expect(managerRepo.save).not.toHaveBeenCalled();
      expect(managerRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('prevents protected access when the transaction itself fails to open', async () => {
      dataSource.transaction.mockRejectedValue(
        new Error('connection pool exhausted'),
      );

      await expect(service.getSession(tenantId)).rejects.toThrow(
        'connection pool exhausted',
      );
      await expect(
        service.saveSession({ ...existingSession }),
      ).rejects.toThrow('connection pool exhausted');

      expect(mockManager.query).not.toHaveBeenCalled();
      expect(managerRepo.findOne).not.toHaveBeenCalled();
      expect(managerRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('session lifecycle behavior (unchanged public contract)', () => {
    it('creates new session with PROVISIONED -> SETUP_IN_PROGRESS and sets onboardingStartedAt write-once', async () => {
      managerRepo.findOne.mockResolvedValue(null);
      managerRepo.save.mockImplementation(async (entity: any) => ({
        id: 'session-uuid-1',
        ...entity,
        optimisticVersion: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const session = await service.ensureOnboardingStarted({
        tenantId,
        actorUserId: 'user-owner-1',
        source: OnboardingStartSource.SETUP_CENTER,
      });

      expect(session).toBeDefined();
      expect(session.tenantId).toBe(tenantId);
      expect(session.lifecycleState).toBe(
        OnboardingLifecycleState.SETUP_IN_PROGRESS,
      );
      expect(session.onboardingStartedAt).toBeInstanceOf(Date);
      expect(session.lastActivityAt).toBeInstanceOf(Date);
      expect(session.optimisticVersion).toBe(1);
      expect(managerRepo.save).toHaveBeenCalled();
    });

    it('preserves existing onboardingStartedAt on subsequent ensureOnboardingStarted calls (write-once invariant)', async () => {
      managerRepo.findOne.mockResolvedValue({ ...existingSession });

      const session = await service.ensureOnboardingStarted({
        tenantId,
        actorUserId: 'user-support-1',
        source: OnboardingStartSource.SUPPORT,
      });

      expect(session.onboardingStartedAt).toEqual(
        existingSession.onboardingStartedAt,
      );
      expect(
        session.lastActivityAt?.getTime(),
      ).toBeGreaterThanOrEqual(
        existingSession.onboardingStartedAt?.getTime() ?? 0,
      );
      expect(session.optimisticVersion).toBe(2);
    });

    it('preserves SALE_READY state and does not downgrade to SETUP_IN_PROGRESS when already sale-ready', async () => {
      const initialStartedAt = new Date('2026-09-01T10:00:00Z');
      managerRepo.findOne.mockResolvedValue({
        ...existingSession,
        id: 'session-uuid-3',
        lifecycleState: OnboardingLifecycleState.SALE_READY,
        saleReadyFirstAt: new Date('2026-09-02T12:00:00Z'),
      } as OnboardingSession);

      const session = await service.ensureOnboardingStarted({
        tenantId,
        actorUserId: 'user-owner-1',
        source: OnboardingStartSource.FISCAL_SETUP,
      });

      expect(session.lifecycleState).toBe(OnboardingLifecycleState.SALE_READY);
      expect(session.saleReadyFirstAt).toBeDefined();
      expect(session.onboardingStartedAt).toEqual(initialStartedAt);
      expect(session.optimisticVersion).toBe(2);
    });

    it('preserves ACTIVATED state on re-entry (monotonic invariant)', async () => {
      const activatedAt = new Date('2026-09-02T15:00:00Z');
      managerRepo.findOne.mockResolvedValue({
        ...existingSession,
        id: 'session-uuid-4',
        lifecycleState: OnboardingLifecycleState.ACTIVATED,
        saleReadyFirstAt: new Date('2026-09-01T12:00:00Z'),
        activationStartedAt: new Date('2026-09-02T14:30:00Z'),
        activatedAt,
        firstSuccessfulSaleAt: new Date('2026-09-02T14:45:00Z'),
        lastActivityAt: activatedAt,
        currentActivationAttemptId: 'attempt-1',
        optimisticVersion: 5,
        createdAt: activatedAt,
        updatedAt: activatedAt,
      } as OnboardingSession);

      const session = await service.ensureOnboardingStarted({
        tenantId,
        actorUserId: 'user-owner-1',
        source: OnboardingStartSource.SETUP_CENTER,
      });

      expect(session.lifecycleState).toBe(OnboardingLifecycleState.ACTIVATED);
      expect(session.activatedAt).toEqual(activatedAt);
      expect(session.optimisticVersion).toBe(6);
    });

    it('returns null from getSession when the bound tenant has no session', async () => {
      managerRepo.findOne.mockResolvedValue(null);

      await expect(service.getSession(tenantId)).resolves.toBeNull();
      expect(managerRepo.findOne).toHaveBeenCalledWith({
        where: { tenantId },
      });
    });
  });

  describe('updateSessionWithOptimisticLock', () => {
    it('updates session and increments optimisticVersion when version matches', async () => {
      const qb: any = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      managerRepo.createQueryBuilder.mockReturnValue(qb);
      const updatedSession: OnboardingSession = {
        ...existingSession,
        id: 'session-uuid-opt',
        lifecycleState: OnboardingLifecycleState.SALE_READY,
        optimisticVersion: 2,
      };
      managerRepo.findOne.mockResolvedValue(updatedSession);

      const result = await service.updateSessionWithOptimisticLock(
        { id: 'session-uuid-opt', tenantId, optimisticVersion: 1 } as OnboardingSession,
        1,
        { lifecycleState: OnboardingLifecycleState.SALE_READY },
      );

      expect(result.optimisticVersion).toBe(2);
      expect(result.lifecycleState).toBe(OnboardingLifecycleState.SALE_READY);
      expect(qb.where).toHaveBeenCalledWith(
        'id = :id AND optimistic_version = :expectedVersion',
        { id: 'session-uuid-opt', expectedVersion: 1 },
      );
    });

    it('throws ConflictException when version does not match (concurrent update lost update prevented)', async () => {
      const qb: any = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      };
      managerRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(
        service.updateSessionWithOptimisticLock(
          {
            id: 'session-uuid-conflict',
            tenantId,
            optimisticVersion: 1,
          } as OnboardingSession,
          1,
          { lifecycleState: OnboardingLifecycleState.SALE_READY },
        ),
      ).rejects.toThrow(ConflictException);
      expect(managerRepo.findOne).not.toHaveBeenCalled();
    });
  });
});
