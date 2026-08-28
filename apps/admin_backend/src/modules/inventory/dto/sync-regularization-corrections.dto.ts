import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RegularizationCorrectionItemDto {
  @IsUUID()
  @IsNotEmpty()
  id: string;

  @IsUUID()
  @IsNotEmpty()
  insumoId: string;

  @IsNotEmpty()
  originMovementId: string;

  @IsNotEmpty()
  triggerMovementId: string;

  @IsNumber()
  previousUnitCostNio: number;

  @IsNumber()
  recalculatedUnitCostNio: number;

  @IsNumber()
  deltaUnitCostNio: number;

  @IsNumber()
  totalDeltaCostNio: number;

  @IsNumber()
  affectedQuantity: number;

  @IsString()
  @IsNotEmpty()
  lineageHash: string;

  @IsString()
  @IsOptional()
  authorizedByUserId?: string;

  @IsString()
  @IsOptional()
  authorizedByRole?: string;

  @IsString()
  @IsOptional()
  authorizationMethod?: string;

  @IsString()
  @IsNotEmpty()
  createdAt: string;
}

export class SyncRegularizationCorrectionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RegularizationCorrectionItemDto)
  corrections: RegularizationCorrectionItemDto[];
}
