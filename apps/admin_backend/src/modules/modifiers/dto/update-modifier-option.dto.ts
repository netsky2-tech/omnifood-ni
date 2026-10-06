import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * Partial update of a modifier option. Setting `is_default=true` triggers
 * the single-default invariant in the service: all sibling options of the
 * same group lose their default in the same transaction.
 */
export class UpdateModifierOptionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsNumber()
  price_delta?: number;

  @IsOptional()
  @IsBoolean()
  is_default?: boolean;

  @IsOptional()
  @IsInt()
  sort_order?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
