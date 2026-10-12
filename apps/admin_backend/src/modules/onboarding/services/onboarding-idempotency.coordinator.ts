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
import {
  bindTenantContext,
  resolveTenantContextId,
  runInTenantTransaction,
} from '../../../core/database/tenant-transaction';

export interface AcquireLeaseParams {
  tenantId: string;
  idempotencyKey: string;
  commandType: string;
  payload: unknown;
  leaseTtlMs?: number;
  leaseOwner?: string;
}

export type IdempotencyExecutionLease =
  | { state: 'ACQUIRED'; record: OnboardingIdempotencyRecord }
  | {
      state: 'ALREADY_COMPLETED';
      result: unknown;
      record: OnboardingIdempotencyRecord;
    };

export type IdempotencyResult = Record<PropertyKey, unknown> | null;

export function isIdempotencyResult(val: unknown): val is IdempotencyResult {
  return val === null || (typeof val === 'object' && !Array.isArray(val));
}

function parseResultRef(raw: unknown): IdempotencyResult | undefined {
  if (isIdempotencyResult(raw)) {
    return raw;
  }
  return undefined;
}

/**
 * Raised when a completion target is not visible through the executor that
 * would perform the mutation. The message never discloses whether the record
 * exists in another tenant (fail closed, non-disclosing).
 */
const COMPLETION_TARGET_NOT_ACCESSIBLE =
  'IDEMPOTENCY_RECORD_NOT_ACCESSIBLE: the completion target is not visible in the bound tenant context';

@Injectable()
export class OnboardingIdempotencyCoordinator {
  private readonly defaultTtlMs = 30000;

  constructor(
    @InjectRepository(OnboardingIdempotencyRecord)
    private readonly repo: Repository<OnboardingIdempotencyRecord>,
  ) {}

  /**
   * The DataSource behind the injected repository. Kept as a handle only:
   * using the repository itself would issue statements on the unbound pooled
   * connection, which the FORCE RLS policies fail closed.
   */
  private get dataSource() {
    return this.repo.manager.connection;
  }

  computePayloadHash(payload: unknown): string {
    const target =
      typeof payload === 'object' && payload !== null ? payload : {};
    const canonical = JSON.stringify(payload, Object.keys(target).sort());
    return createHash('sha256')
      .update(canonical ?? '')
      .digest('hex');
  }

  /**
   * Tenant-bound lease acquisition (issue #493 T2.S2b).
   *
   * `onboarding_idempotency_records` is protected by ENABLE+FORCED RLS keyed
   * on `app.tenant_id`, so the lookup, insert, and lease-reclaim updates all
   * run inside one canonical tenant transaction: `runInTenantTransaction`
   * binds `app.tenant_id` (transaction-local, parameterized) BEFORE the first
   * repository access, and the repository is resolved from that exact
   * transaction manager. A blank tenant id fails fast before any SQL.
   */
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

    return runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        const repo = manager.getRepository(OnboardingIdempotencyRecord);

        const payloadHash = this.computePayloadHash(payload);
        const now = new Date();
        const expiresAt = new Date(now.getTime() + leaseTtlMs);

        const existing = await repo.findOne({
          where: { tenantId, idempotencyKey },
        });

        if (!existing) {
          const record = repo.create({
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

          const saved = await repo.save(record);
          return {
            state: 'ACQUIRED',
            record: saved,
          };
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
            result: parseResultRef(existing.resultRef),
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

          const saved = await repo.save(existing);
          return {
            state: 'ACQUIRED',
            record: saved,
          };
        }

        // FAILED_RETRYABLE
        existing.status = OnboardingIdempotencyStatus.IN_PROGRESS;
        existing.leaseOwner = leaseOwner;
        existing.leaseAcquiredAt = now;
        existing.leaseExpiresAt = expiresAt;
        existing.attemptCount = (existing.attemptCount ?? 1) + 1;

        const saved = await repo.save(existing);
        return {
          state: 'ACQUIRED',
          record: saved,
        };
      },
    );
  }

  /**
   * Tenant-bound success completion (issue #493 T2.S2b).
   *
   * - `manager` supplied: the caller owns the transaction; the coordinator
   *   binds `app.tenant_id` on that exact manager (no nested transaction) and
   *   mutates through the manager's repository.
   * - `manager` absent: the coordinator opens one canonical tenant
   *   transaction bound to `tenantId` (preferred) or to the tenant discovered
   *   from the record when the caller's connection can see it; otherwise it
   *   fails closed.
   *
   * The record must be visible through the bound executor before the
   * mutation: a foreign tenant's record stays RLS-hidden, so a forged
   * completion is rejected without mutating anything.
   */
  async completeSuccess(
    recordId: string,
    result: unknown,
    manager?: EntityManager,
    tenantId?: string,
  ): Promise<void> {
    const safeResult = parseResultRef(result) ?? null;
    await this.completeInBoundContext(recordId, manager, tenantId, (repo) =>
      repo.save({
        id: recordId,
        status: OnboardingIdempotencyStatus.SUCCEEDED,
        resultRef: safeResult,
        completedAt: new Date(),
      }),
    );
  }

  /**
   * Tenant-bound failure completion (issue #493 T2.S2b). Same binding
   * contract as {@link completeSuccess}: bind before access, mutate through
   * the same manager, fail closed when the target is not visible.
   */
  async completeFailure(
    recordId: string,
    error: { message: string; isRetryable: boolean },
    manager?: EntityManager,
    tenantId?: string,
  ): Promise<void> {
    await this.completeInBoundContext(recordId, manager, tenantId, (repo) =>
      repo.update(recordId, {
        status: error.isRetryable
          ? OnboardingIdempotencyStatus.FAILED_RETRYABLE
          : OnboardingIdempotencyStatus.FAILED_FINAL,
        lastErrorCode: error.message,
        completedAt: new Date(),
      }),
    );
  }

  /**
   * Shared completion core: guarantees `app.tenant_id` is bound on the exact
   * executor that mutates the protected table, and that the target record is
   * visible through that binding before the mutation runs.
   */
  private async completeInBoundContext(
    recordId: string,
    manager: EntityManager | undefined,
    tenantId: string | undefined,
    mutate: (repo: Repository<OnboardingIdempotencyRecord>) => Promise<unknown>,
  ): Promise<void> {
    // An explicitly provided tenant id must be usable: blank fails fast
    // before any SQL is issued.
    const explicitTenantId =
      tenantId === undefined ? undefined : resolveTenantContextId(tenantId);

    if (manager) {
      // Caller-owned transaction: never open an independent one.
      const repo = manager.getRepository(OnboardingIdempotencyRecord);
      const boundTenantId =
        explicitTenantId ?? (await this.discoverTenantId(repo, recordId));
      await bindTenantContext(manager, boundTenantId);
      await this.assertRecordVisible(repo, recordId);
      await mutate(repo);
      return;
    }

    const boundTenantId =
      explicitTenantId ?? (await this.discoverTenantId(this.repo, recordId));
    await runInTenantTransaction(
      this.dataSource,
      boundTenantId,
      async (txManager) => {
        const repo = txManager.getRepository(OnboardingIdempotencyRecord);
        await this.assertRecordVisible(repo, recordId);
        await mutate(repo);
      },
    );
  }

  /**
   * Resolves the tenant that owns the completion target by reading it through
   * the given repository. Under RLS an unbound (or differently bound)
   * executor cannot see foreign records, so a hidden target fails closed
   * instead of leaking the tenant or mutating blind.
   */
  private async discoverTenantId(
    repo: Repository<OnboardingIdempotencyRecord>,
    recordId: string,
  ): Promise<string> {
    let probe: OnboardingIdempotencyRecord | null;
    try {
      probe = await repo.findOne({ where: { id: recordId } });
    } catch {
      // Fail closed on ANY discovery failure, not only on zero rows: an
      // unbound pooled read can ERROR (instead of returning zero rows) once
      // the connection has ever served a transaction-local tenant binding —
      // PostgreSQL keeps the custom parameter defined (as '') after that
      // transaction ends, so the RLS predicate's `'' ::uuid` cast fails.
      // Discovery exists only to learn the tenant; without it the
      // coordinator must never mutate blind.
      throw new ConflictException(COMPLETION_TARGET_NOT_ACCESSIBLE);
    }
    if (!probe) {
      throw new ConflictException(COMPLETION_TARGET_NOT_ACCESSIBLE);
    }
    return probe.tenantId;
  }

  /**
   * Re-checks visibility under the final binding: after the tenant context is
   * bound, the target must be readable, or the mutation would be a blind
   * write (silently zero-affected for foreign rows).
   */
  private async assertRecordVisible(
    repo: Repository<OnboardingIdempotencyRecord>,
    recordId: string,
  ): Promise<void> {
    const target = await repo.findOne({ where: { id: recordId } });
    if (!target) {
      throw new ConflictException(COMPLETION_TARGET_NOT_ACCESSIBLE);
    }
  }
}
