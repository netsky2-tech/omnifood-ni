import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

const SHRINKAGE_TARGET_TYPE = {
  INSUMO: 'INSUMO',
  PRODUCT: 'PRODUCT',
} as const;

export type ShrinkageTargetType =
  (typeof SHRINKAGE_TARGET_TYPE)[keyof typeof SHRINKAGE_TARGET_TYPE];

export class CreateShrinkageDto {
  @IsEnum(SHRINKAGE_TARGET_TYPE)
  @IsOptional()
  targetType?: ShrinkageTargetType;

  @IsUUID()
  @IsOptional()
  insumoId: string;

  @IsUUID()
  @IsOptional()
  productId?: string;

  @IsUUID()
  @IsOptional()
  recipeVersionId?: string;

  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @IsString()
  reason: string;

  @IsString()
  observation: string;
}
