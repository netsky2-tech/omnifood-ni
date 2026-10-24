import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenantId } from '@/lib/tenant';
import {
  fetchPaginatedCustomers,
  createCustomer,
  updateCustomer,
  deactivateCustomer,
  type CreateCustomerInput,
  type UpdateCustomerInput,
} from './customer-api';

export const CUSTOMER_PAGE_SIZE = 10;

export interface UseCustomerListParams {
  search?: string;
  page?: number;
  pageSize?: number;
  status?: 'all' | 'active' | 'inactive';
  customerType?: 'PERSONA' | 'EMPRESA';
}

export function useCustomerList(params: UseCustomerListParams = {}) {
  const tenantId = useTenantId();
  const search = params.search?.trim() ?? '';
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? CUSTOMER_PAGE_SIZE;
  const status = params.status ?? 'active';
  const customerType = params.customerType;

  return useQuery({
    queryKey: ['customers', tenantId, { search, page, pageSize, status, customerType }],
    queryFn: ({ signal }) =>
      fetchPaginatedCustomers(
        {
          limit: pageSize,
          offset: (page - 1) * pageSize,
          search: search || undefined,
          status,
          customer_type: customerType,
        },
        { signal },
      ),
    staleTime: 30 * 1000,
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (dto: CreateCustomerInput) => createCustomer(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', tenantId] });
    },
  });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateCustomerInput }) =>
      updateCustomer(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', tenantId] });
    },
  });
}

export function useDeactivateCustomer() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (id: string) => deactivateCustomer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', tenantId] });
    },
  });
}

export function useReactivateCustomer() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (id: string) => updateCustomer(id, { is_active: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', tenantId] });
    },
  });
}
