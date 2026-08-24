import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsEnum,
  Min,
} from 'class-validator';
import { CashMovementType } from '../entities/cash-movement.entity';

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
