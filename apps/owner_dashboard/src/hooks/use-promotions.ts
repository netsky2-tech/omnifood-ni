import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Promotion, CreatePromotionDto, UpdatePromotionDto } from '@/types/promotions';

const PROMOTIONS_KEY = ['promotions'];

export function usePromotions() {
  return useQuery({
    queryKey: PROMOTIONS_KEY,
    queryFn: () => api.get<Promotion[]>('/promotions'),
  });
}

export function usePromotion(id: string) {
  return useQuery({
    queryKey: [...PROMOTIONS_KEY, id],
    queryFn: () => api.get<Promotion>(`/promotions/${id}`),
    enabled: !!id,
  });
}

export function useCreatePromotion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreatePromotionDto) => api.post<Promotion>('/promotions', dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROMOTIONS_KEY });
    },
  });
}

export function useUpdatePromotion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdatePromotionDto }) =>
      api.patch<Promotion>(`/promotions/${id}`, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROMOTIONS_KEY });
    },
  });
}

export function useDeletePromotion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/promotions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROMOTIONS_KEY });
    },
  });
}

export function useTogglePromotion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch<Promotion>(`/promotions/${id}`, { is_active: isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROMOTIONS_KEY });
    },
  });
}