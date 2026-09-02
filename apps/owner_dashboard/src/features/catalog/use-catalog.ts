import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchCatalogValues,
  createCatalogValue,
  updateCatalogValue,
  deactivateCatalogValue,
  seedCatalogDefaults,
} from "./catalog-api";
import type {
  CatalogType,
  CreateCatalogValueInput,
  UpdateCatalogValueInput,
} from "./types";

export function useCatalogValues(type: CatalogType, includeInactive = false) {
  return useQuery({
    queryKey: ["catalog", type, includeInactive],
    queryFn: () => fetchCatalogValues(type, includeInactive),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateCatalogValue(type: CatalogType) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCatalogValueInput) =>
      createCatalogValue(type, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["catalog", type] });
    },
  });
}

export function useUpdateCatalogValue(type: CatalogType) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCatalogValueInput }) =>
      updateCatalogValue(type, id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["catalog", type] });
    },
  });
}

export function useDeactivateCatalogValue(type: CatalogType) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deactivateCatalogValue(type, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["catalog", type] });
    },
  });
}

export function useSeedCatalogDefaults() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: seedCatalogDefaults,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["catalog"] });
    },
  });
}
