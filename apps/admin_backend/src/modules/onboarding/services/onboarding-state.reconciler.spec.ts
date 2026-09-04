import { Test, TestingModule } from '@nestjs/testing';
import { OnboardingStateReconciler } from './onboarding-state.reconciler';
import { OnboardingSessionService } from './onboarding-session.service';
import { OnboardingReadinessEvaluator } from './onboarding-readiness.evaluator';
import {
  OnboardingSession,
  OnboardingLifecycleState,
} from '../entities/onboarding-session.entity';

describe('OnboardingStateReconciler (Unit)', () => {
  let reconciler: OnboardingStateReconciler;
  let sessionService: jest.Mocked<OnboardingSessionService>;
  let evaluator: jest.Mocked<OnboardingReadinessEvaluator>;

  beforeEach(async () => {
    sessionService = {
      getSession: jest.fn(),
      saveSession: jest.fn(),
      ensureOnboardingStarted: jest.fn(),
    } as unknown as jest.Mocked<OnboardingSessionService>;

    evaluator = {
      evaluate: jest.fn(),
    } as unknown as jest.Mocked<OnboardingReadinessEvaluator>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingStateReconciler,
        { provide: OnboardingSessionService, useValue: sessionService },
        { provide: OnboardingReadinessEvaluator, useValue: evaluator },
      ],
    }).compile();

    reconciler = module.get<OnboardingStateReconciler>(OnboardingStateReconciler);
  });

  it('transitions SETUP_IN_PROGRESS -> SALE_READY and sets saleReadyFirstAt write-once when ready', async () => {
    const session: OnboardingSession = {
      id: 'session-1',
      tenantId: 'tenant-1',
      lifecycleState: OnboardingLifecycleState.SETUP_IN_PROGRESS,
      onboardingStartedAt: new Date('2026-09-01T10:00:00Z'),
      saleReadyFirstAt: null,
      activationStartedAt: null,
      activatedAt: null,
      firstSuccessfulSaleAt: null,
      firstCustomerSaleAt: null,
      lastActivityAt: null,
      currentActivationAttemptId: null,
      measurementEligible: true,
      legacyBaseline: false,
      optimisticVersion: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    sessionService.getSession.mockResolvedValue(session);
    evaluator.evaluate.mockResolvedValue({
      saleReady: true,
      identity: { tenantExists: true, initialOwnerExists: true, ownerCanAuthenticate: true, tenantContextValid: true },
      fiscal: { minimumConfigurationValid: true },
      catalog: { sellableProductCount: 1, hasSellableProduct: true },
      inventoryReady: false,
      costingReady: false,
      operationsReady: false,
      blockers: [],
      warnings: [],
      evaluatedAt: new Date(),
    });
    sessionService.saveSession.mockImplementation(async (s) => s);

    const reconciled = await reconciler.reconcile('tenant-1');

    expect(reconciled.lifecycleState).toBe(OnboardingLifecycleState.SALE_READY);
    expect(reconciled.saleReadyFirstAt).toBeInstanceOf(Date);
    expect(sessionService.saveSession).toHaveBeenCalled();
  });

  it('reverts SALE_READY -> SETUP_IN_PROGRESS if domains stop fulfilling minimum, but preserves saleReadyFirstAt', async () => {
    const originalSaleReadyFirstAt = new Date('2026-09-01T12:00:00Z');
    const session: OnboardingSession = {
      id: 'session-2',
      tenantId: 'tenant-2',
      lifecycleState: OnboardingLifecycleState.SALE_READY,
      onboardingStartedAt: new Date('2026-09-01T10:00:00Z'),
      saleReadyFirstAt: originalSaleReadyFirstAt,
      activationStartedAt: null,
      activatedAt: null,
      firstSuccessfulSaleAt: null,
      firstCustomerSaleAt: null,
      lastActivityAt: null,
      currentActivationAttemptId: null,
      measurementEligible: true,
      legacyBaseline: false,
      optimisticVersion: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    sessionService.getSession.mockResolvedValue(session);
    // Evaluator reports catalog now has 0 sellable products
    evaluator.evaluate.mockResolvedValue({
      saleReady: false,
      identity: { tenantExists: true, initialOwnerExists: true, ownerCanAuthenticate: true, tenantContextValid: true },
      fiscal: { minimumConfigurationValid: true },
      catalog: { sellableProductCount: 0, hasSellableProduct: false },
      inventoryReady: false,
      costingReady: false,
      operationsReady: false,
      blockers: ['CATALOG_NO_SELLABLE_PRODUCTS'],
      warnings: [],
      evaluatedAt: new Date(),
    });
    sessionService.saveSession.mockImplementation(async (s) => s);

    const reconciled = await reconciler.reconcile('tenant-2');

    expect(reconciled.lifecycleState).toBe(OnboardingLifecycleState.SETUP_IN_PROGRESS);
    expect(reconciled.saleReadyFirstAt).toEqual(originalSaleReadyFirstAt); // inmutable!
  });

  it('never downgrades an ACTIVATED session (monotonic invariant)', async () => {
    const session: OnboardingSession = {
      id: 'session-3',
      tenantId: 'tenant-3',
      lifecycleState: OnboardingLifecycleState.ACTIVATED,
      onboardingStartedAt: new Date('2026-09-01T10:00:00Z'),
      saleReadyFirstAt: new Date('2026-09-01T12:00:00Z'),
      activationStartedAt: new Date('2026-09-02T08:00:00Z'),
      activatedAt: new Date('2026-09-02T08:30:00Z'),
      firstSuccessfulSaleAt: new Date('2026-09-02T08:35:00Z'),
      firstCustomerSaleAt: null,
      lastActivityAt: null,
      currentActivationAttemptId: null,
      measurementEligible: true,
      legacyBaseline: false,
      optimisticVersion: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    sessionService.getSession.mockResolvedValue(session);
    evaluator.evaluate.mockResolvedValue({
      saleReady: false,
      identity: { tenantExists: true, initialOwnerExists: true, ownerCanAuthenticate: true, tenantContextValid: true },
      fiscal: { minimumConfigurationValid: false },
      catalog: { sellableProductCount: 0, hasSellableProduct: false },
      inventoryReady: false,
      costingReady: false,
      operationsReady: false,
      blockers: ['FISCAL_CONFIGURATION_INCOMPLETE'],
      warnings: [],
      evaluatedAt: new Date(),
    });

    const reconciled = await reconciler.reconcile('tenant-3');

    expect(reconciled.lifecycleState).toBe(OnboardingLifecycleState.ACTIVATED);
  });

  it('preserves SALE_READY cloud state even when local activation checks or attempts fail (ONB1.6F)', async () => {
    const session: OnboardingSession = {
      id: 'session-sale-ready-1',
      tenantId: 'tenant-sale-ready',
      lifecycleState: OnboardingLifecycleState.SALE_READY,
      onboardingStartedAt: new Date('2026-09-01T10:00:00Z'),
      saleReadyFirstAt: new Date('2026-09-01T12:00:00Z'),
      activationStartedAt: null,
      activatedAt: null,
      firstSuccessfulSaleAt: null,
      firstCustomerSaleAt: null,
      lastActivityAt: null,
      currentActivationAttemptId: null,
      measurementEligible: true,
      legacyBaseline: false,
      optimisticVersion: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    sessionService.getSession.mockResolvedValue(session);
    // Cloud domains still fulfill minimum requirements
    evaluator.evaluate.mockResolvedValue({
      saleReady: true,
      identity: { tenantExists: true, initialOwnerExists: true, ownerCanAuthenticate: true, tenantContextValid: true },
      fiscal: { minimumConfigurationValid: true },
      catalog: { sellableProductCount: 1, hasSellableProduct: true },
      inventoryReady: false,
      costingReady: false,
      operationsReady: false,
      blockers: [],
      warnings: [],
      evaluatedAt: new Date(),
    });

    const reconciled = await reconciler.reconcile('tenant-sale-ready');

    expect(reconciled.lifecycleState).toBe(OnboardingLifecycleState.SALE_READY);
    expect(reconciled.saleReadyFirstAt).toEqual(new Date('2026-09-01T12:00:00Z'));
  });
});
