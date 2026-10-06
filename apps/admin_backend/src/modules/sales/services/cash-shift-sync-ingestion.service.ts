import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  CashShiftSession,
  CashShiftStatus,
} from '../entities/cash-shift.entity';
import { CashMovement } from '../entities/cash-movement.entity';
import { User } from '../../identity/entities/user.entity';
import type {
  CashMovementSyncItemDto,
  CashShiftSessionSyncItemDto,
} from '../dto/cash-shift-sync.dto';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';

export type CashShiftSyncStatus = 'ACCEPTED' | 'FAILED';

/**
 * Per-record rejection for a session `status` outside the documented
 * OPEN/CLOSED domain. The DTO keeps `status` a loose string on purpose:
 * an unexpected value must fail THIS record in the ingestion service
 * (per-record result isolation) instead of rejecting the whole batch with
 * a 400.
 */
export class InvalidCashShiftStatusError extends Error {
  constructor(readonly status: string) {
    super(
      `Unrecognized cash shift session status '${status}'; expected 'OPEN' or 'CLOSED'`,
    );
    this.name = 'InvalidCashShiftStatusError';
  }
}

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
    private readonly dataSource: DataSource,
    @InjectRepository(CashShiftSession)
    private readonly shiftsRepository: Repository<CashShiftSession>,
    @InjectRepository(CashMovement)
    private readonly movementsRepository: Repository<CashMovement>,
  ) {}

  async ingestCashShiftBatch(
    tenantId: string,
    batch: CashShiftSyncBatch,
  ): Promise<CashShiftSyncResult> {
    return runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager: EntityManager) => {
        const shiftsRepo = manager.getRepository(CashShiftSession);
        const movementsRepo = manager.getRepository(CashMovement);
        // D-3/D-14: belt-and-braces name resolution. A device that cannot
        // resolve the cashier id against its local users table omits
        // `cashierName`; the backend resolves it here, scoped to the caller
        // tenant, so the cloud `cashier_name` column carries a person's
        // name whenever one exists. A failing lookup degrades to the
        // historical id fallback without breaking ingestion.
        const userMap = await this.loadTenantUserNames(manager, tenantId);
        const results: CashShiftSyncResultItem[] = [];
        let processed = 0;
        let failed = 0;

        for (const record of batch.sessions) {
          try {
            await this.upsertSession(tenantId, record, shiftsRepo, userMap);
            processed += 1;
            results.push({ idempotencyKey: record.id, status: 'ACCEPTED' });
          } catch (error: unknown) {
            failed += 1;
            results.push(this.toFailure(tenantId, 'session', record.id, error));
          }
        }

        for (const record of batch.movements) {
          try {
            await this.insertMovementOnce(tenantId, record, movementsRepo);
            processed += 1;
            results.push({ idempotencyKey: record.id, status: 'ACCEPTED' });
          } catch (error: unknown) {
            failed += 1;
            results.push(
              this.toFailure(tenantId, 'movement', record.id, error),
            );
          }
        }

        return {
          received: batch.sessions.length + batch.movements.length,
          processed,
          failed,
          results,
        };
      },
    );
  }

  /**
   * D-3: resolves the tenant's user ids to display names once per batch.
   * Mirrors the resolve-then-fallback pattern in sales-reports.service.ts /
   * fiscal-reports.service.ts. A lookup failure is logged and degraded to
   * an empty map — ingestion never fails because the users table is
   * unavailable.
   */
  private async loadTenantUserNames(
    manager: EntityManager,
    tenantId: string,
  ): Promise<Map<string, string>> {
    try {
      const users = await manager.getRepository(User).find({
        where: { tenant_id: tenantId },
      });
      return new Map(users.map((u) => [u.id, u.name]));
    } catch (error: unknown) {
      this.logger.warn(
        `[CASH-SHIFT-SYNC] tenant=${tenantId} users lookup failed; ` +
          `falling back to the cashier id for cashier_name: ` +
          `${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return new Map<string, string>();
    }
  }

  private async upsertSession(
    tenantId: string,
    record: CashShiftSessionSyncItemDto,
    shiftsRepo: Repository<CashShiftSession>,
    userMap: Map<string, string>,
  ): Promise<void> {
    const existing = await shiftsRepo.findOne({
      where: { id: record.id },
    });
    if (existing) {
      if (existing.tenant_id !== tenantId) {
        throw new ConflictException(
          `Cash shift session '${record.id}' already exists under a different tenant`,
        );
      }
      await shiftsRepo.update(
        { id: existing.id, tenant_id: tenantId },
        this.toSessionValues(tenantId, record, userMap),
      );
      return;
    }
    await shiftsRepo.insert(this.toSessionValues(tenantId, record, userMap));
  }

  private async insertMovementOnce(
    tenantId: string,
    record: CashMovementSyncItemDto,
    movementsRepo: Repository<CashMovement>,
  ): Promise<void> {
    const existing = await movementsRepo.findOne({
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
    await movementsRepo.insert({
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
   * Maps the POS payload onto the `cash_shift_sessions` columns. The
   * cashier name resolution chain (D-3): the payload's `cashierName` wins
   * verbatim; otherwise the cashier id is resolved against the tenant's
   * users table; only when the user is unknown does the historical id
   * fallback keep the NOT NULL column satisfied — and it never overwrites
   * a resolved person name with a UUID.
   */
  private toSessionValues(
    tenantId: string,
    record: CashShiftSessionSyncItemDto,
    userMap: Map<string, string>,
  ): Partial<CashShiftSession> {
    return {
      id: record.id,
      tenant_id: tenantId,
      terminal_id: record.terminalId,
      cashier_id: record.cashierId,
      cashier_name:
        record.cashierName?.trim() ||
        userMap.get(record.cashierId) ||
        record.cashierId,
      opened_at: new Date(record.openedAt),
      closed_at: record.closedAt ? new Date(record.closedAt) : null,
      status: this.toSessionStatus(record),
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

  /**
   * Maps the POS status onto the cloud enum. A terminal that omits the
   * field keeps the historical OPEN default (legacy payloads never sent
   * it); any other value outside {OPEN, CLOSED} is a per-record
   * INVALID_STATUS failure, never a silent coercion.
   */
  private toSessionStatus(
    record: CashShiftSessionSyncItemDto,
  ): CashShiftStatus {
    if (record.status === undefined || record.status === null) {
      return CashShiftStatus.OPEN;
    }
    if (record.status === 'OPEN') return CashShiftStatus.OPEN;
    if (record.status === 'CLOSED') return CashShiftStatus.CLOSED;
    throw new InvalidCashShiftStatusError(record.status);
  }

  private toFailure(
    tenantId: string,
    kind: 'session' | 'movement',
    id: string,
    error: unknown,
  ): CashShiftSyncResultItem {
    const isTenantConflict = error instanceof ConflictException;
    const isInvalidStatus = error instanceof InvalidCashShiftStatusError;
    const code = isTenantConflict
      ? 'TENANT_IDENTITY_CONFLICT'
      : isInvalidStatus
        ? 'INVALID_STATUS'
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
