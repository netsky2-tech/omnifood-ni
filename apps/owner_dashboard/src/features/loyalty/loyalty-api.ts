import { api } from '@/lib/api';
import type {
  LoyaltyProgram,
  RewardDefinition,
  CustomerLoyaltyAccount,
  CustomerPointTransaction,
  Customer,
  CreateLoyaltyProgramInput,
  UpdateLoyaltyProgramInput,
  CreateRewardInput,
  UpdateRewardInput,
  AdjustPointsInput,
  RewardProfitAwareView,
} from './types';

// --- Programs ---

export function fetchPrograms(params?: { status?: string; program_type?: string }) {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.program_type) query.set('program_type', params.program_type);
  const qs = query.toString();
  return api.get<LoyaltyProgram[]>(`/loyalty/programs${qs ? `?${qs}` : ''}`);
}

export function fetchProgram(programId: string) {
  return api.get<LoyaltyProgram>(`/loyalty/programs/${programId}`);
}

export function createProgram(input: CreateLoyaltyProgramInput) {
  return api.post<LoyaltyProgram>('/loyalty/programs', input);
}

export function updateProgram(programId: string, input: UpdateLoyaltyProgramInput) {
  return api.patch<LoyaltyProgram>(`/loyalty/programs/${programId}`, input);
}

export function activateProgram(programId: string) {
  return api.post<LoyaltyProgram>(`/loyalty/programs/${programId}/activate`, {});
}

export function deactivateProgram(programId: string) {
  return api.post<LoyaltyProgram>(`/loyalty/programs/${programId}/deactivate`, {});
}

// --- Rewards ---

export function fetchRewardsByProgram(programId: string) {
  return api.get<RewardDefinition[]>(`/loyalty/programs/${programId}/rewards`);
}

export function fetchReward(rewardId: string) {
  return api.get<RewardDefinition>(`/loyalty/rewards/${rewardId}`);
}

export function createReward(programId: string, input: CreateRewardInput) {
  return api.post<RewardDefinition>(`/loyalty/programs/${programId}/rewards`, input);
}

export function updateReward(rewardId: string, input: UpdateRewardInput) {
  return api.patch<RewardDefinition>(`/loyalty/rewards/${rewardId}`, input);
}

export function activateReward(rewardId: string) {
  return api.post<RewardDefinition>(`/loyalty/rewards/${rewardId}/activate`, {});
}

export function deactivateReward(rewardId: string) {
  return api.post<RewardDefinition>(`/loyalty/rewards/${rewardId}/deactivate`, {});
}

// --- Customer Loyalty ---

export function fetchCustomerLoyaltyAccounts(customerId: string) {
  return api.get<CustomerLoyaltyAccount[]>(`/loyalty/customers/${customerId}/accounts`);
}

export function fetchCustomerTransactions(customerId: string, programId?: string) {
  const query = new URLSearchParams();
  if (programId) query.set('program_id', programId);
  const qs = query.toString();
  return api.get<CustomerPointTransaction[]>(
    `/loyalty/customers/${customerId}/transactions${qs ? `?${qs}` : ''}`,
  );
}

// --- Customers (for selector) ---

export function fetchCustomers(search?: string) {
  const query = new URLSearchParams();
  if (search) query.set('search', search);
  const qs = query.toString();
  return api.get<Customer[]>(`/customers${qs ? `?${qs}` : ''}`);
}

export function adjustPoints(customerId: string, input: AdjustPointsInput) {
  return api.post<CustomerPointTransaction>(
    `/customers/${customerId}/points/adjust`,
    input,
  );
}

// --- Profit-aware Reward Metrics (LV1.6) ---

export function fetchRewardProfitAwareMetrics(rewardId: string, asOf?: string) {
  const query = new URLSearchParams();
  if (asOf) query.set('as_of', asOf);
  const qs = query.toString();
  return api.get<RewardProfitAwareView>(
    `/loyalty/rewards/${rewardId}/profit-aware${qs ? `?${qs}` : ''}`,
  );
}
