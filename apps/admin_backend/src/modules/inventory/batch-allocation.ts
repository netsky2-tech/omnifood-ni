import { ConflictException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { Batch } from './entities/batch.entity';
import {
  BatchCostingService,
  type BatchCandidate,
} from './batch-costing.service';

const round4 = (value: number): number => Number(value.toFixed(4));

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
    throw new ConflictException(
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
      throw new ConflictException(
        `Outflow referenced an unknown source batch: ${consumed.batchId}`,
      );
    }

    batch.remaining_stock = round4(
      Number(batch.remaining_stock) - consumed.consumedQuantity,
    );
    await batchRepo.save(batch);
  }
};
