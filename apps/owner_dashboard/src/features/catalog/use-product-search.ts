import { useQuery } from "@tanstack/react-query";
import { useTenantId } from "@/lib/tenant";
import {
  fetchPaginatedProducts,
  fetchProduct,
  type PaginatedProductsResponse,
} from "./product-api";
import type { Product } from "./product-types";

/**
 * The dashboard's product-search query surface (§17.6, slice S3).
 *
 * Owner decision (2026-10-10): reuse the backend's existing
 * `GET /products?search=` behind a dashboard-specific hook, so the query
 * contract (endpoint, pagination/limit, sorting, active-only default) lives
 * in exactly ONE place. No form builds its own URL: a form that needs
 * products wires `EntitySearchSelect` to `useProductSearch`.
 *
 * Flexible matching itself (several columns, case/accents/partials) is the
 * backend's `?search=` predicate — see
 * apps/admin_backend/src/modules/inventory/product.service.ts and the
 * standard §17.6 definition.
 */

/** Page size the selector asks for; the backend caps pageSize at 100. */
export const PRODUCT_SEARCH_PAGE_SIZE = 50;

export interface UseProductSearchOptions {
  /** Page size override (≤ 100, the backend's cap). */
  limit?: number;
  /** Include deactivated products. Default: active-only. */
  includeInactive?: boolean;
  /** Set false to hold the query until a caller enables it. */
  enabled?: boolean;
}

export function useProductSearch(
  search: string,
  opts: UseProductSearchOptions = {},
) {
  const tenantId = useTenantId();
  const term = search.trim();
  const limit = opts.limit ?? PRODUCT_SEARCH_PAGE_SIZE;
  const includeInactive = opts.includeInactive ?? false;

  return useQuery<PaginatedProductsResponse>({
    queryKey: [
      "products",
      tenantId,
      "search",
      term,
      limit,
      includeInactive,
    ],
    queryFn: ({ signal }) =>
      fetchPaginatedProducts(
        {
          page: 1,
          pageSize: limit,
          // Empty term → no `search` param: the unfiltered browse list.
          search: term || undefined,
          includeInactive,
          sortBy: "name",
          sortOrder: "ASC",
        },
        { signal },
      ),
    enabled: opts.enabled ?? true,
    staleTime: 30 * 1000,
    // Keep the previous page's rows visible while the next term loads, so
    // the selector renders "Actualizando…" instead of flashing empty.
    placeholderData: (prev) => prev,
  });
}

/**
 * One product by id — the selector's edit-mode label source: when editing a
 * stored reference the stored row may be outside the current search results,
 * and the operator must see its human label, never its id.
 */
export function useProductById(
  id: string | undefined,
  opts: { enabled?: boolean } = {},
) {
  const tenantId = useTenantId();
  return useQuery<Product>({
    queryKey: ["products", tenantId, "by-id", id],
    queryFn: ({ signal }) => fetchProduct(id as string, { signal }),
    enabled: !!id && (opts.enabled ?? true),
    staleTime: 5 * 60 * 1000,
  });
}
