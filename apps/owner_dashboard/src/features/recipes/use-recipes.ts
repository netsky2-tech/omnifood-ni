import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenantId } from '@/lib/tenant';
import {
  fetchActiveRecipe,
  fetchRecipeSnapshot,
  fetchRecipeVersions,
  createRecipeVersion,
  fetchInsumos,
  createInsumo,
  updateInsumo,
  fetchPendingSuggestions,
  publishRecipeVersion,
  suggestionsQueryKey,
  insumosQueryKey,
} from './recipes-api';
import type {
  CreateRecipeVersionInput,
  CreateInsumoInput,
  UpdateInsumoInput,
} from './types';

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

/** Round-2 §17.6 S3: the version list behind the reference selector. Recipe
 * versions are historical references (never deleted), so a short staleTime
 * is enough — the list only grows when a version is created/published. */
export function useRecipeVersions(productId: string, enabled = true) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ['recipes', tenantId, 'versions', productId],
    queryFn: ({ signal }) => fetchRecipeVersions(productId, { signal }),
    enabled: enabled && !!productId,
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
    queryKey: insumosQueryKey(tenantId),
    queryFn: ({ signal }) => fetchInsumos({ signal }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateInsumo() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();

  return useMutation({
    mutationFn: (input: CreateInsumoInput) => createInsumo(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: insumosQueryKey(tenantId) });
      queryClient.invalidateQueries({ queryKey: ['inventory', tenantId] });
    },
  });
}

export function useUpdateInsumo() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateInsumoInput }) =>
      updateInsumo(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: insumosQueryKey(tenantId) });
      queryClient.invalidateQueries({ queryKey: ['inventory', tenantId] });
    },
  });
}

export function usePendingSuggestions() {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: suggestionsQueryKey(tenantId),
    queryFn: ({ signal }) => fetchPendingSuggestions({ signal }),
    staleTime: 5 * 60 * 1000,
  });
}

export function usePublishRecipeVersion() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();

  return useMutation({
    mutationFn: ({ recipeVersionId }: { recipeVersionId: string; productId: string }) =>
      publishRecipeVersion(recipeVersionId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: suggestionsQueryKey(tenantId) });
      queryClient.invalidateQueries({ queryKey: ['recipes', tenantId, 'active', variables.productId] });
    },
  });
}