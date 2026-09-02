import { api } from "@/lib/api";
import type {
  Product,
  ProductType,
  CreateProductInput,
  UpdateProductInput,
} from "./product-types";

export function fetchProducts(
  productType?: ProductType,
  includeInactive = false,
) {
  const params = new URLSearchParams();
  if (productType) params.set("productType", productType);
  if (includeInactive) params.set("includeInactive", "true");
  const qs = params.toString();
  return api.get<Product[]>(`/products${qs ? `?${qs}` : ""}`);
}

export function fetchProduct(id: string) {
  return api.get<Product>(`/products/${id}`);
}

export function createProduct(input: CreateProductInput) {
  return api.post<Product>("/products", input);
}

export function updateProduct(id: string, input: UpdateProductInput) {
  return api.patch<Product>(`/products/${id}`, input);
}

export function deactivateProduct(id: string) {
  return api.delete<{ id: string; deactivated: boolean }>(
    `/products/${id}`,
  );
}
