import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenantId } from "@/lib/tenant";
import {
  fetchProducts,
  fetchPaginatedProducts,
  createProduct,
  updateProduct,
  deactivateProduct,
  type FetchProductsParams,
  type PaginatedProductsResponse,
} from "./product-api";
import type {
  Product,
  ProductType,
  CreateProductInput,
  UpdateProductInput,
} from "./product-types";

export function useProducts(
  productType?: ProductType,
  includeInactive = false,
) {
  const tenantId = useTenantId();
  return useQuery<Product[]>({
    queryKey: ["products", tenantId, productType, includeInactive],
    queryFn: ({ signal }) =>
      fetchProducts(productType, includeInactive, { signal }) as Promise<Product[]>,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePaginatedProducts(params: FetchProductsParams) {
  const tenantId = useTenantId();
  return useQuery<PaginatedProductsResponse>({
    queryKey: [
      "products",
      tenantId,
      "paginated",
      params.productType,
      params.includeInactive ?? false,
      params.page ?? 1,
      params.pageSize ?? 25,
      params.search ?? "",
      params.sortBy ?? "name",
      params.sortOrder ?? "ASC",
    ],
    queryFn: ({ signal }) => fetchPaginatedProducts(params, { signal }),
    placeholderData: (prev) => prev,
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
