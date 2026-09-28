import { Injectable, Logger } from '@nestjs/common';
import { ConflictException } from '@nestjs/common';
import { LoyaltyLedgerService } from './loyalty-ledger.service';
import type { AppendLoyaltyTxDto } from './loyalty-ledger.service';
import { LoyaltyPointTransactionSyncItemDto } from '../dto/point-transaction-sync.dto';

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

  constructor(private readonly ledgerService: LoyaltyLedgerService) {}

  async ingestPointTransactions(
    tenantId: string,
    records: LoyaltyPointTransactionSyncItemDto[],
  ): Promise<LoyaltyPointTransactionSyncResult> {
    const results: LoyaltyPointTransactionSyncResultItem[] = [];
    let processed = 0;
    let failed = 0;

    for (const record of records) {
      try {
        await this.ledgerService.appendTransaction(
          this.toLedgerDto(tenantId, record),
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

  private toLedgerDto(
    tenantId: string,
    record: LoyaltyPointTransactionSyncItemDto,
  ): AppendLoyaltyTxDto {
    return {
      tenantId,
      customerId: record.customerId,
      loyaltyProgramId: record.loyaltyProgramId,
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
