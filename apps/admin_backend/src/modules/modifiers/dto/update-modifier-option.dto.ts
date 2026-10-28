import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import {
  MODIFIER_INVENTORY_EFFECT,
  MODIFIER_INVENTORY_EFFECTS,
} from '../modifier-inventory-effect';

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
 *
 * R28 — the inventory effect is part of the update. Declaring
 * `inventory_effect: 'NONE'` (or clearing the insumo/quantity/factor) takes
 * the option back to price-only.
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

  // --- R28: the optional inventory effect -------------------------------

  @IsOptional()
  @IsIn(MODIFIER_INVENTORY_EFFECTS)
  inventory_effect?: (typeof MODIFIER_INVENTORY_EFFECT)[keyof typeof MODIFIER_INVENTORY_EFFECT];

  @IsOptional()
  @IsUUID('4')
  effect_insumo_id?: string;

  @IsOptional()
  @IsUUID('4')
  effect_target_insumo_id?: string;

  @Transform(numericStringToNumber)
  @IsOptional()
  @IsNumber()
  effect_quantity?: number;

  @Transform(numericStringToNumber)
  @IsOptional()
  @IsNumber()
  effect_factor?: number;
}
