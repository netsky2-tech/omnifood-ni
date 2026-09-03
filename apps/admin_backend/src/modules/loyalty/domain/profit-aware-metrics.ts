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

export interface EarnTransactionRecord {
  id: string;
  programId: string;
  units: number;
  occurredAt: Date;
  earningBaseNio?: number | null;
  isReversed: boolean;
}

export interface RedeemTransactionRecord {
  id: string;
  rewardId: string;
  rewardType: 'DISCOUNT_AMOUNT' | 'FREE_PRODUCT';
  occurredAt: Date;
  appliedBenefitNio?: number | null;
  estimatedRedemptionCostNio?: number | null;
  rewardQuantity?: number | null;
  costStatus?: string | null;
  isReversed: boolean;
}

export function metricAvailable<T>(
  value: T,
  asOfUtc: string,
  metadata?: Record<string, unknown>,
): ProfitAwareMetric<T> {
  return {
    status: 'AVAILABLE',
    value,
    asOfUtc,
    ...(metadata ? { metadata } : {}),
  };
}

export function metricNotAvailable<T>(
  reason: string,
  asOfUtc: string,
): ProfitAwareMetric<T> {
  return {
    status: 'NOT_AVAILABLE',
    reason,
    asOfUtc,
  };
}

export function metricStale<T>(
  value: T,
  asOfUtc: string,
  lastCompleteSyncAt?: string,
  source?: string,
): ProfitAwareMetric<T> {
  return {
    status: 'STALE',
    value,
    asOfUtc,
    ...(lastCompleteSyncAt ? { lastCompleteSyncAt } : {}),
    ...(source ? { source } : {}),
  };
}

export function metricNotApplicable<T>(reason: string): ProfitAwareMetric<T> {
  return {
    status: 'NOT_APPLICABLE',
    reason,
  };
}

const EXACT_30_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Computes the exact 30x24h semi-open window [asOf - 30d, asOf)
 */
export function computeProfitAwareWindow(asOfUtc: Date): ProfitAwareWindow {
  const endMs = asOfUtc.getTime();
  const startMs = endMs - EXACT_30_DAYS_MS;
  return {
    startUtc: new Date(startMs).toISOString(),
    endUtc: asOfUtc.toISOString(),
    label: 'LAST_30_DAYS',
  };
}

/**
 * Calculates qualifiedSalesNio from EARN transactions within the window [startUtc, endUtc)
 * Each positive EARN contributes its historical earningBaseNio unless reversed as of asOfUtc.
 */
export function calculateQualifiedSales(
  earns: EarnTransactionRecord[],
  window: ProfitAwareWindow,
  asOfUtc: Date,
): ProfitAwareMetric<number> {
  const startMs = new Date(window.startUtc).getTime();
  const endMs = new Date(window.endUtc).getTime();

  let sumNio = 0;

  for (const earn of earns) {
    if (earn.isReversed) continue;
    if (earn.units <= 0) continue;

    const txTime = earn.occurredAt.getTime();
    // Semi-open: [startUtc, endUtc)
    if (txTime >= startMs && txTime < endMs) {
      const base = Number(earn.earningBaseNio ?? 0);
      sumNio += base;
    }
  }

  const rounded = Math.round(sumNio * 10000) / 10000;
  return metricAvailable(rounded, asOfUtc.toISOString());
}

/**
 * Calculates estimatedIncentiveCostInWindowNio for a specific reward.
 * For DISCOUNT_AMOUNT: sum of appliedBenefitNio.
 * For FREE_PRODUCT: sum of estimatedRedemptionCostNio. If any unreversed redemption lacks cost, returns NOT_AVAILABLE.
 */
export function calculateEstimatedIncentiveCostInWindow(
  redeems: RedeemTransactionRecord[],
  window: ProfitAwareWindow,
  asOfUtc: Date,
): ProfitAwareMetric<number> {
  const startMs = new Date(window.startUtc).getTime();
  const endMs = new Date(window.endUtc).getTime();

  let sumNio = 0;

  for (const redeem of redeems) {
    if (redeem.isReversed) continue;

    const txTime = redeem.occurredAt.getTime();
    if (txTime >= startMs && txTime < endMs) {
      if (redeem.rewardType === 'DISCOUNT_AMOUNT') {
        const benefit = Number(redeem.appliedBenefitNio ?? 0);
        sumNio += benefit;
      } else if (redeem.rewardType === 'FREE_PRODUCT') {
        if (
          redeem.estimatedRedemptionCostNio === null ||
          redeem.estimatedRedemptionCostNio === undefined ||
          redeem.costStatus === 'NOT_AVAILABLE'
        ) {
          return metricNotAvailable('INCOMPLETE_REDEMPTION_COST_COVERAGE', asOfUtc.toISOString());
        }
        sumNio += Number(redeem.estimatedRedemptionCostNio);
      }
    }
  }

  const rounded = Math.round(sumNio * 10000) / 10000;
  return metricAvailable(rounded, asOfUtc.toISOString());
}

/**
 * Calculates effectiveIncentiveRatePct = (estimatedIncentiveCostInWindow / qualifiedSales) * 100
 */
export function calculateEffectiveIncentiveRate(
  incentiveCost: ProfitAwareMetric<number>,
  qualifiedSales: ProfitAwareMetric<number>,
  asOfUtc: Date,
): ProfitAwareMetric<number> {
  if (qualifiedSales.status !== 'AVAILABLE' && qualifiedSales.status !== 'STALE') {
    return metricNotAvailable(qualifiedSales.reason ?? 'UNKNOWN_QUALIFIED_SALES', asOfUtc.toISOString());
  }

  const salesVal = Number(qualifiedSales.value ?? 0);
  if (salesVal === 0) {
    return metricNotAvailable('NO_QUALIFIED_SALES', asOfUtc.toISOString());
  }

  if (incentiveCost.status !== 'AVAILABLE' && incentiveCost.status !== 'STALE') {
    return metricNotAvailable('INCOMPLETE_COST_COVERAGE', asOfUtc.toISOString());
  }

  const costVal = Number(incentiveCost.value ?? 0);
  if (costVal === 0) {
    return metricAvailable(0, asOfUtc.toISOString());
  }

  // Exact division without preliminary rounding of operands
  const rawRate = (costVal / salesVal) * 100;
  // Format with up to 4 decimal precision, rounded appropriately
  const roundedRate = Math.round(rawRate * 10000) / 10000;

  if (incentiveCost.status === 'STALE' || qualifiedSales.status === 'STALE') {
    return metricStale(
      roundedRate,
      asOfUtc.toISOString(),
      incentiveCost.lastCompleteSyncAt ?? qualifiedSales.lastCompleteSyncAt,
      'CALCULATED_FROM_STALE_SOURCE',
    );
  }

  return metricAvailable(roundedRate, asOfUtc.toISOString());
}

export interface RewardCostInput {
  rewardType: 'DISCOUNT_AMOUNT' | 'FREE_PRODUCT';
  benefitConfig: Record<string, unknown>;
  canonicalBasePrice?: number | null;
  estimatedCpp?: number | null;
  asOfUtc: Date;
}

export function calculateRewardCostMetrics(input: RewardCostInput): {
  retailPriceNio: ProfitAwareMetric<number>;
  estimatedCppNio: ProfitAwareMetric<number>;
  estimatedRewardCostNio: ProfitAwareMetric<number>;
} {
  const asOfStr = input.asOfUtc.toISOString();

  if (input.rewardType === 'DISCOUNT_AMOUNT') {
    const amount = Number(input.benefitConfig?.amountNio ?? 0);
    return {
      retailPriceNio: metricNotApplicable('ONLY_FOR_FREE_PRODUCT'),
      estimatedCppNio: metricNotApplicable('ONLY_FOR_FREE_PRODUCT'),
      estimatedRewardCostNio: metricAvailable(amount, asOfStr),
    };
  }

  // FREE_PRODUCT
  const qty = Number(input.benefitConfig?.quantity ?? 1);

  let retailPriceNio: ProfitAwareMetric<number>;
  if (input.canonicalBasePrice !== null && input.canonicalBasePrice !== undefined && input.canonicalBasePrice > 0) {
    retailPriceNio = metricAvailable(Number(input.canonicalBasePrice), asOfStr);
  } else {
    retailPriceNio = metricNotAvailable('NO_CANONICAL_BASE_PRICE', asOfStr);
  }

  let estimatedCppNio: ProfitAwareMetric<number>;
  let estimatedRewardCostNio: ProfitAwareMetric<number>;

  if (input.estimatedCpp !== null && input.estimatedCpp !== undefined && input.estimatedCpp >= 0) {
    const cpp = Number(input.estimatedCpp);
    estimatedCppNio = metricAvailable(cpp, asOfStr);
    const rewardCost = Math.round(cpp * qty * 10000) / 10000;
    estimatedRewardCostNio = metricAvailable(rewardCost, asOfStr);
  } else {
    estimatedCppNio = metricNotAvailable('COST_NOT_RESOLVABLE', asOfStr);
    estimatedRewardCostNio = metricNotAvailable('COST_NOT_RESOLVABLE', asOfStr);
  }

  return {
    retailPriceNio,
    estimatedCppNio,
    estimatedRewardCostNio,
  };
}
