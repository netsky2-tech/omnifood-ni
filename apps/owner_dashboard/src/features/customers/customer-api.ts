import { apiFetch } from '@/lib/api';

export interface PaginatedCustomersResponse {
  data: CustomerItem[];
  total: number;
}

export interface CustomerItem {
  id: string;
  name: string;
  tax_id?: string | null;
  phone?: string | null;
  email?: string | null;
  is_active: boolean;
}

/**
 * `GET /customers` query contract (CustomerQueryDto).
 *
 * ONLY `search`, `limit` and `offset` are accepted: the backend's global
 * ValidationPipe runs with `forbidNonWhitelisted: true`, so an extra query
 * parameter (a `page`/`pageSize` pair, the shape the products endpoint uses)
 * is rejected with a 400 and the whole search fails. The customer selector
 * then renders its error state instead of its results.
 */
export async function fetchPaginatedCustomers({
  limit,
  offset,
  search,
}: {
  limit: number;
  offset: number;
  search?: string;
}, { signal }: { signal: AbortSignal }): Promise<PaginatedCustomersResponse> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (search) params.set('search', search);

  return apiFetch<PaginatedCustomersResponse>(
    `/customers?${params.toString()}`,
    { signal },
  );
}

export async function fetchCustomer(
  id: string,
  { signal }: { signal: AbortSignal },
): Promise<CustomerItem> {
  return apiFetch<CustomerItem>(`/customers/${id}`, { signal });
}
