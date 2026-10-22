import { apiFetch } from '@/lib/api';

export interface PaginatedCustomersResponse {
  data: CustomerItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CustomerItem {
  id: string;
  name: string;
  tax_id?: string | null;
  phone?: string | null;
  email?: string | null;
  is_active: boolean;
}

export async function fetchPaginatedCustomers({
  page,
  pageSize,
  search,
}: {
  page: number;
  pageSize: number;
  search?: string;
}, { signal }: { signal: AbortSignal }): Promise<PaginatedCustomersResponse> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    limit: String(pageSize),
    offset: String((page - 1) * pageSize),
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
