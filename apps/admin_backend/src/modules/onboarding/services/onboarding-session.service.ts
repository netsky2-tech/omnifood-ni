import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';
import {
  OnboardingSession,
  OnboardingLifecycleState,
} from '../entities/onboarding-session.entity';

export enum OnboardingStartSource {
  SETUP_CENTER = 'SETUP_CENTER',
  FISCAL_SETUP = 'FISCAL_SETUP',
  TEMPLATE = 'TEMPLATE',
  PRODUCT_IMPORT = 'PRODUCT_IMPORT',
  SUPPORT = 'SUPPORT',
}

export interface EnsureOnboardingStartedDto {
  tenantId: string;
  actorUserId?: string;
  source: OnboardingStartSource;
}

/**
 * Tenant-bound access to `onboarding_sessions` (issue #493 T2.S2a).
 *
 * The table is protected by ENABLE+FORCED row-level security with
 * `current_setting('app.tenant_id', true)` policies, so every read/write must
 * run inside a transaction whose context is bound with the transaction-local
 * `set_config` before the first statement. This service therefore never uses
 * the pooled default connection for protected access: each operation opens a
 * `runInTenantTransaction`, and every repository is resolved from that exact
 * transaction manager. The injected repository is kept only as the DI-stable
 * handle to the request DataSource (see `dataSource`).
 */
@Injectable()
export class OnboardingSessionService {
  constructor(
    @InjectRepository(OnboardingSession)
    private readonly sessionRepository: Repository<OnboardingSession>,
  ) {}

  /**
   * The DataSource behind the injected repository. Kept as a handle only:
   * using the repository itself would issue statements on the unbound pooled
   * connection, which FORCE RLS fails closed.
   */
  private get dataSource(): DataSource {
    return this.sessionRepository.manager.connection;
  }

  async getSession(tenantId: string): Promise<OnboardingSession | null> {
    return runInTenantTransaction(this.dataSource, tenantId, (manager) =>
      manager
        .getRepository(OnboardingSession)
        .findOne({ where: { tenantId } }),
    );
  }

  async saveSession(session: OnboardingSession): Promise<OnboardingSession> {
    return runInTenantTransaction(
      this.dataSource,
      session.tenantId,
      (manager) => manager.getRepository(OnboardingSession).save(session),
    );
  }

  async updateSessionWithOptimisticLock(
    session: OnboardingSession,
    expectedVersion: number,
    updates: Partial<OnboardingSession>,
  ): Promise<OnboardingSession> {
    return runInTenantTransaction(
      this.dataSource,
      session.tenantId,
      async (manager) => {
        const repo = manager.getRepository(OnboardingSession);

        const result = await repo
          .createQueryBuilder()
          .update(OnboardingSession)
          .set({
            ...updates,
            optimisticVersion: expectedVersion + 1,
            lastActivityAt: new Date(),
          })
          .where('id = :id AND optimistic_version = :expectedVersion', {
            id: session.id,
            expectedVersion,
          })
          .execute();

        if (!result.affected || result.affected === 0) {
          throw new ConflictException(
            `VERSION_CONFLICT: Onboarding session ${session.id} was updated concurrently (expected version: ${expectedVersion})`,
          );
        }

        const updated = await repo.findOne({
          where: { id: session.id },
        });
        return updated;
      },
    );
  }

  async ensureOnboardingStarted(
    dto: EnsureOnboardingStartedDto,
  ): Promise<OnboardingSession> {
    return runInTenantTransaction(
      this.dataSource,
      dto.tenantId,
      async (manager) => {
        const repo = manager.getRepository(OnboardingSession);
        const now = new Date();
        const existing = await repo.findOne({
          where: { tenantId: dto.tenantId },
        });

        if (!existing) {
          const newSession = repo.create({
            tenantId: dto.tenantId,
            lifecycleState: OnboardingLifecycleState.SETUP_IN_PROGRESS,
            onboardingStartedAt: now,
            lastActivityAt: now,
            measurementEligible: true,
            legacyBaseline: false,
            optimisticVersion: 1,
          });

          return repo.save(newSession);
        }

        // Existing session: enforce write-once for onboardingStartedAt
        if (!existing.onboardingStartedAt) {
          existing.onboardingStartedAt = now;
          if (existing.lifecycleState === OnboardingLifecycleState.PROVISIONED) {
            existing.lifecycleState = OnboardingLifecycleState.SETUP_IN_PROGRESS;
          }
        }

        existing.lastActivityAt = now;
        existing.optimisticVersion = (existing.optimisticVersion ?? 1) + 1;

        return repo.save(existing);
      },
    );
  }
}
