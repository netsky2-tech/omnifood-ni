import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * One POS-side cash shift session pushed outbound by the terminal sync pass
 * (Batch 5 slice 5c, finding H3). Field names mirror the payload built in
 * `SyncService._buildCashShiftSessionPayload`; the ingestion service maps
 * them onto the `cash_shift_sessions` columns.
 *
 * `status` is deliberately a loose string, not an enum: an unexpected value
 * must fail per-record in the ingestion service (per-record result
 * isolation) instead of rejecting the whole batch with a 400.
 */
export class CashShiftSessionSyncItemDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  terminalId: string;

  @IsString()
  @IsNotEmpty()
  cashierId: string;

  /**
   * Optional on purpose: terminal session rows carry only the cashier user
   * id. When absent, the ingestion service falls back to the cashier id so
   * the NOT NULL `cashier_name` column stays satisfied.
   */
  @IsString()
  @IsOptional()
  cashierName?: string;

  /** ISO-8601 timestamps as sent by the POS. */
  @IsString()
  @IsNotEmpty()
  openedAt: string;

  @IsString()
  @IsOptional()
  closedAt?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsNumber()
  @IsOptional()
  initialFloatNio?: number;

  @IsNumber()
  @IsOptional()
  initialFloatUsd?: number;

  @IsNumber()
  @IsOptional()
  finalCountedNio?: number;

  @IsNumber()
  @IsOptional()
  finalCountedUsd?: number;

  @IsNumber()
  @IsOptional()
  expectedCashNio?: number;

  @IsNumber()
  @IsOptional()
  expectedCashUsd?: number;

  @IsNumber()
  @IsOptional()
  differenceNio?: number;

  @IsNumber()
  @IsOptional()
  differenceUsd?: number;

  @IsNumber()
  @IsOptional()
  zReportSequence?: number;

  /**
   * S2 (backlog #68): the shift's card-voucher reconciliation state at
   * close time — counts of the card payments attached to the shift's
   * invoices by reconciliation status (PENDIENTE / CONCILIADO /
   * MANUAL_OVERRIDE). Optional on purpose: legacy terminals never send
   * them, and a still-OPEN session legitimately omits them (the counts
   * are a close-time fact). When absent, the ingestion service maps NULL
   * into the columns so the dashboard can distinguish "no data" from a
   * genuine zero.
   */
  @IsNumber()
  @IsOptional()
  cardVouchersPending?: number;

  @IsNumber()
  @IsOptional()
  cardVouchersReconciled?: number;

  @IsNumber()
  @IsOptional()
  cardVouchersOverridden?: number;

  @IsString()
  @IsOptional()
  supervisorId?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

/**
 * One POS-side cash movement ( petty cash / safe drop / cash in/out)
 * pushed outbound with its shift batch. Movements are immutable once
 * created, so ingestion is insert-if-absent.
 */
export class CashMovementSyncItemDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  shiftId: string;

  @IsString()
  @IsNotEmpty()
  terminalId: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsNumber()
  @IsOptional()
  amountNio?: number;

  @IsNumber()
  @IsOptional()
  amountUsd?: number;

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsString()
  @IsOptional()
  authorizedByUserId?: string;

  @IsString()
  @IsNotEmpty()
  timestamp: string;
}

export class CashShiftSyncBatchDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CashShiftSessionSyncItemDto)
  sessions: CashShiftSessionSyncItemDto[] = [];

  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CashMovementSyncItemDto)
  movements: CashMovementSyncItemDto[] = [];
}
