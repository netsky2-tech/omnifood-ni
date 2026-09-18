import { api, type ApiClientMethodOptions } from "@/lib/api";
import type {
  Product,
  ProductType,
  CreateProductInput,
  UpdateProductInput,
} from "./product-types";

export interface FetchProductsParams {
  productType?: ProductType;
  includeInactive?: boolean;
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
}

export interface PaginatedProductsResponse {
  data: Product[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function fetchProducts(
  params?: ProductType | FetchProductsParams,
  includeInactive = false,
  opts?: ApiClientMethodOptions,
): Promise<Product[]> | Promise<PaginatedProductsResponse> {
  const query = new URLSearchParams();

  if (typeof params === "string" || params === undefined) {
    if (params) query.set("productType", params);
    if (includeInactive) query.set("includeInactive", "true");
    const qs = query.toString();
    return api.get<Product[]>(`/products${qs ? `?${qs}` : ""}`, opts);
  }

  if (params.productType) query.set("productType", params.productType);
  if (params.includeInactive) query.set("includeInactive", "true");
  if (params.page !== undefined) query.set("page", String(params.page));
  if (params.pageSize !== undefined) query.set("pageSize", String(params.pageSize));
  if (params.search && params.search.trim().length > 0) query.set("search", params.search.trim());
  if (params.sortBy) query.set("sortBy", params.sortBy);
  if (params.sortOrder) query.set("sortOrder", params.sortOrder);
  const qs = query.toString();

  if (params.page !== undefined) {
    return api.get<PaginatedProductsResponse>(`/products${qs ? `?${qs}` : ""}`, opts);
  }
  return api.get<Product[]>(`/products${qs ? `?${qs}` : ""}`, opts);
}

export function fetchPaginatedProducts(
  params: FetchProductsParams,
  opts?: ApiClientMethodOptions,
): Promise<PaginatedProductsResponse> {
  const query = new URLSearchParams();
  if (params.productType) query.set("productType", params.productType);
  if (params.includeInactive) query.set("includeInactive", "true");
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? 25));
  if (params.search && params.search.trim().length > 0) query.set("search", params.search.trim());
  if (params.sortBy) query.set("sortBy", params.sortBy);
  if (params.sortOrder) query.set("sortOrder", params.sortOrder);
  const qs = query.toString();
  return api.get<PaginatedProductsResponse>(`/products?${qs}`, opts);
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
