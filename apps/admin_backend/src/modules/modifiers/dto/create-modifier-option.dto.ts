import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsNotEmpty,
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
 * Create a modifier option inside a group. `price_delta` is added to the
 * product's base price and MAY be negative: discount modifiers ("sin
 * cebolla") are legitimate, so unlike most money fields there is no
 * @Min(0) — only the decimal column's precision bounds it.
 */
export class CreateModifierOptionDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @Transform(numericStringToNumber)
  @IsOptional()
  @IsNumber()
  price_delta?: number = 0;

  @IsOptional()
  @IsBoolean()
  is_default?: boolean = false;

  @IsOptional()
  @IsInt()
  sort_order?: number = 0;
}
