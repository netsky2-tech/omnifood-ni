import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsNotEmpty,
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
 * Create a modifier option inside a group. `price_delta` is added to the
 * product's base price and MAY be negative: discount modifiers ("sin
 * cebolla") are legitimate, so unlike most money fields there is no
 * @Min(0) — only the decimal column's precision bounds it.
 *
 * R28 — the option may also declare its INVENTORY effect (the five effects
 * of the industry model). The effect is OPT-IN: an option that declares none
 * is `NONE` and behaves exactly as it does today.
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

  // --- R28: the optional inventory effect -------------------------------

  @IsOptional()
  @IsIn(MODIFIER_INVENTORY_EFFECTS)
  inventory_effect?: (typeof MODIFIER_INVENTORY_EFFECT)[keyof typeof MODIFIER_INVENTORY_EFFECT];

  /** The insumo the effect acts ON: added (ADD) or substituted in (SWAP). */
  @IsOptional()
  @IsUUID('4')
  effect_insumo_id?: string;

  /** The insumo of the recipe component the effect affects. */
  @IsOptional()
  @IsUUID('4')
  effect_target_insumo_id?: string;

  /**
   * The quantity to apply per sold unit, in the affected insumo's own
   * consumption unit. Omitted means INHERIT it from the target component.
   */
  @Transform(numericStringToNumber)
  @IsOptional()
  @IsNumber()
  effect_quantity?: number;

  /** The multiplier of a SCALE (2 = double). */
  @Transform(numericStringToNumber)
  @IsOptional()
  @IsNumber()
  effect_factor?: number;
}
