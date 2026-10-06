import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Payment } from '../entities/payment.entity';
import type {
  PaymentReconciliationSyncBatchDto,
  PaymentReconciliationSyncItemDto,
} from '../dto/payment-reconciliation-sync.dto';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';

export type PaymentReconciliationSyncStatus = 'ACCEPTED' | 'FAILED';

export type PaymentReconciliationFailureCode =
  | 'INVALID_STATUS'
  | 'UNKNOWN_PAYMENT'
  | 'INVOICE_MISMATCH'
  | 'PERSISTENCE_ERROR';

/**
 * Per-record rejection for a `reconciliationStatus` outside the documented
 * payment domain {PENDIENTE, CONCILIADO, MANUAL_OVERRIDE} (POS
 * `card_voucher_reconciliation_view_model.dart` writes CONCILIADO /
 * MANUAL_OVERRIDE; the column default and the sale-sync channel carry
 * PENDIENTE). The DTO keeps the status a loose string on purpose: an
 * unexpected value must fail THIS record in the ingestion service
 * (per-record result isolation) instead of rejecting the whole batch with
 * a 400.
 */
export class InvalidReconciliationStatusError extends Error {
  constructor(readonly status: string) {
    super(
      `Unrecognized reconciliation status '${status}'; expected one of ${ALLOWED_RECONCILIATION_STATUSES.join(', ')}`,
    );
    this.name = 'InvalidReconciliationStatusError';
  }
}

/**
 * The payment id is unknown under the caller tenant: the reconciliation
 * arrived before its sale synced, or the id is wrong. Always an explicit
 * per-record failure, never a silent success and never a row insert.
 */
export class UnknownPaymentError extends Error {
  constructor(readonly paymentId: string) {
    super(
      `Payment '${paymentId}' not found under the caller tenant; the sale must sync before its reconciliation`,
    );
    this.name = 'UnknownPaymentError';
  }
}

/** The payload's invoiceId does not match the cloud payment's invoice. */
export class InvoiceMismatchError extends Error {
  constructor(
    readonly paymentId: string,
    readonly expectedInvoiceId: string,
    readonly receivedInvoiceId: string,
  ) {
    super(
      `Payment '${paymentId}' belongs to invoice '${expectedInvoiceId}', but the reconciliation claims invoice '${receivedInvoiceId}'`,
    );
    this.name = 'InvoiceMismatchError';
  }
}

/**
 * The full reconciliation domain of `invoice_payments.reconciliation_status`.
 * PENDIENTE is a legal pushed value: the sale-sync channel already carries it
 * and a terminal may legitimately re-declare a still-pending payment.
 */
export const ALLOWED_RECONCILIATION_STATUSES = [
  'PENDIENTE',
  'CONCILIADO',
  'MANUAL_OVERRIDE',
] as const;

export interface PaymentReconciliationResultItem {
  /** The immutable local POS payment id. */
  paymentId: string;
  status: PaymentReconciliationSyncStatus;
  code?: PaymentReconciliationFailureCode;
  message?: string;
}

export interface PaymentReconciliationSyncResult {
  received: number;
  processed: number;
  failed: number;
  results: PaymentReconciliationResultItem[];
}

export interface PaymentReconciliationSyncBatch {
  reconciliations: PaymentReconciliationSyncItemDto[];
}

/**
 * Ingestion for POS-pushed card/voucher reconciliations (backlog #68,
 * slice S1b). A reconciliation happens on the terminal AFTER the sale
 * synced, and re-pushing the sale is a dead end (same idempotency key →
 * DUPLICATE_REPLAY; the payload hash excludes reconciliation fields), so
 * this is a dedicated payment-level upsert:
 *
 * - Upsert `invoice_payments` BY PAYMENT ID, update-only: the row is owned
 *   by the sale sync, so an unknown payment id is an explicit
 *   UNKNOWN_PAYMENT failure, never an insert and never a silent success.
 * - Only the reconciliation columns are written (`voucher_code`,
 *   `reconciliation_status`, `reconciled_at`, `reconciled_by_user_id`,
 *   `batch_number`). Never amounts, never the method, never anything else
 *   on the row: the sale's fiscal snapshot is immutable.
 * - Replays are naturally idempotent: the same batch writes the same
 *   values onto the same row, no duplicate rows, no shifted timestamp.
 *
 * Every read and write runs inside a transaction whose RLS context is
 * bound to the authenticated device principal's tenant, so a payment
 * persisted by a DIFFERENT tenant is simply invisible → UNKNOWN_PAYMENT.
 * One bad record never aborts the rest of the batch.
 */
@Injectable()
export class PaymentReconciliationSyncIngestionService {
  private readonly logger = new Logger(
    PaymentReconciliationSyncIngestionService.name,
  );

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,
  ) {}

  async ingestReconciliationBatch(
    tenantId: string,
    batch: PaymentReconciliationSyncBatchDto,
  ): Promise<PaymentReconciliationSyncResult> {
    return runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager: EntityManager) => {
        const paymentsRepo = manager.getRepository(Payment);
        const results: PaymentReconciliationResultItem[] = [];
        let processed = 0;
        let failed = 0;

        for (const record of batch.reconciliations) {
          try {
            await this.applyReconciliation(record, paymentsRepo);
            processed += 1;
            results.push({
              paymentId: record.paymentId,
              status: 'ACCEPTED',
            });
          } catch (error: unknown) {
            failed += 1;
            results.push(
              this.toFailure(tenantId, record.paymentId, error),
            );
          }
        }

        return {
          received: batch.reconciliations.length,
          processed,
          failed,
          results,
        };
      },
    );
  }

  private async applyReconciliation(
    record: PaymentReconciliationSyncItemDto,
    paymentsRepo: Repository<Payment>,
  ): Promise<void> {
    this.requireAllowedStatus(record.reconciliationStatus);
    // The RLS context bound on this transaction scopes this lookup to the
    // caller tenant: another tenant's payment is invisible here, which is
    // exactly the tenant-isolation behaviour (it fails as UNKNOWN_PAYMENT).
    const existing = await paymentsRepo.findOne({
      where: { id: record.paymentId },
    });
    if (!existing) {
      throw new UnknownPaymentError(record.paymentId);
    }
    if (existing.invoiceId !== record.invoiceId) {
      throw new InvoiceMismatchError(
        record.paymentId,
        existing.invoiceId,
        record.invoiceId,
      );
    }
    await paymentsRepo.update(
      { id: existing.id },
      this.toReconciliationValues(record),
    );
  }

  /**
   * Maps the POS payload onto the reconciliation columns of
   * `invoice_payments`. This is the ENTIRE write surface of this slice:
   * amounts (`amount`, `amount_nio`, `change_given`), the method, the
   * currency and the exchange rate are owned by the sale sync and are
   * never included here.
   *
   * ACTOR SEMANTICS — `reconciled_by_user_id` is an OPERATOR-DECLARED
   * actor, NOT a verified authorization. Terminal authorization hardening
   * (supervisor/PIN/TOTP on reconcile and override) is a separate backlog
   * item and has not landed; until it does, this column records who the
   * terminal SAYS performed the reconciliation. Do not read this column as
   * a verified approval in reports, dashboards, or audits.
   */
  private toReconciliationValues(
    record: PaymentReconciliationSyncItemDto,
  ): Partial<Payment> {
    return {
      voucherCode: record.voucherCode ?? null,
      reconciliationStatus: record.reconciliationStatus,
      reconciledAt: new Date(record.reconciledAt),
      reconciledByUserId: record.reconciledByUserId,
      batchNumber: record.batchNumber ?? null,
    };
  }

  private requireAllowedStatus(status: string): void {
    if (
      !(ALLOWED_RECONCILIATION_STATUSES as readonly string[]).includes(status)
    ) {
      throw new InvalidReconciliationStatusError(status);
    }
  }

  private toFailure(
    tenantId: string,
    paymentId: string,
    error: unknown,
  ): PaymentReconciliationResultItem {
    const code: PaymentReconciliationFailureCode =
      error instanceof InvalidReconciliationStatusError
        ? 'INVALID_STATUS'
        : error instanceof UnknownPaymentError
          ? 'UNKNOWN_PAYMENT'
          : error instanceof InvoiceMismatchError
            ? 'INVOICE_MISMATCH'
            : 'PERSISTENCE_ERROR';
    const message =
      error instanceof Error
        ? error.message
        : (JSON.stringify(error) ?? 'unknown error');
    this.logger.warn(
      `[PAYMENT-RECONCILIATION-SYNC] payment=${paymentId} tenant=${tenantId} ` +
        `status=FAILED code=${code}: ${message}`,
    );
    return { paymentId, status: 'FAILED', code, message };
  }
}
