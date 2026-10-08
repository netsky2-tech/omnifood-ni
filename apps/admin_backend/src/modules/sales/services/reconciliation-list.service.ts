import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';
import { ReconciliationListQueryDto } from '../dto/reconciliation-list-query.dto';
import {
  ReconciliationListItemDto,
  ReconciliationListResponseDto,
} from '../dto/reconciliation-list-item.dto';

/**
 * Paginated reconciliation drill-down list service — the backend half of the
 * dashboard attention band's reconciliation tab.
 *
 * Issue #592 permanent rule (same as card-reconciliation-summary):
 * invoice_payments is RLS-protected (parent-owned through invoices), so the
 * read runs inside runInTenantTransaction with a transaction-local tenant
 * binding and a tenant-parameterized query through the parent join. There
 * are NO pooled repository reads.
 *
 * Row scope (every listing):
 *  - `i.tenant_id = $1` (tenant scope, mirroring the RLS binding as
 *    defense in depth);
 *  - `i.is_canceled = false` (canceled invoices are excluded; invoices are
 *    never deleted per DGI — cancellation is the lifecycle end);
 *  - `p.amount != 0` (zero-amount rows are sync noise, not reconciliations);
 *  - `p.voucher_code IS NOT NULL` (non-voucher reconciliations are out of
 *    scope for this drill-down; the card summary route covers aggregates).
 *
 * Optional filters: `status` pins the free-form reconciliation_status
 * varchar exactly (PENDIENTE / MANUAL_OVERRIDE / CONCILIADO are distinct
 * values, never normalized); `method` pins the payment method; the
 * `startDate`/`endDate` range bounds `p.reconciled_at` — start at midnight
 * of the given day, end inclusive of the full end day. Rows with
 * reconciled_at NULL (still pending) are naturally excluded by the range.
 *
 * Pagination: COUNT(*) over the same WHERE, then ORDER BY p.created_at DESC
 * with LIMIT/OFFSET. No sensitive card payload is ever selected: no last4,
 * no card brand/type, no bank_pos.
 */
@Injectable()
export class ReconciliationListService {
  constructor(
    // Bound-read tripwire (#592 pattern): no pooled repository token exists
    // for the RLS-protected tables this service reads; the DataSource is
    // used exclusively to open tenant-bound transactions.
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async getReconciliationList(
    tenantId: string,
    query: ReconciliationListQueryDto,
  ): Promise<ReconciliationListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const offset = (page - 1) * limit;

    // The tenant id is always parameter $1; every optional filter appends
    // its own bound parameter. The SQL text is built only from this fixed
    // clause set — no user value is ever interpolated.
    const conditions = [
      'i.tenant_id = $1',
      'i.is_canceled = false',
      'p.amount != 0',
      'p.voucher_code IS NOT NULL',
    ];
    const parameters: unknown[] = [tenantId];

    if (query.status) {
      parameters.push(query.status);
      conditions.push(`p.reconciliation_status = $${parameters.length}`);
    }
    if (query.method) {
      parameters.push(query.method);
      conditions.push(`p.method = $${parameters.length}`);
    }

    const startDate = ReconciliationListService.resolveDateBound(query.startDate);
    if (startDate) {
      parameters.push(startDate);
      conditions.push(`p.reconciled_at >= $${parameters.length}`);
    }
    const endDate = ReconciliationListService.resolveDateBound(query.endDate, {
      endOfDay: true,
    });
    if (endDate) {
      parameters.push(endDate);
      conditions.push(`p.reconciled_at <= $${parameters.length}`);
    }

    const whereClause = conditions.join('\n      AND ');

    return runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        const countRows = await manager.query<Array<{ total: string | number }>>(
          `SELECT COUNT(*)::int AS total
             FROM invoice_payments p
             JOIN invoices i ON i.id = p.invoice_id
            WHERE ${whereClause}`,
          parameters,
        );
        const total = Number(countRows[0]?.total ?? 0);

        const rows = await manager.query<ReconciliationRow[]>(
          `SELECT
            p.id AS "paymentId",
            p.invoice_id AS "invoiceId",
            i.invoice_number AS "invoiceNumber",
            p.amount::float8 AS "amount",
            p.amount_nio::float8 AS "amountNio",
            p.currency,
            p.method,
            p.voucher_code AS "voucherCode",
            p.reconciliation_status AS "reconciliationStatus",
            p.reconciled_at AS "reconciledAt",
            p.reconciled_by_user_id AS "reconciledByUserId",
            p.override_supervisor_ref AS "overrideSupervisorRef",
            p.created_at AS "createdAt"
           FROM invoice_payments p
           JOIN invoices i ON i.id = p.invoice_id
           WHERE ${whereClause}
           ORDER BY p.created_at DESC
           LIMIT ${'$' + (parameters.length + 1)}
           OFFSET ${'$' + (parameters.length + 2)}`,
          [...parameters, limit, offset],
        );

        return {
          reconciliations: rows.map(ReconciliationListService.toDto),
          pagination: {
            page,
            limit,
            total,
            totalPages: total === 0 ? 0 : Math.ceil(total / limit),
          },
        };
      },
    );
  }

  /**
   * Resolves an ISO 8601 date string into a concrete bound. A date-only
   * value (YYYY-MM-DD) parses as UTC midnight; for the end bound the whole
   * end day is included (23:59:59.999) so an end-date filter never silently
   * drops same-day reconciliations. An unparseable value resolves to null
   * and is ignored (the ValidationPipe type contract keeps values strings).
   */
  private static resolveDateBound(
    value: string | undefined,
    options: { endOfDay?: boolean } = {},
  ): Date | null {
    if (!value) {
      return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    if (options.endOfDay && value.length === 10) {
      return new Date(parsed.getTime() + 24 * 60 * 60 * 1000 - 1);
    }
    return parsed;
  }

  private static toDto(row: ReconciliationRow): ReconciliationListItemDto {
    return {
      paymentId: row.paymentId,
      invoiceId: row.invoiceId,
      invoiceNumber: row.invoiceNumber ?? null,
      amount: Number(row.amount),
      amountNio: Number(row.amountNio),
      currency: row.currency,
      method: row.method,
      voucherCode: row.voucherCode ?? null,
      reconciliationStatus: row.reconciliationStatus,
      reconciledAt: row.reconciledAt
        ? new Date(row.reconciledAt).toISOString()
        : null,
      reconciledByUserId: row.reconciledByUserId ?? null,
      overrideSupervisorRef: row.overrideSupervisorRef ?? null,
      createdAt: new Date(row.createdAt).toISOString(),
    };
  }
}

interface ReconciliationRow {
  paymentId: string;
  invoiceId: string;
  invoiceNumber: string | null;
  amount: string | number;
  amountNio: string | number;
  currency: string;
  method: string;
  voucherCode: string | null;
  reconciliationStatus: string;
  reconciledAt: Date | string | null;
  reconciledByUserId: string | null;
  overrideSupervisorRef: string | null;
  createdAt: Date | string;
}
