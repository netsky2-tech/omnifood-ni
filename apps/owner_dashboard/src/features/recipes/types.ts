export type IngredientType = 'INSUMO' | 'SUB_RECIPE';

export const INGREDIENT_TYPES: { id: IngredientType; label: string }[] = [
  { id: 'INSUMO', label: 'Insumo' },
  { id: 'SUB_RECIPE', label: 'Sub-receta' },
];

export interface RecipeComponent {
  ingredientId: string;
  ingredientName: string;
  ingredientType: IngredientType;
  grossQuantity: number;
  technicalShrinkPct: number;
  referenceVersionId?: string | null;
  componentUom?: string | null;
}

export interface CreateRecipeVersionInput {
  productId: string;
  productName: string;
  versionNumber: number;
  yieldQuantity: number;
  technicalShrinkPct: number;
  versionNote?: string | null;
  effectiveAt?: string | null;
  components: RecipeComponent[];
}

export interface RecipeDetail {
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

export interface RecipeVersion {
  id: string;
  tenant_id: string;
  product_id: string;
  version_number: number;
  is_active: boolean;
  fecha_inicio_vigencia: string | null;
  fecha_fin_vigencia: string | null;
  pos_document_id: string | null;
  product_name: string | null;
  yield_quantity: number;
  technical_shrink_pct: number;
  version_note: string | null;
  pos_created_at: string | null;
  published_at: string | null;
  created_at: string;
}

export interface RecipeSnapshot {
  recipeVersion: RecipeVersion;
  components: RecipeDetail[];
}

export interface Insumo {
  id: string;
  tenant_id: string;
  name: string;
  consumption_uom: string;
  stock: number;
  averageCost: number;
  is_active: boolean;
}