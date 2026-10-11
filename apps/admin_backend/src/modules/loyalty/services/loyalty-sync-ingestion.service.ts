import { Injectable, Logger } from '@nestjs/common';
import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LoyaltyLedgerService } from './loyalty-ledger.service';
import type { AppendLoyaltyTxDto } from './loyalty-ledger.service';
import { LoyaltyPointTransactionSyncItemDto } from '../dto/point-transaction-sync.dto';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';
import { LoyaltyProgram } from '../entities/loyalty-program.entity';
import { CustomerLoyaltyAccountProjection } from '../entities/customer-loyalty-account-projection.entity';

export type LoyaltyPointTransactionSyncStatus = 'ACCEPTED' | 'FAILED';

export interface LoyaltyPointTransactionSyncResultItem {
  idempotencyKey: string;
  status: LoyaltyPointTransactionSyncStatus;
  code?: string;
  message?: string;
}

export interface LoyaltyPointTransactionSyncResult {
  received: number;
  processed: number;
  failed: number;
  results: LoyaltyPointTransactionSyncResultItem[];
}

/**
 * Outcome of resolving the loyalty program for a POS record that arrived
 * without one.
 *
 * - `resolved`: exactly one candidate program — the record joins it.
 * - `none`: the tenant has no ACTIVE program — the legacy H2 path applies
 *   (the movement is recorded program-less, touching no projection).
 * - `ambiguous`: several programs exist and the customer's own projection
 *   rows cannot disambiguate — the record FAILS instead of silently
 *   deepening the projection drift.
 */
export type LoyaltyProgramResolution = {
  programId: string | null;
  outcome: 'resolved' | 'none' | 'ambiguous';
};

/**
 * Ingestion for POS-pushed loyalty point transactions (Batch 5 slice 5b,
 * finding H2). Every record is persisted through
 * `LoyaltyLedgerService.appendTransaction` so idempotency dedupe and the
 * program balance projection stay on the single ledger write path.
 *
 * Duplicate idempotency keys (an already-recorded transaction replayed by a
 * terminal) are accepted gracefully: the ledger returns the existing row and
 * the record reports ACCEPTED without double counting. Only a true payload
 * conflict on the same key (ConflictException from the ledger) or an
 * unexpected persistence failure marks a record FAILED; the rest of the
 * batch is never aborted by one bad record.
 */
@Injectable()
export class LoyaltySyncIngestionService {
  private readonly logger = new Logger(LoyaltySyncIngestionService.name);

  constructor(
    private readonly ledgerService: LoyaltyLedgerService,
    private readonly dataSource: DataSource,
  ) {}

  async ingestPointTransactions(
    tenantId: string,
    records: LoyaltyPointTransactionSyncItemDto[],
  ): Promise<LoyaltyPointTransactionSyncResult> {
    const results: LoyaltyPointTransactionSyncResultItem[] = [];
    let processed = 0;
    let failed = 0;

    for (const record of records) {
      try {
        // Round-2 D-1: the POS pushes redeem/earn rows WITHOUT a program, so
        // every one of them used to fall into the legacy H2 path
        // (program-less ledger row, projection untouched) and the owner's
        // balance projection froze at its last cloud-written value while the
        // ledger kept moving. Resolve the program BEFORE the append so the
        // single ledger write path maintains the projection.
        let resolvedProgramId: string | null | undefined;
        if (!record.loyaltyProgramId?.trim()) {
          const resolution = await this.resolveLoyaltyProgramId(
            tenantId,
            record.customerId,
          );
          if (resolution.outcome === 'ambiguous') {
            failed += 1;
            this.logger.warn(
              `[LOYALTY-SYNC] record key=${record.idempotencyKey} tenant=${tenantId} ` +
                `status=FAILED code=PROGRAM_UNRESOLVED: the tenant has several ` +
                `ACTIVE programs and the customer's projection rows cannot ` +
                `disambiguate them`,
            );
            results.push({
              idempotencyKey: record.idempotencyKey,
              status: 'FAILED',
              code: 'PROGRAM_UNRESOLVED',
              message:
                'Several ACTIVE loyalty programs and no customer attribution; ' +
                'the record was NOT written to the ledger.',
            });
            continue;
          }
          resolvedProgramId = resolution.programId;
        }

        await this.ledgerService.appendTransaction(
          this.toLedgerDto(tenantId, record, resolvedProgramId),
        );
        processed += 1;
        results.push({
          idempotencyKey: record.idempotencyKey,
          status: 'ACCEPTED',
        });
      } catch (error: unknown) {
        failed += 1;
        const isConflict = error instanceof ConflictException;
        const message =
          error instanceof Error
            ? error.message
            : (JSON.stringify(error) ?? 'unknown error');
        this.logger.warn(
          `[LOYALTY-SYNC] record key=${record.idempotencyKey} tenant=${tenantId} ` +
            `status=FAILED code=${isConflict ? 'IDEMPOTENCY_CONFLICT' : 'PERSISTENCE_ERROR'}: ${message}`,
        );
        results.push({
          idempotencyKey: record.idempotencyKey,
          status: 'FAILED',
          code: isConflict ? 'IDEMPOTENCY_CONFLICT' : 'PERSISTENCE_ERROR',
          message,
        });
      }
    }

    return { received: records.length, processed, failed, results };
  }

  /**
   * Resolves the program a program-less POS record belongs to.
   *
   * One ACTIVE program in the tenant is the whole answer. Several require
   * the customer's own projection rows to disambiguate; when they cannot,
   * the outcome is `ambiguous` and the caller fails the record. Zero ACTIVE
   * programs keeps the legacy H2 behaviour (no projection exists to touch).
   *
   * Reads run inside a tenant-bound transaction: the pooled repositories
   * never see the RLS binding on their own.
   */
  async resolveLoyaltyProgramId(
    tenantId: string,
    customerId: string,
  ): Promise<LoyaltyProgramResolution> {
    return runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        const activePrograms = await manager
          .getRepository(LoyaltyProgram)
          .find({
            where: { tenant_id: tenantId, status: 'ACTIVE' as never },
            select: { id: true },
          });
        if (activePrograms.length === 0) {
          return { programId: null, outcome: 'none' };
        }
        if (activePrograms.length === 1) {
          return { programId: activePrograms[0].id, outcome: 'resolved' };
        }

        const projectionRows = await manager
          .getRepository(CustomerLoyaltyAccountProjection)
          .find({
            where: { tenant_id: tenantId, customer_id: customerId },
            select: { loyalty_program_id: true },
          });
        const customerPrograms = [
          ...new Set(projectionRows.map((row) => row.loyalty_program_id)),
        ];
        if (customerPrograms.length === 1) {
          return { programId: customerPrograms[0], outcome: 'resolved' };
        }
        return { programId: null, outcome: 'ambiguous' };
      },
    );
  }

  private toLedgerDto(
    tenantId: string,
    record: LoyaltyPointTransactionSyncItemDto,
    resolvedProgramId?: string | null,
  ): AppendLoyaltyTxDto {
    return {
      tenantId,
      customerId: record.customerId,
      loyaltyProgramId:
        record.loyaltyProgramId ?? resolvedProgramId ?? undefined,
      ticketId: record.ticketId,
      rewardId: record.rewardId,
      transactionType: record.transactionType,
      units: record.units,
      reason: record.reason,
      reversalOfTransactionId: record.reversalOfTransactionId,
      idempotencyKey: record.idempotencyKey,
      sourceEventId: record.sourceEventId,
      actorUserId: record.actorUserId,
      branchId: record.branchId,
      terminalId: record.terminalId,
      programVersion: record.programVersion,
      rewardVersion: record.rewardVersion,
      commercialSnapshot: record.commercialSnapshot,
      origin: record.origin ?? 'POS',
      occurredAt: record.occurredAt ? new Date(record.occurredAt) : undefined,
    };
  }
}
