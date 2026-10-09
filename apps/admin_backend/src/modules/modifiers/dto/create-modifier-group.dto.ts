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
 * Create a reusable modifier group. `min_selected >= 0` (0 = optional) and
 * `max_selected >= 1`; the service additionally enforces
 * `max_selected >= min_selected`, mirroring the DB check
 * `chk_modifier_groups_max_gte_min`.
 */
export class CreateModifierGroupDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @Transform(numericStringToNumber)
  @IsOptional()
  @IsInt()
  @Min(0)
  min_selected?: number = 0;

  @Transform(numericStringToNumber)
  @IsOptional()
  @IsInt()
  @Min(1)
  max_selected?: number = 1;

  @IsOptional()
  @IsBoolean()
  allow_quantities?: boolean = false;

  @Transform(numericStringToNumber)
  @IsOptional()
  @IsInt()
  sort_order?: number = 0;
}
