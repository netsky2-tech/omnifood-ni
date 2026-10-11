import { api, type ApiClientMethodOptions } from '@/lib/api';
import type {
  RecipeSnapshot,
  RecipeSuggestionListItem,
  CreateRecipeVersionInput,
  Insumo,
  CreateInsumoInput,
  UpdateInsumoInput,
} from './types';

/**
 * Canonical cache key for the pending recipe-suggestions list. Every observer
 * (the usePendingSuggestions hook, the page-level tab badge, and the publish
 * invalidation) must build its key through this builder so the shared cache
 * entry cannot silently drift apart. Lives here, not in use-recipes.ts, so
 * consumers that cannot import from the hook module can still share it.
 */
export function suggestionsQueryKey(tenantId: string) {
  return ['recipes', tenantId, 'suggestions'] as const;
}

export function insumosQueryKey(tenantId: string) {
  return ['recipes', tenantId, 'insumos'] as const;
}

export function fetchActiveRecipe(productId: string, opts?: ApiClientMethodOptions) {
  return api.get<RecipeSnapshot>(`/recipes/products/${productId}/active`, opts);
}

export function fetchRecipeSnapshot(recipeVersionId: string, opts?: ApiClientMethodOptions) {
  return api.get<RecipeSnapshot>(`/recipes/${recipeVersionId}/snapshot`, opts);
}

/** Round-2 §17.6 S3: one product's recipe versions for the SUB_RECIPE
 * reference selector. Selected columns only — identity, number, vigencia
 * and note. */
export interface RecipeVersionOption {
  id: string;
  version_number: number;
  is_active: boolean;
  version_note: string | null;
  fecha_inicio_vigencia: string | null;
  fecha_fin_vigencia: string | null;
  published_at: string | null;
}

export function fetchRecipeVersions(
  productId: string,
  opts?: ApiClientMethodOptions,
) {
  return api.get<RecipeVersionOption[]>(
    `/recipes/products/${productId}/versions`,
    opts,
  );
}

export function createRecipeVersion(
  productId: string,
  input: CreateRecipeVersionInput,
  opts?: ApiClientMethodOptions,
) {
  return api.post<RecipeSnapshot>(`/recipes/products/${productId}/versions`, input, opts);
}

export function fetchInsumos(opts?: ApiClientMethodOptions) {
  return api.get<Insumo[]>('/insumos', opts);
}

export function createInsumo(input: CreateInsumoInput, opts?: ApiClientMethodOptions) {
  return api.post<Insumo>('/insumos', input, opts);
}

export function updateInsumo(id: string, input: UpdateInsumoInput, opts?: ApiClientMethodOptions) {
  return api.put<Insumo>(`/insumos/${id}`, input, opts);
}

export function fetchPendingSuggestions(opts?: ApiClientMethodOptions) {
  return api.get<RecipeSuggestionListItem[]>('/recipes/suggestions', opts);
}

export function publishRecipeVersion(recipeVersionId: string, opts?: ApiClientMethodOptions) {
  return api.post<RecipeSnapshot>(`/recipes/${recipeVersionId}/publish`, undefined, opts);
}