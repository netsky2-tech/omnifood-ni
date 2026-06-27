import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * POS ingredient type values reported by `RecipeVersionComponentDocument` in
 * the Flutter app. The backend ingest slice persists only INSUMO components;
 * SUB_RECIPE components are rejected (multi-level versioned BOM ingestion is
 * deferred — see docs/plans/inventory/batch_02_recipes.md).
 */
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
  componentUom?: string | null;
}

/**
 * Payload posted by `SyncService._buildRecipeVersionPayload` to
 * `POST /inventory/recipes/versions`.
 */
export class SyncRecipeVersionDocumentDto {
  @IsUUID('4')
  id: string;

  @IsUUID('4')
  productId: string;

  @IsString()
  @IsNotEmpty()
  productName: string;

  @IsInt()
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
  versionNote?: string | null;

  @IsDateString()
  createdAt: string;

  @IsOptional()
  @IsDateString()
  publishedAt?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecipeVersionComponentDto)
  components: RecipeVersionComponentDto[];
}
