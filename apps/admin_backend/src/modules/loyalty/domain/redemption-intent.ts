import { LoyaltyTicketSnapshot } from './loyalty-ticket-snapshot';

export type RewardApplicationType = 'DISCOUNT_AMOUNT' | 'FREE_PRODUCT';

export interface RewardApplication {
  rewardId: string;
  rewardType: RewardApplicationType;
  benefitConfig: Record<string, unknown>;
  costUnits: number;
}

export interface RedemptionIntent {
  id: string;
  tenantId: string;
  customerId: string;
  ticketId: string;
  loyaltyProgramId: string;
  rewardId: string;
  rewardVersion: number;
  application: RewardApplication;
  status: 'PENDING' | 'CONFIRMED' | 'CONSUMED' | 'VOIDED';
  createdAt: Date;
}

export interface RedemptionEligibilityCheck {
  eligible: boolean;
  reason?: string;
  intent?: RedemptionIntent;
}
