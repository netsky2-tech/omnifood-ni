import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenantId } from "@/lib/tenant";
import {
  fetchProducts,
  createProduct,
  updateProduct,
  deactivateProduct,
} from "./product-api";
import type {
  ProductType,
  CreateProductInput,
  UpdateProductInput,
} from "./product-types";

export function useProducts(
  productType?: ProductType,
  includeInactive = false,
) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["products", tenantId, productType, includeInactive],
    queryFn: ({ signal }) => fetchProducts(productType, includeInactive, { signal }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();

  return useMutation({
    mutationFn: (input: CreateProductInput) => createProduct(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["recipes", tenantId] });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProductInput }) =>
      updateProduct(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["recipes", tenantId] });
    },
  });
}

export function useDeactivateProduct() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();

  return useMutation({
    mutationFn: (id: string) => deactivateProduct(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["recipes", tenantId] });
    },
  });
}
