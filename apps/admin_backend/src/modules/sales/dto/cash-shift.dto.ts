import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CashMovementType } from '../entities/cash-movement.entity';
import { CashShiftStatus } from '../entities/cash-shift.entity';

export class OpenCashShiftDto {
  @IsString()
  @IsNotEmpty()
  terminalId: string;

  @IsString()
  @IsNotEmpty()
  cashierId: string;

  @IsString()
  @IsNotEmpty()
  cashierName: string;

  @IsNumber()
  @Min(0)
  initialFloatNio: number;

  @IsNumber()
  @Min(0)
  initialFloatUsd: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class RecordCashMovementRequestDto {
  @IsString()
  @IsNotEmpty()
  terminalId: string;

  @IsEnum(CashMovementType)
  type: CashMovementType;

  @IsNumber()
  @Min(0)
  amountNio: number;

  @IsNumber()
  @Min(0)
  amountUsd: number;

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsString()
  @IsOptional()
  authorizedByUserId?: string;
}

export class CloseCashShiftDto {
  @IsNumber()
  @Min(0)
  finalCountedNio: number;

  @IsNumber()
  @Min(0)
  finalCountedUsd: number;

  @IsString()
  @IsOptional()
  supervisorId?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

/**
 * Query params for the owner-dashboard cash-session list (GET /sales/shifts).
 * `status` filters by lifecycle state; `limit` caps the page size with a sane
 * default so the oversight surface never pulls an unbounded result set.
 */
export class ListCashShiftsQueryDto {
  @IsOptional()
  @IsEnum(CashShiftStatus)
  status?: CashShiftStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
