import { api, type ApiClientMethodOptions } from "@/lib/api";
import { toFiniteNumber } from "@/lib/numeric";
import type {
  Product,
  ProductType,
  CreateProductInput,
  UpdateProductInput,
} from "./product-types";

/**
 * Honest wire type: Postgres `numeric` reaches the client as strings, so
 * `stock`, `averageCost` and `sellPrice` are untrusted at this boundary even
 * though `Product` declares them as `number`.
 */
export type RawProduct = Omit<
  Product,
  "stock" | "averageCost" | "sellPrice"
> & {
  stock: unknown;
  averageCost: unknown;
  sellPrice: unknown;
};

interface RawPaginatedProductsResponse {
  data: RawProduct[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Mirrors the backend response boundary in `apps/admin_backend/src/modules/inventory/product-response.ts`. */
export function normalizeProduct(raw: RawProduct): Product {
  return {
    ...raw,
    stock: toFiniteNumber(raw.stock),
    averageCost: toFiniteNumber(raw.averageCost),
    sellPrice: toFiniteNumber(raw.sellPrice),
  };
}

export function normalizeProductList(raws: RawProduct[]): Product[] {
  return raws.map(normalizeProduct);
}

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
    return api
      .get<RawProduct[]>(`/products${qs ? `?${qs}` : ""}`, opts)
      .then<Product[], never>(normalizeProductList);
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
    return api
      .get<RawPaginatedProductsResponse>(`/products${qs ? `?${qs}` : ""}`, opts)
      .then<PaginatedProductsResponse, never>((res) => ({
        ...res,
        data: normalizeProductList(res.data),
      }));
  }
  return api
    .get<RawProduct[]>(`/products${qs ? `?${qs}` : ""}`, opts)
    .then<Product[], never>(normalizeProductList);
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
  return api
    .get<RawPaginatedProductsResponse>(`/products?${qs}`, opts)
    .then<PaginatedProductsResponse, never>((res) => ({
      ...res,
      data: normalizeProductList(res.data),
    }));
}

export function fetchProduct(id: string, opts?: ApiClientMethodOptions) {
  return api.get<RawProduct>(`/products/${id}`, opts).then(normalizeProduct);
}

export function createProduct(input: CreateProductInput, opts?: ApiClientMethodOptions) {
  return api.post<RawProduct>("/products", input, opts).then(normalizeProduct);
}

export function updateProduct(id: string, input: UpdateProductInput, opts?: ApiClientMethodOptions) {
  return api
    .patch<RawProduct>(`/products/${id}`, input, opts)
    .then(normalizeProduct);
}

export function deactivateProduct(id: string, opts?: ApiClientMethodOptions) {
  return api.delete<{ id: string; deactivated: boolean }>(
    `/products/${id}`,
    opts,
  );
}
