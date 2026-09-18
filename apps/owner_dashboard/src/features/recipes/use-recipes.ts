import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenantId } from '@/lib/tenant';
import {
  fetchActiveRecipe,
  fetchRecipeSnapshot,
  createRecipeVersion,
  fetchInsumos,
} from './recipes-api';
import type { CreateRecipeVersionInput } from './types';

export function useActiveRecipe(productId: string, enabled = true) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ['recipes', tenantId, 'active', productId],
    queryFn: ({ signal }) => fetchActiveRecipe(productId, { signal }),
    enabled: enabled && !!productId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useRecipeSnapshot(recipeVersionId: string, enabled = true) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ['recipes', tenantId, 'snapshot', recipeVersionId],
    queryFn: ({ signal }) => fetchRecipeSnapshot(recipeVersionId, { signal }),
    enabled: enabled && !!recipeVersionId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateRecipeVersion() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();

  return useMutation({
    mutationFn: ({ productId, input }: { productId: string; input: CreateRecipeVersionInput }) =>
      createRecipeVersion(productId, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['recipes', tenantId, 'active', variables.productId] });
      queryClient.invalidateQueries({ queryKey: ['products', tenantId] });
    },
  });
}

export function useInsumos() {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ['recipes', tenantId, 'insumos'],
    queryFn: ({ signal }) => fetchInsumos({ signal }),
    staleTime: 5 * 60 * 1000,
  });
}