import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CashShiftSession,
  CashShiftStatus,
} from '../entities/cash-shift.entity';
import { CashMovement } from '../entities/cash-movement.entity';
import type {
  CashMovementSyncItemDto,
  CashShiftSessionSyncItemDto,
} from '../dto/cash-shift-sync.dto';

export type CashShiftSyncStatus = 'ACCEPTED' | 'FAILED';

export interface CashShiftSyncResultItem {
  /** The immutable local POS row id (session id or movement id). */
  idempotencyKey: string;
  status: CashShiftSyncStatus;
  code?: string;
  message?: string;
}

export interface CashShiftSyncResult {
  received: number;
  processed: number;
  failed: number;
  results: CashShiftSyncResultItem[];
}

export interface CashShiftSyncBatch {
  sessions: CashShiftSessionSyncItemDto[];
  movements: CashMovementSyncItemDto[];
}

/**
 * Ingestion for POS-pushed cash shift sessions and cash movements (Batch 5
 * slice 5c, finding H3). The cloud tables carry no updated_at/version
 * columns, so ingestion is upsert-by-id:
 *
 * - Sessions are upserted (last write wins): a terminal legitimately pushes
 *   the same session twice, first OPEN and later CLOSED, and the closed
 *   state must overwrite the earlier one. Replays are idempotent and never
 *   duplicate rows.
 * - Movements are immutable: insert-if-absent, replays are accepted without
 *   re-inserting.
 *
 * Every write is tenant-scoped to the authenticated device principal's
 * tenant. An id that already exists under a DIFFERENT tenant is a per-record
 * `TENANT_IDENTITY_CONFLICT` failure, never an overwrite. One bad record
 * never aborts the rest of the batch.
 */
@Injectable()
export class CashShiftSyncIngestionService {
  private readonly logger = new Logger(CashShiftSyncIngestionService.name);

  constructor(
    @InjectRepository(CashShiftSession)
    private readonly shiftsRepository: Repository<CashShiftSession>,
    @InjectRepository(CashMovement)
    private readonly movementsRepository: Repository<CashMovement>,
  ) {}

  async ingestCashShiftBatch(
    tenantId: string,
    batch: CashShiftSyncBatch,
  ): Promise<CashShiftSyncResult> {
    const results: CashShiftSyncResultItem[] = [];
    let processed = 0;
    let failed = 0;

    for (const record of batch.sessions) {
      try {
        await this.upsertSession(tenantId, record);
        processed += 1;
        results.push({ idempotencyKey: record.id, status: 'ACCEPTED' });
      } catch (error: unknown) {
        failed += 1;
        results.push(this.toFailure(tenantId, 'session', record.id, error));
      }
    }

    for (const record of batch.movements) {
      try {
        await this.insertMovementOnce(tenantId, record);
        processed += 1;
        results.push({ idempotencyKey: record.id, status: 'ACCEPTED' });
      } catch (error: unknown) {
        failed += 1;
        results.push(this.toFailure(tenantId, 'movement', record.id, error));
      }
    }

    return {
      received: batch.sessions.length + batch.movements.length,
      processed,
      failed,
      results,
    };
  }

  private async upsertSession(
    tenantId: string,
    record: CashShiftSessionSyncItemDto,
  ): Promise<void> {
    const existing = await this.shiftsRepository.findOne({
      where: { id: record.id },
    });
    if (existing) {
      if (existing.tenant_id !== tenantId) {
        throw new ConflictException(
          `Cash shift session '${record.id}' already exists under a different tenant`,
        );
      }
      await this.shiftsRepository.update(
        { id: existing.id, tenant_id: tenantId },
        this.toSessionValues(tenantId, record),
      );
      return;
    }
    await this.shiftsRepository.insert(this.toSessionValues(tenantId, record));
  }

  private async insertMovementOnce(
    tenantId: string,
    record: CashMovementSyncItemDto,
  ): Promise<void> {
    const existing = await this.movementsRepository.findOne({
      where: { id: record.id },
    });
    if (existing) {
      if (existing.tenant_id !== tenantId) {
        throw new ConflictException(
          `Cash movement '${record.id}' already exists under a different tenant`,
        );
      }
      // Idempotent replay: movements are immutable, nothing to update.
      return;
    }
    await this.movementsRepository.insert({
      id: record.id,
      tenant_id: tenantId,
      shift_id: record.shiftId,
      terminal_id: record.terminalId,
      type: record.type as CashMovement['type'],
      amount_nio: record.amountNio ?? 0,
      amount_usd: record.amountUsd ?? 0,
      reason: record.reason,
      authorized_by_user_id: record.authorizedByUserId ?? null,
      timestamp: new Date(record.timestamp),
    });
  }

  /**
   * Maps the POS payload onto the `cash_shift_sessions` columns. A missing
   * `cashierName` falls back to the cashier id so the NOT NULL column stays
   * satisfied (terminal session rows carry only the user id).
   */
  private toSessionValues(
    tenantId: string,
    record: CashShiftSessionSyncItemDto,
  ): Partial<CashShiftSession> {
    return {
      id: record.id,
      tenant_id: tenantId,
      terminal_id: record.terminalId,
      cashier_id: record.cashierId,
      cashier_name: record.cashierName?.trim() || record.cashierId,
      opened_at: new Date(record.openedAt),
      closed_at: record.closedAt ? new Date(record.closedAt) : null,
      status:
        record.status === 'CLOSED'
          ? CashShiftStatus.CLOSED
          : CashShiftStatus.OPEN,
      initial_float_nio: record.initialFloatNio ?? 0,
      initial_float_usd: record.initialFloatUsd ?? 0,
      final_counted_nio: record.finalCountedNio ?? null,
      final_counted_usd: record.finalCountedUsd ?? null,
      expected_cash_nio: record.expectedCashNio ?? 0,
      expected_cash_usd: record.expectedCashUsd ?? 0,
      difference_nio: record.differenceNio ?? null,
      difference_usd: record.differenceUsd ?? null,
      z_report_sequence: record.zReportSequence ?? null,
      supervisor_id: record.supervisorId ?? null,
      notes: record.notes ?? null,
    };
  }

  private toFailure(
    tenantId: string,
    kind: 'session' | 'movement',
    id: string,
    error: unknown,
  ): CashShiftSyncResultItem {
    const isTenantConflict = error instanceof ConflictException;
    const code = isTenantConflict
      ? 'TENANT_IDENTITY_CONFLICT'
      : 'PERSISTENCE_ERROR';
    const message =
      error instanceof Error
        ? error.message
        : (JSON.stringify(error) ?? 'unknown error');
    this.logger.warn(
      `[CASH-SHIFT-SYNC] ${kind} id=${id} tenant=${tenantId} ` +
        `status=FAILED code=${code}: ${message}`,
    );
    return { idempotencyKey: id, status: 'FAILED', code, message };
  }
}
