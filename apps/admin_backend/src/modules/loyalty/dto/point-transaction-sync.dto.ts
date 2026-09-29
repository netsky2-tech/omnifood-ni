import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * One POS-side loyalty point transaction pushed outbound by the terminal
 * sync pass (Batch 5 slice 5b, finding H2). Field names mirror the POS
 * entity payload built in `SyncService._buildLoyaltyPointTransactionPayload`.
 *
 * `loyaltyProgramId` is optional on purpose: legacy terminal rows (see
 * `LoyaltyEarningHandler`) carry no program attribution. Such records are
 * written to the ledger without a program projection (the projection is
 * keyed by program and cannot hold program-less balances).
 */
export class LoyaltyPointTransactionSyncItemDto {
  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;

  @IsUUID()
  customerId: string;

  @IsUUID()
  @IsOptional()
  loyaltyProgramId?: string;

  @IsString()
  @IsNotEmpty()
  transactionType: string;

  @IsNumber()
  units: number;

  @IsString()
  @IsOptional()
  ticketId?: string;

  @IsUUID()
  @IsOptional()
  rewardId?: string;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsString()
  @IsOptional()
  reversalOfTransactionId?: string;

  @IsString()
  @IsOptional()
  sourceEventId?: string;

  @IsString()
  @IsOptional()
  actorUserId?: string;

  @IsString()
  @IsOptional()
  branchId?: string;

  @IsString()
  @IsOptional()
  terminalId?: string;

  @IsNumber()
  @IsOptional()
  programVersion?: number;

  @IsNumber()
  @IsOptional()
  rewardVersion?: number;

  @IsObject()
  @IsOptional()
  commercialSnapshot?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  origin?: string;

  /** ISO-8601 timestamp as sent by the POS. */
  @IsString()
  @IsOptional()
  occurredAt?: string;
}

export class LoyaltyPointTransactionSyncBatchDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => LoyaltyPointTransactionSyncItemDto)
  transactions: LoyaltyPointTransactionSyncItemDto[];
}
