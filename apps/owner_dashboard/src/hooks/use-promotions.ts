import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useTenantId } from '@/lib/tenant';
import type { Promotion, CreatePromotionDto, UpdatePromotionDto } from '@/types/promotions';

export function usePromotions() {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ['promotions', tenantId],
    queryFn: ({ signal }) => api.get<Promotion[]>('/promotions', { signal }),
  });
}

export function usePromotion(id: string) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ['promotions', tenantId, id],
    queryFn: ({ signal }) => api.get<Promotion>(`/promotions/${id}`, { signal }),
    enabled: !!id,
  });
}

export function useCreatePromotion() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (dto: CreatePromotionDto) => api.post<Promotion>('/promotions', dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promotions', tenantId] });
    },
  });
}

export function useUpdatePromotion() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdatePromotionDto }) =>
      api.patch<Promotion>(`/promotions/${id}`, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promotions', tenantId] });
    },
  });
}

export function useDeletePromotion() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/promotions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promotions', tenantId] });
    },
  });
}

export function useTogglePromotion() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch<Promotion>(`/promotions/${id}`, { is_active: isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promotions', tenantId] });
    },
  });
}