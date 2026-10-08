/**
 * One reconciliation row of the paginated drill-down list
 * (GET /sales/reports/reconciliations) consumed by the dashboard attention
 * band's reconciliation tab.
 *
 * Provenance: invoice_payments p JOIN invoices i ON i.id = p.invoice_id,
 * tenant-scoped through the parent join (issue #592 permanent rule:
 * invoice_payments is RLS-protected, parent-owned through invoices).
 * Only voucher-bearing, non-zero-amount payments on non-canceled invoices
 * are listed. No sensitive card payload is ever exposed: no last4, no
 * card brand/type, no bank_pos.
 */
export class ReconciliationListItemDto {
  /** invoice_payments.id */
  paymentId!: string;
  /** invoices.id (the parent) */
  invoiceId!: string;
  /** Fiscal document number of the parent invoice (DGI: never deleted). */
  invoiceNumber?: string | null;
  /** Payment amount in its original currency. */
  amount!: number;
  /** Persisted NIO-normalized amount. */
  amountNio!: number;
  currency!: string;
  method!: string;
  voucherCode?: string | null;
  /**
   * Free-form reconciliation_status varchar ('PENDIENTE',
   * 'MANUAL_OVERRIDE', 'CONCILIADO', ...). No CHECK constraint exists, so
   * the value is surfaced verbatim.
   */
  reconciliationStatus!: string;
  /** ISO 8601; null while the row is still PENDIENTE. */
  reconciledAt?: string | null;
  reconciledByUserId?: string | null;
  /** Supervisor authorization reference (migration 1809600000000). */
  overrideSupervisorRef?: string | null;
  /** ISO 8601 creation timestamp of the payment row. */
  createdAt!: string;
}

/** Page metadata for the reconciliation drill-down list. */
export class ReconciliationListPaginationDto {
  page!: number;
  limit!: number;
  /** Total voucher-bearing rows matching the filters (before pagination). */
  total!: number;
  /** ceil(total / limit); 0 when total is 0. */
  totalPages!: number;
}

/** Response contract of GET /sales/reports/reconciliations. */
export class ReconciliationListResponseDto {
  reconciliations!: ReconciliationListItemDto[];
  pagination!: ReconciliationListPaginationDto;
}
