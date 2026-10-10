import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';
import { DeviceSyncCredential } from '../../identity/entities/device-sync-credential.entity';
import { deriveSyncFreshness } from './freshness-derivation';
import { resolveFreshnessThresholdMinutes } from './freshness.config';
import {
  SyncFreshnessTerminalDto,
  SyncFreshnessDto,
} from './sync-freshness.dto';
import {
  AboveWatermarkRow,
  buildTerminalEvidence,
  CredentialStreamRow,
  OUTBOX_PENDING_ABOVE_WATERMARK_SQL,
  RECEIPT_STREAMS_SQL,
  REJECTED_ABOVE_WATERMARK_SQL,
  ReceiptStreamRow,
} from './terminal-sync-evidence';

/**
 * Owner Dashboard V2 — sync freshness/completeness read service
 * (architecture spec v0.3 §17.3/§17.12, PRD v1.0 §20 FR-SYNC-01..05).
 *
 * Issue #592 permanent rule: inventory_sync_receipts,
 * inventory_sync_outbox, and device_sync_credentials are RLS-forced tables,
 * so every read here runs inside runInTenantTransaction with a
 * transaction-local tenant binding. There are NO pooled repository reads.
 *
 * The service only gathers evidence; state derivation is delegated to the
 * pure `deriveSyncFreshness` function, and the shared receipt/watermark SQL
 * plus evidence building live in `terminal-sync-evidence.ts` (reused by the
 * terminal registry read model, issue #832 / AG-03).
 */
@Injectable()
export class SyncHealthService {
  constructor(
    // Bound-read tripwire (#592 pattern): no pooled repository token exists
    // for the RLS-forced tables this service reads; the DataSource is used
    // exclusively to open tenant-bound transactions.
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async getFreshness(
    tenantId: string,
    evaluatedAt: Date = new Date(),
  ): Promise<SyncFreshnessDto> {
    const thresholdMinutes = resolveFreshnessThresholdMinutes();

    const terminals = await runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        const credentials = await manager
          .getRepository(DeviceSyncCredential)
          .find({
            where: { tenantId },
            relations: ['activationAttempt'],
          });
        const receiptStreams = await manager.query<ReceiptStreamRow[]>(
          RECEIPT_STREAMS_SQL,
          [tenantId],
        );
        const rejectedAbove = await manager.query<AboveWatermarkRow[]>(
          REJECTED_ABOVE_WATERMARK_SQL,
          [tenantId],
        );
        const outboxPending = await manager.query<CredentialStreamRow[]>(
          OUTBOX_PENDING_ABOVE_WATERMARK_SQL,
          [tenantId],
        );
        return buildTerminalEvidence({
          credentials,
          receiptStreams,
          rejectedAbove,
          outboxPending,
        });
      },
    );

    const derivation = deriveSyncFreshness({
      terminals,
      thresholdMinutes,
      now: evaluatedAt.toISOString(),
    });

    const perTerminal: SyncFreshnessTerminalDto[] = derivation.perTerminal.map(
      (terminal) => ({
        terminalId: terminal.terminalId,
        label: terminal.label,
        state: terminal.state,
        acceptedThroughSequence: terminal.acceptedThroughSequence,
        lastReceiptAt: terminal.lastReceiptAt,
        hasDeclaredGaps: terminal.hasDeclaredGaps,
        hasInventoryPending: terminal.hasInventoryPending,
        inventoryPendingCount: terminal.inventoryPendingCount,
      }),
    );

    return {
      state: derivation.state,
      thresholdMinutes: derivation.thresholdMinutes,
      lastCompleteAt: derivation.lastCompleteAt,
      perTerminal,
      evaluatedAt: derivation.evaluatedAt,
      hasDeclaredGaps: derivation.hasDeclaredGaps,
      hasInventoryPending: derivation.hasInventoryPending,
      inventoryPendingCount: derivation.inventoryPendingCount,
    };
  }
}
