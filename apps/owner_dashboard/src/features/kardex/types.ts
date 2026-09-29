/**
 * Kardex regularization read model for the owner dashboard (batch 6
 * slice 6c, finding H7). Mirrors the fields returned by
 * GET /inventory/regularization/pending
 * (KardexPendingQueueItemResponseDto); machine codes stay as-is on the wire
 * and are translated only at the view layer (lib/labels.ts convention, D2/D3).
 *
 * Nullable cost/insumo fields mean the linked movement or insumo row is
 * missing — unknown stays null on the wire and renders as "—" in the UI
 * (NHILOS §34: unknown is never zero).
 */
export type KardexQueueStatus = "PENDING" | "PROCESSING" | "BLOCKED" | "FAILED";

export interface KardexPendingCorrection {
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
  detectedAt: string;
}
