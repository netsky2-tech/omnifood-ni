export class RecipeDetailResponseDto {
  id: string;

  tenant_id: string;

  recipe_version_id: string;

  insumo_id: string;

  quantity: number;

  gross_quantity: number;

  technical_shrink_pct: number;

  ingredient_name: string | null;

  ingredient_type: string;

  component_uom: string | null;

  reference_version_id: string | null;
}

export class RecipeVersionResponseDto {
  id: string;

  tenant_id: string;

  product_id: string;

  version_number: number;

  is_active: boolean;

  fecha_inicio_vigencia: Date | null;

  fecha_fin_vigencia: Date | null;

  pos_document_id: string | null;

  product_name: string | null;

  yield_quantity: number;

  technical_shrink_pct: number;

  version_note: string | null;

  pos_created_at: Date | null;

  published_at: Date | null;

  created_at: Date;
}

export class RecipeVersionSnapshotResponseDto {
  recipeVersion: RecipeVersionResponseDto;

  components: RecipeDetailResponseDto[];
}

/**
 * #523 T4 — one row of the pending-suggestion list: a recipe version created
 * by an industry template that is still DRAFT and needs human review.
 */
export class RecipeSuggestionListItemDto {
  recipeVersionId: string;

  productId: string;

  productName: string;

  versionNumber: number;

  componentCount: number;

  /** True when an active PUBLISHED version already exists for the product. */
  hasActivePublishedVersion: boolean;
}
