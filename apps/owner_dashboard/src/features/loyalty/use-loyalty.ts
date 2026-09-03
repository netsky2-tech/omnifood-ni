import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  return useQuery({
    queryKey: ['loyalty', 'programs', filters],
    queryFn: () => fetchPrograms(filters),
    staleTime: 5 * 60 * 1000,
  });
}

export function useProgram(programId: string) {
  return useQuery({
    queryKey: ['loyalty', 'programs', programId],
    queryFn: () => fetchProgram(programId),
    enabled: !!programId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLoyaltyProgramInput) => createProgram(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loyalty', 'programs'] });
    },
  });
}

export function useUpdateProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ programId, input }: { programId: string; input: UpdateLoyaltyProgramInput }) =>
      updateProgram(programId, input),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['loyalty', 'programs'] });
      qc.invalidateQueries({ queryKey: ['loyalty', 'programs', variables.programId] });
    },
  });
}

export function useActivateProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (programId: string) => activateProgram(programId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loyalty', 'programs'] });
    },
  });
}

export function useDeactivateProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (programId: string) => deactivateProgram(programId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loyalty', 'programs'] });
    },
  });
}

// --- Rewards ---

export function useRewards(programId: string) {
  return useQuery({
    queryKey: ['loyalty', 'rewards', programId],
    queryFn: () => fetchRewardsByProgram(programId),
    enabled: !!programId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateReward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ programId, input }: { programId: string; input: CreateRewardInput }) =>
      createReward(programId, input),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['loyalty', 'rewards', variables.programId] });
      qc.invalidateQueries({ queryKey: ['loyalty', 'programs'] });
    },
  });
}

export function useUpdateReward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rewardId, input }: { rewardId: string; input: UpdateRewardInput }) =>
      updateReward(rewardId, input),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['loyalty', 'rewards'] });
      qc.invalidateQueries({ queryKey: ['loyalty', 'programs'] });
    },
  });
}

export function useActivateReward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rewardId: string) => activateReward(rewardId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loyalty', 'rewards'] });
      qc.invalidateQueries({ queryKey: ['loyalty', 'programs'] });
    },
  });
}

export function useDeactivateReward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rewardId: string) => deactivateReward(rewardId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loyalty', 'rewards'] });
      qc.invalidateQueries({ queryKey: ['loyalty', 'programs'] });
    },
  });
}

// --- Customer Loyalty ---

export function useCustomerLoyaltyAccounts(customerId: string) {
  return useQuery({
    queryKey: ['loyalty', 'customer-accounts', customerId],
    queryFn: () => fetchCustomerLoyaltyAccounts(customerId),
    enabled: !!customerId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useCustomerTransactions(customerId: string, programId?: string) {
  return useQuery({
    queryKey: ['loyalty', 'customer-transactions', customerId, programId],
    queryFn: () => fetchCustomerTransactions(customerId, programId),
    enabled: !!customerId,
    staleTime: 2 * 60 * 1000,
  });
}

// --- Customers ---

export function useCustomers(search?: string) {
  return useQuery({
    queryKey: ['customers', search],
    queryFn: () => fetchCustomers(search),
    staleTime: 5 * 60 * 1000,
  });
}

export function useAdjustPoints() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ customerId, input }: { customerId: string; input: AdjustPointsInput }) =>
      adjustPoints(customerId, input),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['loyalty', 'customer-accounts', variables.customerId] });
      qc.invalidateQueries({ queryKey: ['loyalty', 'customer-transactions', variables.customerId] });
    },
  });
}
