import { api, type ApiClientMethodOptions } from "@/lib/api";
import type {
  Product,
  ProductType,
  CreateProductInput,
  UpdateProductInput,
} from "./product-types";

export function fetchProducts(
  productType?: ProductType,
  includeInactive = false,
  opts?: ApiClientMethodOptions,
) {
  const params = new URLSearchParams();
  if (productType) params.set("productType", productType);
  if (includeInactive) params.set("includeInactive", "true");
  const qs = params.toString();
  return api.get<Product[]>(`/products${qs ? `?${qs}` : ""}`, opts);
}

export function fetchProduct(id: string, opts?: ApiClientMethodOptions) {
  return api.get<Product>(`/products/${id}`, opts);
}

export function createProduct(input: CreateProductInput, opts?: ApiClientMethodOptions) {
  return api.post<Product>("/products", input, opts);
}

export function updateProduct(id: string, input: UpdateProductInput, opts?: ApiClientMethodOptions) {
  return api.patch<Product>(`/products/${id}`, input, opts);
}

export function deactivateProduct(id: string, opts?: ApiClientMethodOptions) {
  return api.delete<{ id: string; deactivated: boolean }>(
    `/products/${id}`,
    opts,
  );
}
