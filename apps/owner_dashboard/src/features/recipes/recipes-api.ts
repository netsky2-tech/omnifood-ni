import { api, type ApiClientMethodOptions } from '@/lib/api';
import type {
  RecipeSnapshot,
  RecipeSuggestionListItem,
  CreateRecipeVersionInput,
  Insumo,
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

export function fetchActiveRecipe(productId: string, opts?: ApiClientMethodOptions) {
  return api.get<RecipeSnapshot>(`/recipes/products/${productId}/active`, opts);
}

export function fetchRecipeSnapshot(recipeVersionId: string, opts?: ApiClientMethodOptions) {
  return api.get<RecipeSnapshot>(`/recipes/${recipeVersionId}/snapshot`, opts);
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

export function fetchPendingSuggestions(opts?: ApiClientMethodOptions) {
  return api.get<RecipeSuggestionListItem[]>('/recipes/suggestions', opts);
}

export function publishRecipeVersion(recipeVersionId: string, opts?: ApiClientMethodOptions) {
  return api.post<RecipeSnapshot>(`/recipes/${recipeVersionId}/publish`, undefined, opts);
}