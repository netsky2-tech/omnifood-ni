import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  OnboardingSession,
  OnboardingLifecycleState,
} from '../entities/onboarding-session.entity';
import {
  OnboardingSessionService,
  OnboardingStartSource,
} from './onboarding-session.service';

describe('OnboardingSessionService (Unit)', () => {
  let service: OnboardingSessionService;
  let sessionRepo: jest.Mocked<Repository<OnboardingSession>>;

  beforeEach(async () => {
    sessionRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn().mockImplementation((dto) => dto),
      createQueryBuilder: jest.fn(),
    } as unknown as jest.Mocked<Repository<OnboardingSession>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingSessionService,
        {
          provide: getRepositoryToken(OnboardingSession),
          useValue: sessionRepo,
        },
      ],
    }).compile();

    service = module.get<OnboardingSessionService>(OnboardingSessionService);
  });

  it('creates new session with PROVISIONED -> SETUP_IN_PROGRESS and sets onboardingStartedAt write-once', async () => {
    const tenantId = 'tenant-test-1';
    sessionRepo.findOne.mockResolvedValue(null);
    sessionRepo.save.mockImplementation(async (entity: any) => ({
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
    expect(session.lifecycleState).toBe(OnboardingLifecycleState.SETUP_IN_PROGRESS);
    expect(session.onboardingStartedAt).toBeInstanceOf(Date);
    expect(session.lastActivityAt).toBeInstanceOf(Date);
    expect(session.optimisticVersion).toBe(1);
    expect(sessionRepo.save).toHaveBeenCalled();
  });

  it('preserves existing onboardingStartedAt on subsequent ensureOnboardingStarted calls (write-once invariant)', async () => {
    const tenantId = 'tenant-test-2';
    const initialStartedAt = new Date('2026-09-01T10:00:00Z');
    const existingSession: OnboardingSession = {
      id: 'session-uuid-2',
      tenantId,
      lifecycleState: OnboardingLifecycleState.SETUP_IN_PROGRESS,
      onboardingStartedAt: initialStartedAt,
      saleReadyFirstAt: null,
      activationStartedAt: null,
      activatedAt: null,
      firstSuccessfulSaleAt: null,
      firstCustomerSaleAt: null,
      lastActivityAt: initialStartedAt,
      currentActivationAttemptId: null,
      measurementEligible: true,
      legacyBaseline: false,
      optimisticVersion: 1,
      createdAt: initialStartedAt,
      updatedAt: initialStartedAt,
    };

    sessionRepo.findOne.mockResolvedValue(existingSession);
    sessionRepo.save.mockImplementation(async (entity: any) => entity);

    const session = await service.ensureOnboardingStarted({
      tenantId,
      actorUserId: 'user-support-1',
      source: OnboardingStartSource.SUPPORT,
    });

    expect(session.onboardingStartedAt).toEqual(initialStartedAt);
    expect(session.lastActivityAt?.getTime()).toBeGreaterThanOrEqual(initialStartedAt.getTime());
    expect(session.optimisticVersion).toBe(2);
  });

  it('preserves SALE_READY state and does not downgrade to SETUP_IN_PROGRESS when already sale-ready', async () => {
    const tenantId = 'tenant-test-3';
    const initialStartedAt = new Date('2026-09-01T10:00:00Z');
    const existingSession: OnboardingSession = {
      id: 'session-uuid-3',
      tenantId,
      lifecycleState: OnboardingLifecycleState.SALE_READY,
      onboardingStartedAt: initialStartedAt,
      saleReadyFirstAt: new Date('2026-09-02T12:00:00Z'),
      activationStartedAt: null,
      activatedAt: null,
      firstSuccessfulSaleAt: null,
      firstCustomerSaleAt: null,
      lastActivityAt: initialStartedAt,
      currentActivationAttemptId: null,
      measurementEligible: true,
      legacyBaseline: false,
      optimisticVersion: 1,
      createdAt: initialStartedAt,
      updatedAt: initialStartedAt,
    };

    sessionRepo.findOne.mockResolvedValue(existingSession);
    sessionRepo.save.mockImplementation(async (entity: any) => entity);

    const session = await service.ensureOnboardingStarted({
      tenantId,
      actorUserId: 'user-owner-1',
      source: OnboardingStartSource.FISCAL_SETUP,
    });

    expect(session.lifecycleState).toBe(OnboardingLifecycleState.SALE_READY);
    expect(session.saleReadyFirstAt).toBeDefined();
    expect(session.optimisticVersion).toBe(2);
  });

  it('preserves ACTIVATED state on re-entry (monotonic invariant)', async () => {
    const tenantId = 'tenant-test-4';
    const activatedAt = new Date('2026-09-02T15:00:00Z');
    const existingSession: OnboardingSession = {
      id: 'session-uuid-4',
      tenantId,
      lifecycleState: OnboardingLifecycleState.ACTIVATED,
      onboardingStartedAt: new Date('2026-09-01T10:00:00Z'),
      saleReadyFirstAt: new Date('2026-09-01T12:00:00Z'),
      activationStartedAt: new Date('2026-09-02T14:30:00Z'),
      activatedAt,
      firstSuccessfulSaleAt: new Date('2026-09-02T14:45:00Z'),
      firstCustomerSaleAt: null,
      lastActivityAt: activatedAt,
      currentActivationAttemptId: 'attempt-1',
      measurementEligible: true,
      legacyBaseline: false,
      optimisticVersion: 5,
      createdAt: activatedAt,
      updatedAt: activatedAt,
    };

    sessionRepo.findOne.mockResolvedValue(existingSession);
    sessionRepo.save.mockImplementation(async (entity: any) => entity);

    const session = await service.ensureOnboardingStarted({
      tenantId,
      actorUserId: 'user-owner-1',
      source: OnboardingStartSource.SETUP_CENTER,
    });

    expect(session.lifecycleState).toBe(OnboardingLifecycleState.ACTIVATED);
    expect(session.activatedAt).toEqual(activatedAt);
    expect(session.optimisticVersion).toBe(6);
  });

  describe('updateSessionWithOptimisticLock', () => {
    it('updates session and increments optimisticVersion when version matches', async () => {
      const qb: any = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      sessionRepo.createQueryBuilder.mockReturnValue(qb);

      const updatedSession: OnboardingSession = {
        id: 'session-uuid-opt',
        tenantId: 'tenant-opt',
        lifecycleState: OnboardingLifecycleState.SALE_READY,
        onboardingStartedAt: new Date(),
        saleReadyFirstAt: new Date(),
        activationStartedAt: null,
        activatedAt: null,
        firstSuccessfulSaleAt: null,
        firstCustomerSaleAt: null,
        lastActivityAt: new Date(),
        currentActivationAttemptId: null,
        measurementEligible: true,
        legacyBaseline: false,
        optimisticVersion: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      sessionRepo.findOne.mockResolvedValue(updatedSession);

      const result = await service.updateSessionWithOptimisticLock(
        { id: 'session-uuid-opt', optimisticVersion: 1 } as OnboardingSession,
        1,
        { lifecycleState: OnboardingLifecycleState.SALE_READY },
      );

      expect(result.optimisticVersion).toBe(2);
      expect(result.lifecycleState).toBe(OnboardingLifecycleState.SALE_READY);
    });

    it('throws ConflictException when version does not match (concurrent update lost update prevented)', async () => {
      const qb: any = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      };
      sessionRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(
        service.updateSessionWithOptimisticLock(
          { id: 'session-uuid-conflict', optimisticVersion: 1 } as OnboardingSession,
          1,
          { lifecycleState: OnboardingLifecycleState.SALE_READY },
        ),
      ).rejects.toThrow();
    });
  });
});
