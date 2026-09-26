import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';
import { CardReconciliationSummaryDto } from './card-reconciliation-summary.dto';

/**
 * Owner Dashboard V2 — card reconciliation summary service
 * (architecture spec v0.3 §15, PRD v1.0 §26.2/§19.3).
 *
 * Issue #592 permanent rule: invoice_payments is RLS-protected
 * (parent-owned through invoices), so the read runs inside
 * runInTenantTransaction with a transaction-local tenant binding and joins
 * the tenant-bearing parent. There are NO pooled repository reads.
 *
 * 'Pending' definition (documented limits):
 *  - a card payment row in invoice_payments whose persisted
 *    `reconciliation_status` is exactly 'PENDIENTE' (the column default and
 *    the only pending marker written by the platform);
 *  - the payment's invoice is not canceled (is_canceled = false) — the
 *    current payment lifecycle; invoices are never deleted (DGI), and
 *    invoice_payments carries no soft-delete column;
 *  - card methods follow the existing reporting classification
 *    (sales-reports.service.ts): CARD, TARJETA, BAC, BANPRO (case
 *    insensitive);
 *  - LIMIT: reconciliation_status is a free-form varchar without a CHECK
 *    constraint; any other value (including unknown/garbage) is treated as
 *    NOT pending — conservative, so unknown states cannot inflate
 *    outstanding debt. `reconciled_at` is not consulted: the status column
 *    is the authoritative pending marker.
 *
 * Amount provenance: SUM(invoice_payments.amount_nio), the persisted
 * NIO-normalized amount. Card payments do not carry change_given in
 * practice (over-tender is a cash-only defect, gate pass AG-08), so no
 * change netting is applied. Rows synced with amount_nio = 0 (column
 * default) contribute 0 — a data-quality limit, not a fabrication.
 */
@Injectable()
export class CardReconciliationSummaryService {
  constructor(
    // Bound-read tripwire (#592 pattern): no pooled repository token exists
    // for the RLS-protected tables this service reads; the DataSource is
    // used exclusively to open tenant-bound transactions.
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async getCardReconciliationSummary(
    tenantId: string,
    generatedAt: Date = new Date(),
  ): Promise<CardReconciliationSummaryDto> {
    const rows = await runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) =>
        manager.query<ReconciliationSummaryRow[]>(
          CardReconciliationSummaryService.PENDING_SUMMARY_SQL,
          [tenantId],
        ),
    );

    const row = rows[0];
    return {
      pendingCount: Number(row?.pendingCount ?? 0),
      pendingAmountNio: Number(row?.pendingAmountNio ?? 0),
      oldestPendingAt: row?.oldestPendingAt
        ? new Date(row.oldestPendingAt).toISOString()
        : null,
      generatedAt: generatedAt.toISOString(),
    };
  }

  /**
   * Outstanding-state aggregate (spec §15.2 query filters). The tenant
   * predicate rides the parent invoices join (invoice_payments is
   * parent-owned); it mirrors the RLS binding as defense in depth.
   * Sensitive payload is never selected: no card numbers, no CVV, no
   * authorization data (spec §15.2) — only the aggregate row.
   */
  private static readonly PENDING_SUMMARY_SQL = `
    SELECT
      COUNT(*)::int AS "pendingCount",
      COALESCE(SUM(p.amount_nio), 0)::float8 AS "pendingAmountNio",
      MIN(p.created_at) AS "oldestPendingAt"
    FROM invoice_payments p
    JOIN invoices i ON i.id = p.invoice_id
    WHERE i.tenant_id = $1
      AND i.is_canceled = false
      AND UPPER(p.method) IN ('CARD', 'TARJETA', 'BAC', 'BANPRO')
      AND p.reconciliation_status = 'PENDIENTE'
  `;
}

interface ReconciliationSummaryRow {
  pendingCount: string | number;
  pendingAmountNio: string | number;
  oldestPendingAt: Date | string | null;
}
