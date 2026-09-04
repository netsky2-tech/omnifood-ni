import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

@Injectable()
export class OnboardingSessionService {
  constructor(
    @InjectRepository(OnboardingSession)
    private readonly sessionRepository: Repository<OnboardingSession>,
  ) {}

  async getSession(tenantId: string): Promise<OnboardingSession | null> {
    return this.sessionRepository.findOne({ where: { tenantId } });
  }

  async saveSession(session: OnboardingSession): Promise<OnboardingSession> {
    return this.sessionRepository.save(session);
  }

  async updateSessionWithOptimisticLock(
    session: OnboardingSession,
    expectedVersion: number,
    updates: Partial<OnboardingSession>,
  ): Promise<OnboardingSession> {
    const result = await this.sessionRepository
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

    const updated = await this.sessionRepository.findOne({
      where: { id: session.id },
    });
    return updated;
  }

  async ensureOnboardingStarted(
    dto: EnsureOnboardingStartedDto,
  ): Promise<OnboardingSession> {
    const now = new Date();
    const existing = await this.sessionRepository.findOne({
      where: { tenantId: dto.tenantId },
    });

    if (!existing) {
      const newSession = this.sessionRepository.create({
        tenantId: dto.tenantId,
        lifecycleState: OnboardingLifecycleState.SETUP_IN_PROGRESS,
        onboardingStartedAt: now,
        lastActivityAt: now,
        measurementEligible: true,
        legacyBaseline: false,
        optimisticVersion: 1,
      });

      return this.sessionRepository.save(newSession);
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

    return this.sessionRepository.save(existing);
  }
}
