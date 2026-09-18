import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenantId } from '@/lib/tenant';
import {
  fetchPrograms,
  fetchProgram,
  createProgram,
  updateProgram,
  activateProgram,
  deactivateProgram,
  fetchRewardsByProgram,
  createReward,
  updateReward,
  activateReward,
  deactivateReward,
  fetchCustomerLoyaltyAccounts,
  fetchCustomerTransactions,
  fetchCustomers,
  adjustPoints,
  fetchRewardProfitAwareMetrics,
} from './loyalty-api';
import type {
  CreateLoyaltyProgramInput,
  UpdateLoyaltyProgramInput,
  CreateRewardInput,
  UpdateRewardInput,
  AdjustPointsInput,
} from './types';

// --- Programs ---

export function usePrograms(filters?: { status?: string; program_type?: string }) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ['loyalty', tenantId, 'programs', filters],
    queryFn: () => fetchPrograms(filters),
    staleTime: 5 * 60 * 1000,
  });
}

export function useProgram(programId: string) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ['loyalty', tenantId, 'programs', programId],
    queryFn: () => fetchProgram(programId),
    enabled: !!programId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateProgram() {
  const qc = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (input: CreateLoyaltyProgramInput) => createProgram(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loyalty', tenantId, 'programs'] });
    },
  });
}

export function useUpdateProgram() {
  const qc = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: ({ programId, input }: { programId: string; input: UpdateLoyaltyProgramInput }) =>
      updateProgram(programId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loyalty', tenantId, 'programs'] });
    },
  });
}

export function useActivateProgram() {
  const qc = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (programId: string) => activateProgram(programId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loyalty', tenantId, 'programs'] });
    },
  });
}

export function useDeactivateProgram() {
  const qc = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (programId: string) => deactivateProgram(programId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loyalty', tenantId, 'programs'] });
    },
  });
}

// --- Rewards ---

export function useRewards(programId: string) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ['loyalty', tenantId, 'rewards', programId],
    queryFn: () => fetchRewardsByProgram(programId),
    enabled: !!programId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateReward() {
  const qc = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: ({ programId, input }: { programId: string; input: CreateRewardInput }) =>
      createReward(programId, input),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['loyalty', tenantId, 'rewards', variables.programId] });
      qc.invalidateQueries({ queryKey: ['loyalty', tenantId, 'programs'] });
    },
  });
}

export function useUpdateReward() {
  const qc = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: ({ rewardId, input }: { rewardId: string; input: UpdateRewardInput }) =>
      updateReward(rewardId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loyalty', tenantId, 'rewards'] });
      qc.invalidateQueries({ queryKey: ['loyalty', tenantId, 'programs'] });
    },
  });
}

export function useActivateReward() {
  const qc = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (rewardId: string) => activateReward(rewardId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loyalty', tenantId, 'rewards'] });
      qc.invalidateQueries({ queryKey: ['loyalty', tenantId, 'programs'] });
    },
  });
}

export function useDeactivateReward() {
  const qc = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (rewardId: string) => deactivateReward(rewardId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loyalty', tenantId, 'rewards'] });
      qc.invalidateQueries({ queryKey: ['loyalty', tenantId, 'programs'] });
    },
  });
}

// --- Customer Loyalty ---

export function useCustomerLoyaltyAccounts(customerId: string) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ['loyalty', tenantId, 'customer-accounts', customerId],
    queryFn: () => fetchCustomerLoyaltyAccounts(customerId),
    enabled: !!customerId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useCustomerTransactions(customerId: string, programId?: string) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ['loyalty', tenantId, 'customer-transactions', customerId, programId],
    queryFn: () => fetchCustomerTransactions(customerId, programId),
    enabled: !!customerId,
    staleTime: 2 * 60 * 1000,
  });
}

// --- Customers ---

export function useCustomers(search?: string) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ['customers', tenantId, search],
    queryFn: () => fetchCustomers(search),
    staleTime: 5 * 60 * 1000,
  });
}

export function useAdjustPoints() {
  const qc = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: ({ customerId, input }: { customerId: string; input: AdjustPointsInput }) =>
      adjustPoints(customerId, input),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['customers', tenantId] });
      qc.invalidateQueries({ queryKey: ['loyalty', tenantId, 'customer-accounts', variables.customerId] });
      qc.invalidateQueries({ queryKey: ['loyalty', tenantId, 'customer-transactions', variables.customerId] });
    },
  });
}

// --- Profit-aware Reward Metrics (LV1.6) ---

export function useRewardProfitAware(rewardId: string | null, asOf?: string) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ['loyalty', tenantId, 'rewards', rewardId, 'profit-aware', asOf],
    queryFn: () => fetchRewardProfitAwareMetrics(rewardId!, asOf),
    enabled: !!rewardId,
    staleTime: 60 * 1000,
  });
}
