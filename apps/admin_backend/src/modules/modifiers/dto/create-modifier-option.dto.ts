import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsNotEmpty,
} from 'class-validator';

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
