/**
 * Owner Dashboard V2 — card reconciliation summary read model
 * (architecture spec v0.3 §15, PRD v1.0 §26.2).
 *
 * Outstanding-state scoped, NOT date-range scoped (spec §15.1): an
 * unresolved voucher from yesterday remains operationally relevant today.
 * The Dashboard labels this as current outstanding state, never as
 * "for selected period".
 */
export class CardReconciliationSummaryDto {
  /** Card payments whose persisted reconciliation_status is still PENDIENTE. */
  pendingCount!: number;

  /**
   * Sum of the persisted NIO payment amounts over the pending rows.
   * Provenance: invoice_payments.amount_nio (the cloud-mirrored NIO amount).
   */
  pendingAmountNio!: number;

  /**
   * created_at (ISO 8601) of the oldest pending row — the pending-age
   * anchor; null when nothing is pending.
   */
  oldestPendingAt!: string | null;

  /** Report generation time — technical metadata only. */
  generatedAt!: string;

  /** Card payments whose persisted reconciliation_status is MANUAL_OVERRIDE. */
  manualOverrideCount!: number;

  /**
   * Sum of the persisted NIO payment amounts over the manual-override rows.
   * Provenance: invoice_payments.amount_nio (same column as pendingAmountNio).
   */
  manualOverrideAmountNio!: number;
}
