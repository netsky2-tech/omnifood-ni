import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * One POS-side card/voucher reconciliation pushed outbound by the terminal
 * sync pass (backlog #68, slice S1b). Field names mirror the reconciliation
 * record built on the POS (`CardVoucherReconciliationViewModel`); the
 * ingestion service maps them onto the `invoice_payments` reconciliation
 * columns.
 *
 * `reconciliationStatus` is deliberately a loose string, not an enum: an
 * unexpected value must fail per-record in the ingestion service
 * (per-record result isolation) instead of rejecting the whole batch with
 * a 400.
 */
export class PaymentReconciliationSyncItemDto {
  /** Immutable local POS payment id; the cloud row is keyed by this id. */
  @IsString()
  @IsNotEmpty()
  paymentId: string;

  /**
   * The invoice the POS believes this payment belongs to. The ingestion
   * service refuses the record when it does not match the cloud payment's
   * invoice (per-record INVOICE_MISMATCH), so a mis-keyed payload can never
   * reconcile the wrong sale's payment.
   */
  @IsString()
  @IsNotEmpty()
  invoiceId: string;

  /** PENDIENTE | CONCILIADO | MANUAL_OVERRIDE (validated per record). */
  @IsString()
  @IsNotEmpty()
  reconciliationStatus: string;

  /** ISO-8601 timestamp as recorded on the terminal. */
  @IsString()
  @IsNotEmpty()
  reconciledAt: string;

  /**
   * The actor recorded on the terminal when the reconciliation was
   * performed. Carried as declared by the operator; see the ingestion
   * service for the authorization semantics.
   */
  @IsString()
  @IsNotEmpty()
  reconciledByUserId: string;

  @IsString()
  @IsOptional()
  voucherCode?: string;

  @IsString()
  @IsOptional()
  batchNumber?: string;

  /**
   * The supervisor credential the operator TYPED at override time
   * (MANUAL_OVERRIDE), carried verbatim. Declared evidence only: it is
   * stored as-is and never validated against `users`. Optional and absent
   * for normal reconciliations, like the other correlation fields.
   */
  @IsString()
  @IsOptional()
  overrideSupervisorRef?: string;

  /**
   * Carried for correlation with the terminal's datafono record. Deliberately
   * NOT written by this slice: the S1b contract enumerates exactly which
   * `invoice_payments` columns the upsert may touch, and `last4` is not one
   * of them.
   */
  @IsString()
  @IsOptional()
  last4?: string;
}

export class PaymentReconciliationSyncBatchDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => PaymentReconciliationSyncItemDto)
  reconciliations: PaymentReconciliationSyncItemDto[] = [];
}
