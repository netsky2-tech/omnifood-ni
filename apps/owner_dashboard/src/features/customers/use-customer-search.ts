import { useQuery } from "@tanstack/react-query";
import { useTenantId } from "@/lib/tenant";
import {
  fetchPaginatedCustomers,
  fetchCustomer,
  type PaginatedCustomersResponse,
  type CustomerItem,
} from "./customer-api";

/**
 * Dashboard's customer-search query surface (§17.6, slice S3).
 *
 * Reuses the backend's existing `GET /customers?search=` behind a
 * dashboard-specific hook, so the query contract lives in exactly ONE place.
 * Flexible matching itself (several columns, case/accents/partials) is the
 * backend's `?search=` predicate.
 */

export const CUSTOMER_SEARCH_PAGE_SIZE = 50;

export interface UseCustomerSearchOptions {
  limit?: number;
  includeInactive?: boolean;
  enabled?: boolean;
}

export function useCustomerSearch(
  search: string,
  opts: UseCustomerSearchOptions = {},
) {
  const tenantId = useTenantId();
  const term = search.trim();
  const limit = opts.limit ?? CUSTOMER_SEARCH_PAGE_SIZE;

  return useQuery<PaginatedCustomersResponse>({
    queryKey: ["customers", tenantId, "search", term, limit],
    queryFn: ({ signal }) =>
      fetchPaginatedCustomers(
        {
          limit,
          offset: 0,
          search: term || undefined,
        },
        { signal },
      ),
    enabled: opts.enabled ?? true,
    staleTime: 30 * 1000,
    placeholderData: (prev) => prev,
  });
}

/**
 * One customer by id — the selector's edit-mode label source.
 */
export function useCustomerById(
  id: string | undefined,
  opts: { enabled?: boolean } = {},
) {
  const tenantId = useTenantId();
  return useQuery<CustomerItem>({
    queryKey: ["customers", tenantId, "by-id", id],
    queryFn: ({ signal }) => fetchCustomer(id as string, { signal }),
    enabled: !!id && (opts.enabled ?? true),
    staleTime: 5 * 60 * 1000,
  });
}
