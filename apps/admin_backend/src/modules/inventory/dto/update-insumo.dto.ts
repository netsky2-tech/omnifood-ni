import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { NEGATIVE_STOCK_POLICY, type NegativeStockPolicy } from '../entities/insumo.entity';

export class UpdateInsumoDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  purchaseUom?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  consumptionUom?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  conversionFactor?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  parLevel?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minStock?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  averageCost?: number;

  @IsOptional()
  @IsBoolean()
  is_perishable?: boolean;

  @IsOptional()
  @IsIn([
    NEGATIVE_STOCK_POLICY.ALLOW_TEMPORARY,
    NEGATIVE_STOCK_POLICY.RESTRICT,
  ])
  negativeStockPolicy?: NegativeStockPolicy;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  warehouse_id?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
