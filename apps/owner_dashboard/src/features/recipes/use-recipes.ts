import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchActiveRecipe,
  fetchRecipeSnapshot,
  createRecipeVersion,
  fetchInsumos,
} from './recipes-api';
import type { CreateRecipeVersionInput } from './types';

export function useActiveRecipe(productId: string, enabled = true) {
  return useQuery({
    queryKey: ['recipes', 'active', productId],
    queryFn: () => fetchActiveRecipe(productId),
    enabled: enabled && !!productId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useRecipeSnapshot(recipeVersionId: string, enabled = true) {
  return useQuery({
    queryKey: ['recipes', 'snapshot', recipeVersionId],
    queryFn: () => fetchRecipeSnapshot(recipeVersionId),
    enabled: enabled && !!recipeVersionId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateRecipeVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ productId, input }: { productId: string; input: CreateRecipeVersionInput }) =>
      createRecipeVersion(productId, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['recipes', 'active', variables.productId] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useInsumos() {
  return useQuery({
    queryKey: ['insumos'],
    queryFn: fetchInsumos,
    staleTime: 5 * 60 * 1000,
  });
}