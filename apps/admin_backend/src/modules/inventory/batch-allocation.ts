import { ConflictException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { Batch } from './entities/batch.entity';
import { BatchOutflowTrace } from './entities/batch-outflow-trace.entity';
import {
  BatchCostingService,
  type BatchCandidate,
} from './batch-costing.service';

const round4 = (value: number): number => Number(value.toFixed(4));

/**
 * WHY A TYPED ERROR: the sync path reports a REJECTED record with a
 * machine-readable code, and that code is what a terminal, a dashboard and
 * a support ticket group by. A bare `ConflictException` used to be caught
 * by a catch-all and reported as `LOYALTY_IDEMPOTENCY_CONFLICT` — a
 * loyalty code for an INVENTORY conflict, which sent the triage (and the
 * owner) looking at the points ledger instead of at the batches.
 *
 * The reason travels with the error, so the surface can name the cause it
 * actually is.
 */
export type BatchAllocationConflictReason =
  /** The batches cannot cover the outflow: reconcile them before recording it. */
  | 'BALANCE_INSUFFICIENT'
  /** The movement references a batch that does not exist. */
  | 'UNKNOWN_SOURCE_BATCH'
  /** The trace references a batch that does not exist. */
  | 'UNKNOWN_TRACE_BATCH';

export class BatchAllocationConflictException extends ConflictException {
  constructor(
    readonly reason: BatchAllocationConflictReason,
    message: string,
  ) {
    super(message);
    this.name = 'BatchAllocationConflictException';
  }
}

/**
 * `BatchCostingService` holds no state and injects nothing, so a single
 * module-level instance is equivalent to a pure function. That is what lets
 * this stay a plain function instead of a new constructor parameter threaded
 * through `ShrinkageService`, `InvoicesService` and `CountSessionService` —
 * and through every spec that constructs them.
 */
const batchCosting = new BatchCostingService();

/**
 * Draws ONE outflow (shrinkage, sync delta or count variance) from the batch
 * balances, in FEFO order.
 *
 * Why this exists (H-R12, R13): `ShrinkageService`, the delta branch of
 * `InvoicesService` and `CountSessionService` all decrement `insumos.stock`
 * and **never touched `batches.remaining_stock`**. Measured against a
 * migration-built schema: `insumos.stock = 36` against a batch sum of `60` for
 * the same insumo. FEFO — production consumption included — reads BATCHES, so
 * every downstream computation was running against a balance that no longer
 * represented reality, and once the delta flow became reachable (R14) that
 * divergence started propagating to the cloud.
 *
 * The scaling rule is FEFO, and it is **not duplicated here**: it is
 * `BatchCostingService.buildValuationTrace`, the same rule R4 verified for
 * production, so consumption and outflow stay under ONE explainable rule. It is
 * a PRACTICE-based choice: NIC 2 and Ley 822 regulate cost formulas, not
 * physical rotation (docs/inventario_marco_normativo.md §5).
 *
 * What this does NOT do: it does not change the COST of the outflow. Outflows
 * are valued at the current CPP by design; only the per-batch QUANTITIES move.
 * Mixing the two layers is what the normative document separates on purpose.
 *
 * Returns quietly when the insumo has no batches: a non batch-managed item's
 * aggregate stock IS the only truth, and there is nothing to keep in step.
 *
 * Throws when the batches cannot cover the outflow, rather than drawing a
 * partial amount: covering less would break the invariant in the other
 * direction, and an aggregate larger than its batches is a pre-existing data
 * divergence that deserves to be seen, not smoothed over.
 *
 * OPEN CASE, deliberately not approximated: a POSITIVE movement (a positive
 * delta or a positive count variance) means stock appearing with no known lot,
 * and `batches.expiration_date` is NOT NULL, so no batch can be invented here.
 */
export const drawBatchOutflow = async (input: {
  manager: EntityManager;
  tenantId: string;
  insumoId: string;
  /** Positive magnitude of what is leaving. */
  quantity: number;
  /** ISO calendar day (`YYYY-MM-DD`) used for the FEFO / soft-expiry ordering. */
  operationDay: string;
  /**
   * The Kardex movement this outflow belongs to. When present, the exact
   * (batch, quantity) pairs drawn are recorded in `batch_outflow_traces` so a
   * later cancellation can restore them (R3). Movable callers that save the
   * movement AFTER drawing simply omit it.
   */
  movementId?: string;
}): Promise<void> => {
  const required = round4(input.quantity);
  if (required <= 0) {
    return;
  }

  const batchRepo = input.manager.getRepository(Batch);
  const candidates = await batchRepo.find({
    where: { tenant_id: input.tenantId, insumo_id: input.insumoId },
    order: { batch_number: 'ASC' },
  });

  if (candidates.length === 0) {
    return;
  }

  const trace = batchCosting.buildValuationTrace({
    requiredQuantity: required,
    operationDate: input.operationDay,
    candidates: candidates.map<BatchCandidate>((batch) => ({
      batchId: batch.id,
      insumoId: input.insumoId,
      remainingStock: Number(batch.remaining_stock),
      unitCostNio: Number(batch.cost),
      expirationDate: batch.expiration_date,
    })),
  });

  const covered = round4(
    trace.reduce((total, consumed) => total + consumed.consumedQuantity, 0),
  );

  if (covered < required) {
    throw new BatchAllocationConflictException(
      'BALANCE_INSUFFICIENT',
      `Batch balances cannot cover the outflow for insumo ${input.insumoId}: ` +
        `required ${required}, batch balances total ${covered}. The aggregate ` +
        `stock and the batch balances have diverged; reconcile them before ` +
        `recording this movement.`,
    );
  }

  const byId = new Map(candidates.map((batch) => [batch.id, batch] as const));

  for (const consumed of trace) {
    const batch = byId.get(consumed.batchId);
    if (!batch) {
      throw new BatchAllocationConflictException(
        'UNKNOWN_SOURCE_BATCH',
        `Outflow referenced an unknown source batch: ${consumed.batchId}`,
      );
    }

    batch.remaining_stock = round4(
      Number(batch.remaining_stock) - consumed.consumedQuantity,
    );
    await batchRepo.save(batch);
  }

  if (input.movementId) {
    const traceRepo = input.manager.getRepository(BatchOutflowTrace);
    for (const consumed of trace) {
      await traceRepo.save(
        traceRepo.create({
          tenant_id: input.tenantId,
          movement_id: input.movementId,
          batch_id: consumed.batchId,
          quantity: round4(consumed.consumedQuantity),
        }),
      );
    }
  }
};

/**
 * Reverses ONE outflow: returns the traced quantities to the SAME batches the
 * original movement drew from.
 *
 * Why an inflow cannot be approximated instead: a POSITIVE movement has no
 * known lot, and `batches.expiration_date` is NOT NULL, so no batch can be
 * invented. The only faithful reversal is the recorded trace. A movement with
 * no trace (a pre-R3 sale, or a non batch-managed insumo) restores nothing.
 */
export const restoreBatchInflow = async (input: {
  manager: EntityManager;
  tenantId: string;
  /** The movement whose outflow is being reversed. */
  movementId: string;
}): Promise<void> => {
  const traceRepo = input.manager.getRepository(BatchOutflowTrace);
  const traces = await traceRepo.find({
    where: { tenant_id: input.tenantId, movement_id: input.movementId },
  });

  if (traces.length === 0) {
    return;
  }

  const batchRepo = input.manager.getRepository(Batch);
  const restored = new Map<string, Batch>();

  for (const trace of traces) {
    let batch = restored.get(trace.batch_id);
    if (!batch) {
      batch = await batchRepo.findOne({
        where: { id: trace.batch_id, tenant_id: input.tenantId },
      });
      if (!batch) {
        throw new BatchAllocationConflictException(
          'UNKNOWN_TRACE_BATCH',
          `Batch trace referenced an unknown batch: ${trace.batch_id}`,
        );
      }
      restored.set(trace.batch_id, batch);
    }

    batch.remaining_stock = round4(
      Number(batch.remaining_stock) + Number(trace.quantity),
    );
  }

  for (const batch of restored.values()) {
    await batchRepo.save(batch);
  }
};
