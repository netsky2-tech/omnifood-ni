import { Injectable, Logger } from '@nestjs/common';
import { DataSource, MoreThan } from 'typeorm';
import { ChangeLogService } from '../../audit/change-log.service';
import { InventorySyncReceipt } from '../../inventory/entities/inventory-sync-receipt.entity';
import { InventorySyncOutbox } from '../../inventory/entities/inventory-sync-outbox.entity';
import { bindTenantContext } from '../../../core/database/tenant-transaction';

/**
 * Sequence-gap policy for the sales sync ingest.
 *
 * A device stream is contiguous per (tenant_id, source_device_id,
 * flow_type): the ingest watermark is the highest ACCEPTED
 * inventory_sync_receipts source_sequence. When a record is lost on the
 * wire, every later record is staged STAGED_FUTURE forever — the missing
 * sequence never arrives and the watermark never moves (observed on a real
 * rig: one lost number blocked four real documents).
 *
 * This policy declares such a gap EXPLICITLY and auditably: after a grace
 * window measured from the oldest STAGED_FUTURE outbox row above the
 * watermark, it writes fill receipts (result_status ACCEPTED so the
 * watermark advances) for each missing sequence, then the caller applies
 * the record under processing. The device's own retry loop drains the
 * staged rows afterwards — no replay routine is needed.
 *
 * The fill rows are NOT real documents: they carry a fixed no-payload hash
 * and a GAP_FILL_DECLARED result code, and every declaration writes a
 * change_log audit event. Idempotency is guaranteed both by the pre-insert
 * existence check and by the uq_inventory_sync_receipts_stream_sequence
 * unique index.
 */

export const SYNC_SEQUENCE_GAP_GRACE_WINDOW_MINUTES_ENV_VAR =
  'SYNC_SEQUENCE_GAP_GRACE_WINDOW_MINUTES';

/**
 * 60 minutes. The device retries every 5 minutes, so the default must be
 * generously larger than one retry cycle: 60 minutes gives 12 retry cycles
 * for the lost record to reappear (device offline, radio blackout, queue
 * flush) before the gap is declared unrecoverable, while still unblocking
 * a stream within a single service shift. Override via the env var above.
 */
export const DEFAULT_SEQUENCE_GAP_GRACE_WINDOW_MINUTES = 60;

export const GAP_FILL_RESULT_CODE = 'GAP_FILL_DECLARED';
export const GAP_FILL_PAYLOAD_HASH = 'GAP_FILL_NO_PAYLOAD';
export const GAP_FILL_ACTOR_REF = 'system:sequence-gap-policy';
export const GAP_FILL_AUDIT_ACTION = 'SYNC_SEQUENCE_GAP_DECLARED';

const isPositiveInteger = (value: number): boolean =>
  Number.isSafeInteger(value) && value > 0;

/**
 * Resolves the grace window (minutes) from an environment bag, defaulting
 * to `process.env`. Invalid values fail closed to the conservative default
 * rather than throwing: declaring a gap is fiscal-sensitive, and a
 * misconfigured window must not widen it accidentally.
 */
export function resolveSequenceGapGraceWindowMinutes(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env[SYNC_SEQUENCE_GAP_GRACE_WINDOW_MINUTES_ENV_VAR]?.trim();
  if (!raw) return DEFAULT_SEQUENCE_GAP_GRACE_WINDOW_MINUTES;
  if (!/^\d+$/.test(raw)) return DEFAULT_SEQUENCE_GAP_GRACE_WINDOW_MINUTES;
  const parsed = Number(raw);
  if (!isPositiveInteger(parsed)) {
    return DEFAULT_SEQUENCE_GAP_GRACE_WINDOW_MINUTES;
  }
  return parsed;
}

export interface SequenceGapDeclarationParams {
  tenantId: string;
  sourceDeviceId: string;
  flowType: string;
  /** Next expected sequence (watermark + 1). */
  expectedSequence: number;
  /** Sequence of the record about to be staged. */
  incomingSequence: number;
  now?: Date;
}

@Injectable()
export class SequenceGapPolicyService {
  private readonly logger = new Logger(SequenceGapPolicyService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly changeLogService: ChangeLogService,
  ) {}

  /**
   * Called by the ingest at the moment a record is about to be staged as
   * STAGED_FUTURE. Returns true when the gap blocking this stream was
   * declared unrecoverable here: fill receipts were committed for every
   * missing sequence, the watermark now equals the incoming sequence, and
   * the caller must apply the record instead of staging it. Returns false
   * when the block is younger than the grace window, there is no staged
   * block to age, or the gap is already filled — the caller stages as
   * today.
   */
  async declareGapIfBlocked(
    params: SequenceGapDeclarationParams,
  ): Promise<boolean> {
    const {
      tenantId,
      sourceDeviceId,
      flowType,
      expectedSequence,
      incomingSequence,
    } = params;
    const now = params.now ?? new Date();
    const graceWindowMinutes = resolveSequenceGapGraceWindowMinutes();
    const graceWindowMs = graceWindowMinutes * 60_000;

    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      await bindTenantContext(manager, tenantId);

      // Age of the block: created_at of the OLDEST staged row above the
      // watermark for this stream. No staged rows above the watermark means
      // there is no observed block to age — stay conservative and stage.
      const outboxRepo = manager.getRepository(InventorySyncOutbox);
      const oldestStaged = await outboxRepo.findOne({
        where: {
          tenant_id: tenantId,
          source_device_id: sourceDeviceId,
          flow_type: flowType,
          status: 'STAGED_FUTURE',
          source_sequence: MoreThan(String(expectedSequence - 1)),
        },
        order: { source_sequence: 'ASC' },
      });
      if (!oldestStaged?.created_at) return false;

      const blockedSince = new Date(oldestStaged.created_at);
      const blockedForMs = now.getTime() - blockedSince.getTime();
      if (blockedForMs < graceWindowMs) return false;

      // Missing sequences between the watermark and the incoming record.
      // Idempotency: a sequence that already has a receipt row (fill or the
      // real record that closed the gap) is skipped, never duplicated.
      const receiptRepo = manager.getRepository(InventorySyncReceipt);
      const missingSequences: number[] = [];
      for (let seq = expectedSequence; seq < incomingSequence; seq += 1) {
        const existing = await receiptRepo.findOne({
          where: {
            tenant_id: tenantId,
            source_device_id: sourceDeviceId,
            flow_type: flowType,
            source_sequence: String(seq),
          },
        });
        if (!existing) missingSequences.push(seq);
      }
      if (missingSequences.length === 0) return false;

      const fillRows = missingSequences.map((seq) =>
        receiptRepo.create({
          tenant_id: tenantId,
          idempotency_key: `gap-fill:${sourceDeviceId}:${flowType}:${seq}`,
          source_device_id: sourceDeviceId,
          flow_type: flowType,
          source_sequence: String(seq),
          payload_hash: GAP_FILL_PAYLOAD_HASH,
          result_status: 'ACCEPTED',
          result_code: GAP_FILL_RESULT_CODE,
          acceptedAt: now,
        }),
      );
      try {
        await receiptRepo.insert(fillRows);
      } catch (error: unknown) {
        // Lost a concurrent-declaration race against the unique stream
        // sequence index: do not apply this record yet — the watermark is
        // not provably advanced here. The next batch re-evaluates and
        // finds the gap filled.
        if (!this.isUniqueViolation(error)) throw error;
        this.logger.warn(
          `[SYNC-GAP-RACE] tenant=${tenantId} device=${sourceDeviceId} flow=${flowType} sequences=${missingSequences.join(',')}`,
        );
        return false;
      }

      await this.changeLogService.log(
        {
          tenantId,
          actor: { ref: GAP_FILL_ACTOR_REF },
          action: GAP_FILL_AUDIT_ACTION,
          // change_log.target_id is a uuid column, so the audit must point at
          // a real row: the staged outbox row that triggered the declaration.
          // The previous composite `${sourceDeviceId}:${flowType}` string is
          // rejected by the database (invalid input syntax for type uuid) and,
          // because the audit write shares this SERIALIZABLE transaction, it
          // rolled back the whole declaration and the error escaped out of
          // syncBatch, failing the entire batch. Found by the DB-backed spec;
          // invisible to the mocked unit tests.
          targetType: 'inventory_sync_outbox',
          targetId: oldestStaged.id,
          changes: {
            declaredSequences: missingSequences,
            sourceDeviceId,
            flowType,
            blockedSince: blockedSince.toISOString(),
            graceWindowMinutes,
            payloadHash: GAP_FILL_PAYLOAD_HASH,
          },
        },
        manager,
      );

      this.logger.warn(
        `[SYNC-GAP-DECLARED] tenant=${tenantId} device=${sourceDeviceId} flow=${flowType} declared=${missingSequences.join(',')} blockedSince=${blockedSince.toISOString()}`,
      );
      return true;
    });
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === '23505'
    );
  }
}
