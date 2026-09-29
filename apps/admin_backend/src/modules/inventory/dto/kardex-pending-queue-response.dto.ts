import { KardexQueueStatus } from '../entities/kardex-recalculate-queue.entity';

/**
 * Read model for GET /inventory/regularization/pending (batch 6 slice 6c,
 * finding H7: the owner cannot review kardex corrections remotely).
 *
 * The raw kardex_recalculate_queue row only carries ids; the approval
 * decision (NHILOS §23.1: object, consequence, reversibility, scope) needs
 * the cost context the approval will apply. The service derives those fields
 * from the same origin/trigger movements the approval transaction reads, so
 * the page previews exactly what `approveRegularization` will compute.
 *
 * Nullable cost fields mean the linked movement/insumo row is missing —
 * unknown stays null on the wire and renders as "—" in the dashboard
 * (NHILOS §34: unknown is never zero).
 */
export class KardexPendingQueueItemResponseDto {
  queueId: string;

  status: KardexQueueStatus;

  insumoId: string;

  insumoName: string | null;

  previousUnitCostNio: number | null;

  recalculatedUnitCostNio: number | null;

  deltaUnitCostNio: number | null;

  totalDeltaCostNio: number | null;

  affectedQuantity: number | null;

  triggerMovementType: string | null;

  /** ISO-8601 timestamp of queue row creation (when the engine detected it). */
  detectedAt: string;
}
