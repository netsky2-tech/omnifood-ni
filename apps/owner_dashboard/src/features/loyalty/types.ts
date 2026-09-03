export type LoyaltyProgramType = 'SPEND_POINTS' | 'PRODUCT_STAMPS' | 'VISIT_STAMPS';

export const LOYALTY_PROGRAM_TYPES: { id: LoyaltyProgramType; label: string }[] = [
  { id: 'SPEND_POINTS', label: 'Puntos por compra' },
  { id: 'PRODUCT_STAMPS', label: 'Sellos por producto' },
  { id: 'VISIT_STAMPS', label: 'Sellos por visita' },
];

export type LoyaltyProgramStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE';

export type RewardType = 'DISCOUNT_AMOUNT' | 'FREE_PRODUCT';

export const REWARD_TYPES: { id: RewardType; label: string }[] = [
  { id: 'DISCOUNT_AMOUNT', label: 'Descuento (C$)' },
  { id: 'FREE_PRODUCT', label: 'Producto gratis' },
];

export type RewardStatus = 'ACTIVE' | 'INACTIVE';

export interface LoyaltyProgram {
  id: string;
  tenant_id: string;
  name: string;
  program_type: LoyaltyProgramType;
  status: LoyaltyProgramStatus;
  starts_at: string | null;
  ends_at: string | null;
  earning_rule: Record<string, unknown>;
  eligibility_rule: Record<string, unknown>;
  config_version: number;
  rewards?: RewardDefinition[];
  created_at: string;
  updated_at: string;
}

export interface RewardDefinition {
  id: string;
  tenant_id: string;
  loyalty_program_id: string;
  name: string;
  description: string | null;
  reward_type: RewardType;
  cost_units: number;
  benefit_config: Record<string, unknown>;
  status: RewardStatus;
  starts_at: string | null;
  ends_at: string | null;
  presentation_order: number;
  config_version: number;
  created_at: string;
  updated_at: string;
}

export interface CustomerLoyaltyAccount {
  tenant_id: string;
  customer_id: string;
  loyalty_program_id: string;
  balance_units: number;
  last_transaction_id: string | null;
  projection_version: number;
  recomputed_at: string;
}

export interface CustomerPointTransaction {
  id: string;
  tenant_id: string;
  customer_id: string;
  loyalty_program_id: string | null;
  ticket_id: string | null;
  invoice_id: string | null;
  reward_id: string | null;
  transaction_type: string;
  units: number | null;
  reversal_of_transaction_id: string | null;
  idempotency_key: string | null;
  source_event_id: string | null;
  actor_user_id: string | null;
  branch_id: string | null;
  terminal_id: string | null;
  program_version: number | null;
  reward_version: number | null;
  commercial_snapshot: Record<string, unknown> | null;
  origin: string | null;
  occurred_at: string | null;
  recorded_at: string | null;
  legacy_imported: boolean;
  type: string;
  points: number;
  balance_after: number;
  conversion_rate: number;
  reason: string | null;
  created_at: string;
}

export interface CreateLoyaltyProgramInput {
  name: string;
  program_type: LoyaltyProgramType;
  earning_rule: Record<string, unknown>;
  eligibility_rule?: Record<string, unknown>;
  starts_at?: string | null;
  ends_at?: string | null;
}

export interface UpdateLoyaltyProgramInput {
  name?: string;
  earning_rule?: Record<string, unknown>;
  eligibility_rule?: Record<string, unknown>;
  starts_at?: string | null;
  ends_at?: string | null;
}

export interface CreateRewardInput {
  name: string;
  description?: string;
  reward_type: RewardType;
  cost_units: number;
  benefit_config: Record<string, unknown>;
  presentation_order?: number;
  starts_at?: string | null;
  ends_at?: string | null;
}

export interface UpdateRewardInput {
  name?: string;
  description?: string;
  cost_units?: number;
  benefit_config?: Record<string, unknown>;
  presentation_order?: number;
  starts_at?: string | null;
  ends_at?: string | null;
}

export interface Customer {
  id: string;
  tenant_id: string;
  name: string;
  tax_id: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  points_balance: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdjustPointsInput {
  points_delta: number;
  reason: string;
  invoice_id?: string;
}

// --- Profit-aware Reward Metrics (LV1.6) ---

export type MetricStatus = 'AVAILABLE' | 'NOT_AVAILABLE' | 'STALE' | 'NOT_APPLICABLE';

export interface ProfitAwareMetric<T> {
  status: MetricStatus;
  value?: T;
  reason?: string;
  asOfUtc?: string;
  lastCompleteSyncAt?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface ProfitAwareWindow {
  startUtc: string;
  endUtc: string;
  label: string; // 'LAST_30_DAYS'
}

export interface RewardProfitAwareView {
  rewardId: string;
  programId: string;
  asOfUtc: string;
  window: ProfitAwareWindow;
  retailPriceNio: ProfitAwareMetric<number>;
  estimatedCppNio: ProfitAwareMetric<number>;
  estimatedRewardCostNio: ProfitAwareMetric<number>;
  qualifiedSalesNio: ProfitAwareMetric<number>;
  estimatedIncentiveCostInWindowNio: ProfitAwareMetric<number>;
  effectiveIncentiveRatePct: ProfitAwareMetric<number>;
}
