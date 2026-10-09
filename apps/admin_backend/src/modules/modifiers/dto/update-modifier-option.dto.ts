import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * A client that read a Postgres decimal and sent the same value back must
 * not be rejected for echoing it: node-postgres hands `numeric` back as a
 * string, so a form that round-trips a stored `price_delta` submits
 * `"0.00"`. This transform coerces numerically-valid strings to numbers
 * BEFORE validation and only genuinely non-numeric input (including blank
 * strings, which Number() would coerce to 0) still fails @IsNumber. Same
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
 * Partial update of a modifier option. Setting `is_default=true` triggers
 * the single-default invariant in the service: all sibling options of the
 * same group lose their default in the same transaction.
 */
export class UpdateModifierOptionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @Transform(numericStringToNumber)
  @IsOptional()
  @IsNumber()
  price_delta?: number;

  @IsOptional()
  @IsBoolean()
  is_default?: boolean;

  @Transform(numericStringToNumber)
  @IsOptional()
  @IsInt()
  sort_order?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
