import { api } from '@/lib/api';
import type {
  RecipeSnapshot,
  CreateRecipeVersionInput,
  Insumo,
} from './types';

export function fetchActiveRecipe(productId: string) {
  return api.get<RecipeSnapshot>(`/recipes/products/${productId}/active`);
}

export function fetchRecipeSnapshot(recipeVersionId: string) {
  return api.get<RecipeSnapshot>(`/recipes/${recipeVersionId}/snapshot`);
}

export function createRecipeVersion(
  productId: string,
  input: CreateRecipeVersionInput,
) {
  return api.post<RecipeSnapshot>(`/recipes/products/${productId}/versions`, input);
}

export function fetchInsumos() {
  return api.get<Insumo[]>('/insumos');
}