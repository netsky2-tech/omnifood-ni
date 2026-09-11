import { OnboardingSessionController } from './onboarding-session.controller';
import {
  OnboardingSessionService,
  OnboardingStartSource,
} from '../services/onboarding-session.service';
import { OnboardingReadinessEvaluator } from '../services/onboarding-readiness.evaluator';
import { OnboardingStateReconciler } from '../services/onboarding-state.reconciler';
import {
  OnboardingSession,
  OnboardingLifecycleState,
} from '../entities/onboarding-session.entity';
import { UnauthorizedException } from '@nestjs/common';
import { LegacyImportIntegrityReportService } from '../services/legacy-import-integrity-report.service';
import { LegacyMigrationDecision } from '../entities/legacy-migration-receipt.entity';

describe('OnboardingSessionController (Unit)', () => {
  let controller: OnboardingSessionController;
  let sessionService: jest.Mocked<OnboardingSessionService>;
  let readinessEvaluator: jest.Mocked<OnboardingReadinessEvaluator>;
  let stateReconciler: jest.Mocked<OnboardingStateReconciler>;

  const mockSession: OnboardingSession = {
    id: 'session-uuid',
    tenantId: 'tenant-123',
    lifecycleState: OnboardingLifecycleState.SETUP_IN_PROGRESS,
    onboardingStartedAt: new Date(),
    saleReadyFirstAt: null,
    activationStartedAt: null,
    activatedAt: null,
    firstSuccessfulSaleAt: null,
    firstCustomerSaleAt: null,
    lastActivityAt: new Date(),
    currentActivationAttemptId: null,
    measurementEligible: true,
    legacyBaseline: false,
    optimisticVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    sessionService = {
      getSession: jest.fn(),
      ensureOnboardingStarted: jest.fn(),
      saveSession: jest.fn(),
    } as unknown as jest.Mocked<OnboardingSessionService>;

    readinessEvaluator = {
      evaluate: jest.fn(),
    } as unknown as jest.Mocked<OnboardingReadinessEvaluator>;

    stateReconciler = {
      reconcile: jest.fn(),
    } as unknown as jest.Mocked<OnboardingStateReconciler>;

    const integrityReportService = {
      reconcileLegacyBaselineSession: jest.fn(),
    } as unknown as jest.Mocked<LegacyImportIntegrityReportService>;

    controller = new OnboardingSessionController(
      sessionService,
      readinessEvaluator,
      stateReconciler,
      integrityReportService,
    );
  });

  describe('startSession', () => {
    it('throws UnauthorizedException when tenantId is missing', async () => {
      const req: any = { user: {} };
      await expect(controller.startSession(req, {})).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('starts session and returns session + readiness', async () => {
      sessionService.ensureOnboardingStarted.mockResolvedValue(mockSession);
      readinessEvaluator.evaluate.mockResolvedValue({
        saleReady: false,
        identity: {
          tenantExists: true,
          initialOwnerExists: true,
          ownerCanAuthenticate: true,
          tenantContextValid: true,
        },
        fiscal: { minimumConfigurationValid: false },
        catalog: { sellableProductCount: 0, hasSellableProduct: false },
        inventoryReady: false,
        costingReady: false,
        operationsReady: false,
        blockers: ['FISCAL_CONFIGURATION_INCOMPLETE'],
        warnings: [],
        evaluatedAt: new Date(),
      });
      stateReconciler.reconcile.mockResolvedValue(mockSession);

      const req: any = { user: { tenantId: 'tenant-123', userId: 'owner-1' } };
      const res = await controller.startSession(
        req,
        { source: OnboardingStartSource.SETUP_CENTER },
        'tenant-123',
      );

      expect(res).toBeDefined();
      expect(res.session).toEqual(mockSession);
      expect(res.readiness.saleReady).toBe(false);
      expect(sessionService.ensureOnboardingStarted).toHaveBeenCalledWith({
        tenantId: 'tenant-123',
        actorUserId: 'owner-1',
        source: OnboardingStartSource.SETUP_CENTER,
      });
    });
  });

  describe('getSession', () => {
    it('dynamically reconciles and returns session + readiness', async () => {
      sessionService.getSession.mockResolvedValue(mockSession);
      readinessEvaluator.evaluate.mockResolvedValue({
        saleReady: true,
        identity: {
          tenantExists: true,
          initialOwnerExists: true,
          ownerCanAuthenticate: true,
          tenantContextValid: true,
        },
        fiscal: { minimumConfigurationValid: true },
        catalog: { sellableProductCount: 3, hasSellableProduct: true },
        inventoryReady: false,
        costingReady: false,
        operationsReady: false,
        blockers: [],
        warnings: [],
        evaluatedAt: new Date(),
      });
      const saleReadySession = {
        ...mockSession,
        lifecycleState: OnboardingLifecycleState.SALE_READY,
        saleReadyFirstAt: new Date(),
      };
      stateReconciler.reconcile.mockResolvedValue(saleReadySession);

      const req: any = { user: { tenantId: 'tenant-123', userId: 'owner-1' } };
      const res = await controller.getSession(req, 'tenant-123');

      expect(res.session.lifecycleState).toBe(
        OnboardingLifecycleState.SALE_READY,
      );
      expect(res.readiness.saleReady).toBe(true);
    });
  });

  describe('getReadiness', () => {
    it('returns direct live snapshot without mutating session', async () => {
      readinessEvaluator.evaluate.mockResolvedValue({
        saleReady: true,
        identity: {
          tenantExists: true,
          initialOwnerExists: true,
          ownerCanAuthenticate: true,
          tenantContextValid: true,
        },
        fiscal: { minimumConfigurationValid: true },
        catalog: { sellableProductCount: 1, hasSellableProduct: true },
        inventoryReady: false,
        costingReady: false,
        operationsReady: false,
        blockers: [],
        warnings: [],
        evaluatedAt: new Date(),
      });

      const req: any = { user: { tenantId: 'tenant-123' } };
      const snapshot = await controller.getReadiness(req, 'tenant-123');

      expect(snapshot.saleReady).toBe(true);
      expect(readinessEvaluator.evaluate).toHaveBeenCalledWith('tenant-123');
      expect(stateReconciler.reconcile).not.toHaveBeenCalled();
    });
  });

  describe('reconcileLegacyBaseline', () => {
    it('formally reconciles legacy baseline tenant via integrityReportService (ONB1.10A)', async () => {
      const integrityService = (controller as any).integrityReportService;
      integrityService.reconcileLegacyBaselineSession.mockResolvedValueOnce({
        id: 'receipt-legacy-1',
        receipt_type: 'LEGACY_BASELINE_RECONCILIATION',
        decision: LegacyMigrationDecision.LEGACY_BASELINE_CLOSED,
      });

      const req: any = { user: { tenantId: 'tenant-123', sub: 'user-admin-1' } };
      const receipt = await controller.reconcileLegacyBaseline(req, 'tenant-123');

      expect(receipt.decision).toBe(LegacyMigrationDecision.LEGACY_BASELINE_CLOSED);
      expect(integrityService.reconcileLegacyBaselineSession).toHaveBeenCalledWith(
        'tenant-123',
        'user-admin-1',
      );
    });
  });
});
