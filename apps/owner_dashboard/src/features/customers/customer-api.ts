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
  address?: string | null;
  customer_type?: 'PERSONA' | 'EMPRESA' | null;
  is_active: boolean;
  points_balance?: number;
  created_at?: string;
  updated_at?: string;
}

export interface FetchCustomersParams {
  limit: number;
  offset: number;
  search?: string;
  status?: 'all' | 'active' | 'inactive';
  customer_type?: 'PERSONA' | 'EMPRESA';
}

/**
 * `GET /customers` query contract (CustomerQueryDto).
 *
 * Supported params: `limit`, `offset`, `search`, `status`, `customer_type`.
 */
export async function fetchPaginatedCustomers(
  {
    limit,
    offset,
    search,
    status,
    customer_type,
  }: FetchCustomersParams,
  { signal }: { signal?: AbortSignal } = {},
): Promise<PaginatedCustomersResponse> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (search && search.trim()) params.set('search', search.trim());
  if (status && status !== 'active') params.set('status', status);
  if (customer_type) params.set('customer_type', customer_type);

  return apiFetch<PaginatedCustomersResponse>(
    `/customers?${params.toString()}`,
    { signal },
  );
}

export async function fetchCustomer(
  id: string,
  { signal }: { signal?: AbortSignal } = {},
): Promise<CustomerItem> {
  return apiFetch<CustomerItem>(`/customers/${id}`, { signal });
}

export interface CreateCustomerInput {
  name: string;
  tax_id?: string;
  phone?: string;
  email?: string;
  address?: string;
  customer_type?: 'PERSONA' | 'EMPRESA';
}

export interface UpdateCustomerInput {
  name?: string;
  tax_id?: string;
  phone?: string;
  email?: string;
  address?: string;
  customer_type?: 'PERSONA' | 'EMPRESA';
  is_active?: boolean;
}

export async function createCustomer(
  dto: CreateCustomerInput,
  { signal }: { signal?: AbortSignal } = {},
): Promise<CustomerItem> {
  return apiFetch<CustomerItem>('/customers', { method: 'POST', body: dto, signal });
}

export async function updateCustomer(
  id: string,
  dto: UpdateCustomerInput,
  { signal }: { signal?: AbortSignal } = {},
): Promise<CustomerItem> {
  return apiFetch<CustomerItem>(`/customers/${id}`, { method: 'PATCH', body: dto, signal });
}

export async function deactivateCustomer(
  id: string,
  { signal }: { signal?: AbortSignal } = {},
): Promise<void> {
  return apiFetch<void>(`/customers/${id}`, { method: 'DELETE', signal });
}
