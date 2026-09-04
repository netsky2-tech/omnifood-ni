import {
  Injectable,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { createHash } from 'crypto';
import {
  OnboardingIdempotencyRecord,
  OnboardingIdempotencyStatus,
} from '../entities/onboarding-idempotency.entity';

export interface AcquireLeaseParams {
  tenantId: string;
  idempotencyKey: string;
  commandType: string;
  payload: any;
  leaseTtlMs?: number;
  leaseOwner?: string;
}

export type IdempotencyExecutionLease =
  | { state: 'ACQUIRED'; record: OnboardingIdempotencyRecord }
  | {
      state: 'ALREADY_COMPLETED';
      result: any;
      record: OnboardingIdempotencyRecord;
    };

@Injectable()
export class OnboardingIdempotencyCoordinator {
  private readonly defaultTtlMs = 30000;

  constructor(
    @InjectRepository(OnboardingIdempotencyRecord)
    private readonly repo: Repository<OnboardingIdempotencyRecord>,
  ) {}

  computePayloadHash(payload: any): string {
    const canonical = JSON.stringify(
      payload,
      Object.keys(payload ?? {}).sort(),
    );
    return createHash('sha256')
      .update(canonical ?? '')
      .digest('hex');
  }

  async acquireLease(
    params: AcquireLeaseParams,
  ): Promise<IdempotencyExecutionLease> {
    const {
      tenantId,
      idempotencyKey,
      commandType,
      payload,
      leaseTtlMs = this.defaultTtlMs,
      leaseOwner = 'anonymous-worker',
    } = params;

    const payloadHash = this.computePayloadHash(payload);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + leaseTtlMs);

    const existing = await this.repo.findOne({
      where: { tenantId, idempotencyKey },
    });

    if (!existing) {
      const record = this.repo.create({
        tenantId,
        idempotencyKey,
        commandType,
        payloadHash,
        status: OnboardingIdempotencyStatus.IN_PROGRESS,
        leaseOwner,
        leaseAcquiredAt: now,
        leaseExpiresAt: expiresAt,
        attemptCount: 1,
      });

      const saved = await this.repo.save(record);
      return { state: 'ACQUIRED', record: saved };
    }

    // Integrity check
    if (existing.payloadHash !== payloadHash) {
      throw new ConflictException(
        'INTEGRITY_CONFLICT: same idempotency key used with different payload',
      );
    }

    if (existing.status === OnboardingIdempotencyStatus.SUCCEEDED) {
      return {
        state: 'ALREADY_COMPLETED',
        result: existing.resultRef,
        record: existing,
      };
    }

    if (existing.status === OnboardingIdempotencyStatus.FAILED_FINAL) {
      throw new BadRequestException(
        'COMMAND_FAILED_FINAL: command previously failed permanently and cannot be retried with the same idempotency key',
      );
    }

    if (existing.status === OnboardingIdempotencyStatus.IN_PROGRESS) {
      if (existing.leaseExpiresAt && existing.leaseExpiresAt > now) {
        throw new ConflictException(
          'COMMAND_IN_PROGRESS: command is currently locked and executing by another worker',
        );
      }

      // Expired lease: reclaim
      existing.leaseOwner = leaseOwner;
      existing.leaseAcquiredAt = now;
      existing.leaseExpiresAt = expiresAt;
      existing.attemptCount = (existing.attemptCount ?? 1) + 1;

      const saved = await this.repo.save(existing);
      return { state: 'ACQUIRED', record: saved };
    }

    // FAILED_RETRYABLE
    existing.status = OnboardingIdempotencyStatus.IN_PROGRESS;
    existing.leaseOwner = leaseOwner;
    existing.leaseAcquiredAt = now;
    existing.leaseExpiresAt = expiresAt;
    existing.attemptCount = (existing.attemptCount ?? 1) + 1;

    const saved = await this.repo.save(existing);
    return { state: 'ACQUIRED', record: saved };
  }

  async completeSuccess(
    recordId: string,
    result: any,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager
      ? manager.getRepository(OnboardingIdempotencyRecord)
      : this.repo;
    await repository.update(recordId, {
      status: OnboardingIdempotencyStatus.SUCCEEDED,
      resultRef: result,
      completedAt: new Date(),
    });
  }

  async completeFailure(
    recordId: string,
    error: { message: string; isRetryable: boolean },
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager
      ? manager.getRepository(OnboardingIdempotencyRecord)
      : this.repo;
    await repository.update(recordId, {
      status: error.isRetryable
        ? OnboardingIdempotencyStatus.FAILED_RETRYABLE
        : OnboardingIdempotencyStatus.FAILED_FINAL,
      lastErrorCode: error.message,
      completedAt: new Date(),
    });
  }
}
