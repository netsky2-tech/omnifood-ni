import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/**
 * Integer fields arrive as strings whenever a client echoes a form payload
 * back verbatim. This transform coerces numerically-valid strings to
 * numbers BEFORE validation; genuinely non-numeric input (including blank
 * strings, which Number() would coerce to 0) still fails @IsInt. Same
 * transform doctrine as the fiscal DTOs (blankStringToNull).
 */
const numericStringToNumber = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed === '') return value;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : value;
};

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

  @Transform(numericStringToNumber)
  @IsOptional()
  @IsInt()
  @Min(0)
  min_selected?: number;

  @Transform(numericStringToNumber)
  @IsOptional()
  @IsInt()
  @Min(1)
  max_selected?: number;

  @IsOptional()
  @IsBoolean()
  allow_quantities?: boolean;

  @Transform(numericStringToNumber)
  @IsOptional()
  @IsInt()
  sort_order?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
