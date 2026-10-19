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

/**
 * One row of the Recetas grid: a product with an ACTIVE PUBLISHED recipe.
 *
 * `estimatedCostNio` is the theoretical unit cost of the recipe (the batch
 * cost of the components at their current CPP, divided by the yield) — the
 * same figure the "Costo por plato" report shows. It is null when the
 * recipe cannot be priced, and `costUnavailableReason` then carries the
 * operator-facing explanation.
 */
export interface ActiveRecipeSummary {
  productId: string;
  productName: string;
  productUom: string | null;
  recipeVersionId: string;
  versionNumber: number;
  componentCount: number;
  yieldQuantity: number;
  technicalShrinkPct: number;
  versionNote: string | null;
  effectiveAt: string | null;
  estimatedCostNio: number | null;
  costUnavailableReason: string | null;
}

export interface RecipeSuggestionListItem {
  recipeVersionId: string;
  productId: string;
  productName: string;
  versionNumber: number;
  componentCount: number;
  /** True when an active PUBLISHED version already exists for the product. */
  hasActivePublishedVersion: boolean;
}

export interface Insumo {
  id: string;
  tenant_id: string;
  name: string;
  purchaseUom?: string;
  consumptionUom?: string;
  conversionFactor?: number;
  stock: number;
  averageCost: number;
  parLevel?: number | null;
  minStock?: number | null;
  is_perishable?: boolean;
  negativeStockPolicy?: string;
  is_active: boolean;
  ivaRatePct?: number | null;
}

export interface CreateInsumoInput {
  name: string;
  purchaseUom: string;
  consumptionUom: string;
  conversionFactor?: number;
  parLevel?: number;
  minStock?: number;
  averageCost?: number;
  is_perishable?: boolean;
  negativeStockPolicy?: 'ALLOW_TEMPORARY' | 'RESTRICT';
  warehouse_id?: string;
  ivaRatePct?: number | null;
}

export interface UpdateInsumoInput extends Partial<CreateInsumoInput> {
  is_active?: boolean;
}