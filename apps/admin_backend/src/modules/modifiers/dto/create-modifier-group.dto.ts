import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

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

  @IsOptional()
  @IsInt()
  @Min(0)
  min_selected?: number = 0;

  @IsOptional()
  @IsInt()
  @Min(1)
  max_selected?: number = 1;

  @IsOptional()
  @IsBoolean()
  allow_quantities?: boolean = false;

  @IsOptional()
  @IsInt()
  sort_order?: number = 0;
}
