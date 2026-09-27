import { api, type ApiClientMethodOptions } from '@/lib/api';
import type {
  RecipeSnapshot,
  RecipeSuggestionListItem,
  CreateRecipeVersionInput,
  Insumo,
} from './types';

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