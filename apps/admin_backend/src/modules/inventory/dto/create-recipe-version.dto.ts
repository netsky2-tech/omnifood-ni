import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export const INGREDIENT_TYPE = {
  INSUMO: 'INSUMO',
  SUB_RECIPE: 'SUB_RECIPE',
} as const;

export type IngredientType =
  (typeof INGREDIENT_TYPE)[keyof typeof INGREDIENT_TYPE];

export class RecipeVersionComponentDto {
  @IsUUID('4')
  ingredientId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  ingredientName: string;

  @IsIn(Object.values(INGREDIENT_TYPE))
  ingredientType: IngredientType;

  @IsNumber()
  @Min(0.0001)
  grossQuantity: number;

  @IsNumber()
  @Min(0)
  @Max(99.9999)
  technicalShrinkPct: number;

  @IsOptional()
  @IsUUID('4')
  referenceVersionId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  componentUom?: string | null;
}

export class CreateRecipeVersionDto {
  @IsUUID('4')
  productId: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  productName: string;

  @IsNumber()
  @Min(1)
  versionNumber: number;

  @IsNumber()
  @Min(0.0001)
  yieldQuantity: number;

  @IsNumber()
  @Min(0)
  @Max(99.9999)
  technicalShrinkPct: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  versionNote?: string | null;

  @IsOptional()
  @IsString()
  effectiveAt?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecipeVersionComponentDto)
  components: RecipeVersionComponentDto[];
}
