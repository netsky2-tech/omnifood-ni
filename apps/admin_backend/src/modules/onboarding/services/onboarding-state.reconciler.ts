import { Injectable, Logger } from '@nestjs/common';
import { OnboardingSessionService } from './onboarding-session.service';
import {
  OnboardingReadinessEvaluator,
  OnboardingReadinessSnapshot,
} from './onboarding-readiness.evaluator';
import {
  OnboardingSession,
  OnboardingLifecycleState,
} from '../entities/onboarding-session.entity';

@Injectable()
export class OnboardingStateReconciler {
  private readonly logger = new Logger(OnboardingStateReconciler.name);

  constructor(
    private readonly sessionService: OnboardingSessionService,
    private readonly readinessEvaluator: OnboardingReadinessEvaluator,
  ) {}

  async reconcile(
    tenantId: string,
    providedSnapshot?: OnboardingReadinessSnapshot,
  ): Promise<OnboardingSession> {
    const session = await this.sessionService.getSession(tenantId);
    if (!session) {
      throw new Error(`Cannot reconcile non-existent onboarding session for tenant: ${tenantId}`);
    }

    const snapshot =
      providedSnapshot ?? (await this.readinessEvaluator.evaluate(tenantId));

    // ACTIVATED is a monotonic milestone: operational health does not revert session lifecycle
    if (session.lifecycleState === OnboardingLifecycleState.ACTIVATED) {
      return session;
    }

    let changed = false;
    const now = new Date();

    if (snapshot.saleReady) {
      if (!session.saleReadyFirstAt) {
        session.saleReadyFirstAt = now;
        changed = true;
      }
      if (
        session.lifecycleState === OnboardingLifecycleState.PROVISIONED ||
        session.lifecycleState === OnboardingLifecycleState.SETUP_IN_PROGRESS
      ) {
        session.lifecycleState = OnboardingLifecycleState.SALE_READY;
        changed = true;
      }
    } else {
      // If no longer sale-ready before activation, revert to SETUP_IN_PROGRESS without erasing saleReadyFirstAt
      if (session.lifecycleState === OnboardingLifecycleState.SALE_READY) {
        session.lifecycleState = OnboardingLifecycleState.SETUP_IN_PROGRESS;
        changed = true;
      }
    }

    if (changed) {
      session.lastActivityAt = now;
      session.optimisticVersion = (session.optimisticVersion ?? 1) + 1;
      return this.sessionService.saveSession(session);
    }

    return session;
  }
}
