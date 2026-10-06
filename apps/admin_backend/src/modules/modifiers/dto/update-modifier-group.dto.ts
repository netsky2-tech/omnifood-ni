import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/**
 * Partial update of a modifier group. `is_active` may be passed to
 * reactivate a soft-deleted group. The service validates the
 * `max_selected >= min_selected` invariant against the MERGED values.
 */
export class UpdateModifierGroupDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  min_selected?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  max_selected?: number;

  @IsOptional()
  @IsBoolean()
  allow_quantities?: boolean;

  @IsOptional()
  @IsInt()
  sort_order?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
