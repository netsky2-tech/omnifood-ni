import {
  computeProfitAwareWindow,
  calculateQualifiedSales,
  calculateEstimatedIncentiveCostInWindow,
  calculateEffectiveIncentiveRate,
  calculateRewardCostMetrics,
  metricAvailable,
  metricNotAvailable,
  metricStale,
  metricNotApplicable,
  EarnTransactionRecord,
  RedeemTransactionRecord,
} from './profit-aware-metrics';

describe('ProfitAwareMetrics Domain (MC-01 .. MC-10)', () => {
  const asOfUtc = new Date('2026-09-02T12:00:00.000Z');

  describe('MC-01 — Exact 30-day window [asOf - 30d, asOf)', () => {
    it('computes exact 30-day semi-open window', () => {
      const window = computeProfitAwareWindow(asOfUtc);
      expect(window.endUtc).toBe('2026-09-02T12:00:00.000Z');
      expect(window.startUtc).toBe('2026-08-03T12:00:00.000Z');
      expect(window.label).toBe('LAST_30_DAYS');
    });

    it('includes movement at exact windowStartUtc and excludes movement at windowEndUtc', () => {
      const window = computeProfitAwareWindow(asOfUtc);
      const startMs = new Date(window.startUtc).getTime();
      const endMs = new Date(window.endUtc).getTime();

      const earnAtStart: EarnTransactionRecord = {
        id: 'tx-1',
        programId: 'prog-1',
        units: 10,
        occurredAt: new Date(startMs),
        earningBaseNio: 100,
        isReversed: false,
      };

      const earnAtEnd: EarnTransactionRecord = {
        id: 'tx-2',
        programId: 'prog-1',
        units: 10,
        occurredAt: new Date(endMs),
        earningBaseNio: 200,
        isReversed: false,
      };

      const earnInside: EarnTransactionRecord = {
        id: 'tx-3',
        programId: 'prog-1',
        units: 10,
        occurredAt: new Date(startMs + 1000),
        earningBaseNio: 300,
        isReversed: false,
      };

      const qualified = calculateQualifiedSales([earnAtStart, earnAtEnd, earnInside], window, asOfUtc);
      // earnAtStart (100) + earnInside (300) = 400. earnAtEnd is excluded!
      expect(qualified.status).toBe('AVAILABLE');
      expect(qualified.value).toBe(400);
    });
  });

  describe('MC-02 — qualifiedSales uses historical snapshot', () => {
    it('sums earningBaseNio from snapshot without re-evaluating rules', () => {
      const window = computeProfitAwareWindow(asOfUtc);
      const earns: EarnTransactionRecord[] = [
        {
          id: 'tx-1',
          programId: 'prog-1',
          units: 25,
          occurredAt: new Date('2026-08-15T10:00:00Z'),
          earningBaseNio: 250,
          isReversed: false,
        },
        {
          id: 'tx-2',
          programId: 'prog-1',
          units: 10,
          occurredAt: new Date('2026-08-20T10:00:00Z'),
          earningBaseNio: 150.5,
          isReversed: false,
        },
      ];

      const res = calculateQualifiedSales(earns, window, asOfUtc);
      expect(res.status).toBe('AVAILABLE');
      expect(res.value).toBe(400.5);
    });
  });

  describe('MC-03 — Reversals exclude contribution', () => {
    it('excludes EARN movements that are reversed as of asOfUtc', () => {
      const window = computeProfitAwareWindow(asOfUtc);
      const earns: EarnTransactionRecord[] = [
        {
          id: 'tx-1',
          programId: 'prog-1',
          units: 25,
          occurredAt: new Date('2026-08-15T10:00:00Z'),
          earningBaseNio: 250,
          isReversed: true, // reversed!
        },
        {
          id: 'tx-2',
          programId: 'prog-1',
          units: 10,
          occurredAt: new Date('2026-08-20T10:00:00Z'),
          earningBaseNio: 100,
          isReversed: false,
        },
      ];

      const res = calculateQualifiedSales(earns, window, asOfUtc);
      expect(res.status).toBe('AVAILABLE');
      expect(res.value).toBe(100);
    });
  });

  describe('MC-04 & MC-05 & MC-06 — Reward cost & retail price', () => {
    it('calculates DISCOUNT_AMOUNT: nominal cost, retailPrice NOT_APPLICABLE, CPP NOT_APPLICABLE', () => {
      const res = calculateRewardCostMetrics({
        rewardType: 'DISCOUNT_AMOUNT',
        benefitConfig: { amountNio: 50 },
        asOfUtc,
      });

      expect(res.retailPriceNio.status).toBe('NOT_APPLICABLE');
      expect(res.estimatedCppNio.status).toBe('NOT_APPLICABLE');
      expect(res.estimatedRewardCostNio.status).toBe('AVAILABLE');
      expect(res.estimatedRewardCostNio.value).toBe(50);
    });

    it('calculates FREE_PRODUCT with available price and CPP', () => {
      const res = calculateRewardCostMetrics({
        rewardType: 'FREE_PRODUCT',
        benefitConfig: { productId: 'prod-1', quantity: 2 },
        canonicalBasePrice: 120,
        estimatedCpp: 45,
        asOfUtc,
      });

      expect(res.retailPriceNio.status).toBe('AVAILABLE');
      expect(res.retailPriceNio.value).toBe(120);
      expect(res.estimatedCppNio.status).toBe('AVAILABLE');
      expect(res.estimatedCppNio.value).toBe(45);
      // estimatedRewardCostNio = CPP * quantity = 45 * 2 = 90
      expect(res.estimatedRewardCostNio.status).toBe('AVAILABLE');
      expect(res.estimatedRewardCostNio.value).toBe(90);
    });

    it('returns NOT_AVAILABLE when FREE_PRODUCT lacks base price or CPP', () => {
      const resNoPrice = calculateRewardCostMetrics({
        rewardType: 'FREE_PRODUCT',
        benefitConfig: { productId: 'prod-1', quantity: 1 },
        canonicalBasePrice: null,
        estimatedCpp: 45,
        asOfUtc,
      });
      expect(resNoPrice.retailPriceNio.status).toBe('NOT_AVAILABLE');
      expect(resNoPrice.retailPriceNio.reason).toBe('NO_CANONICAL_BASE_PRICE');

      const resNoCpp = calculateRewardCostMetrics({
        rewardType: 'FREE_PRODUCT',
        benefitConfig: { productId: 'prod-1', quantity: 1 },
        canonicalBasePrice: 100,
        estimatedCpp: null,
        asOfUtc,
      });
      expect(resNoCpp.estimatedCppNio.status).toBe('NOT_AVAILABLE');
      expect(resNoCpp.estimatedCppNio.reason).toBe('COST_NOT_RESOLVABLE');
      expect(resNoCpp.estimatedRewardCostNio.status).toBe('NOT_AVAILABLE');
      expect(resNoCpp.estimatedRewardCostNio.reason).toBe('COST_NOT_RESOLVABLE');
    });
  });

  describe('MC-07 — Rate calculable (C$120 / C$20,000 = 0.60%)', () => {
    it('computes exact rate without premature rounding of operands', () => {
      const window = computeProfitAwareWindow(asOfUtc);
      const redeems: RedeemTransactionRecord[] = [
        {
          id: 'red-1',
          rewardId: 'rew-1',
          rewardType: 'DISCOUNT_AMOUNT',
          occurredAt: new Date('2026-08-10T10:00:00Z'),
          appliedBenefitNio: 120,
          isReversed: false,
        },
      ];

      const incentiveCost = calculateEstimatedIncentiveCostInWindow(redeems, window, asOfUtc);
      expect(incentiveCost.status).toBe('AVAILABLE');
      expect(incentiveCost.value).toBe(120);

      const qualifiedSales = metricAvailable(20000, asOfUtc.toISOString());
      const rate = calculateEffectiveIncentiveRate(incentiveCost, qualifiedSales, asOfUtc);

      expect(rate.status).toBe('AVAILABLE');
      expect(rate.value).toBe(0.6); // 0.60%
    });

    it('supports rate exceeding 100% without artificial clamp', () => {
      const incentiveCost = metricAvailable(2500, asOfUtc.toISOString());
      const qualifiedSales = metricAvailable(2000, asOfUtc.toISOString());
      const rate = calculateEffectiveIncentiveRate(incentiveCost, qualifiedSales, asOfUtc);

      expect(rate.status).toBe('AVAILABLE');
      expect(rate.value).toBe(125.0); // 125%
    });
  });

  describe('MC-08 — Sales > 0 with zero redemptions => 0.00%', () => {
    it('returns 0.00% when qualified sales exist and incentive cost is 0', () => {
      const window = computeProfitAwareWindow(asOfUtc);
      const redeems: RedeemTransactionRecord[] = [];

      const incentiveCost = calculateEstimatedIncentiveCostInWindow(redeems, window, asOfUtc);
      expect(incentiveCost.status).toBe('AVAILABLE');
      expect(incentiveCost.value).toBe(0);

      const qualifiedSales = metricAvailable(5000, asOfUtc.toISOString());
      const rate = calculateEffectiveIncentiveRate(incentiveCost, qualifiedSales, asOfUtc);

      expect(rate.status).toBe('AVAILABLE');
      expect(rate.value).toBe(0);
    });
  });

  describe('MC-09 — Zero sales / incomplete cost => NOT_AVAILABLE', () => {
    it('returns NOT_AVAILABLE(NO_QUALIFIED_SALES) when qualified sales is 0', () => {
      const incentiveCost = metricAvailable(100, asOfUtc.toISOString());
      const qualifiedSales = metricAvailable(0, asOfUtc.toISOString());
      const rate = calculateEffectiveIncentiveRate(incentiveCost, qualifiedSales, asOfUtc);

      expect(rate.status).toBe('NOT_AVAILABLE');
      expect(rate.reason).toBe('NO_QUALIFIED_SALES');
    });

    it('returns NOT_AVAILABLE(INCOMPLETE_REDEMPTION_COST_COVERAGE) when FREE_PRODUCT redemption lacks cost', () => {
      const window = computeProfitAwareWindow(asOfUtc);
      const redeems: RedeemTransactionRecord[] = [
        {
          id: 'red-1',
          rewardId: 'rew-free-1',
          rewardType: 'FREE_PRODUCT',
          occurredAt: new Date('2026-08-10T10:00:00Z'),
          estimatedRedemptionCostNio: null, // Cost missing!
          costStatus: 'NOT_AVAILABLE',
          isReversed: false,
        },
      ];

      const incentiveCost = calculateEstimatedIncentiveCostInWindow(redeems, window, asOfUtc);
      expect(incentiveCost.status).toBe('NOT_AVAILABLE');
      expect(incentiveCost.reason).toBe('INCOMPLETE_REDEMPTION_COST_COVERAGE');

      const qualifiedSales = metricAvailable(10000, asOfUtc.toISOString());
      const rate = calculateEffectiveIncentiveRate(incentiveCost, qualifiedSales, asOfUtc);
      expect(rate.status).toBe('NOT_AVAILABLE');
      expect(rate.reason).toBe('INCOMPLETE_COST_COVERAGE');
    });
  });

  describe('MC-10 — Stale propagation and builders', () => {
    it('propagates STALE state when source is stale', () => {
      const stale = metricStale(100, asOfUtc.toISOString(), '2026-09-01T00:00:00Z', 'INVENTORY_MIRROR');
      expect(stale.status).toBe('STALE');
      expect(stale.value).toBe(100);
      expect(stale.lastCompleteSyncAt).toBe('2026-09-01T00:00:00Z');
      expect(stale.source).toBe('INVENTORY_MIRROR');
    });
  });

  describe('Triangulation — Combinations & edge cases', () => {
    it('calculates FREE_PRODUCT with quantity > 1 (qty 3 * CPP 25 = 75)', () => {
      const res = calculateRewardCostMetrics({
        rewardType: 'FREE_PRODUCT',
        benefitConfig: { productId: 'p1', quantity: 3 },
        canonicalBasePrice: 50,
        estimatedCpp: 25,
        asOfUtc,
      });

      expect(res.estimatedRewardCostNio.status).toBe('AVAILABLE');
      expect(res.estimatedRewardCostNio.value).toBe(75);
    });

    it('calculates rate precision with repeating decimals (100 / 300 = 33.3333%)', () => {
      const incentiveCost = metricAvailable(100, asOfUtc.toISOString());
      const qualifiedSales = metricAvailable(300, asOfUtc.toISOString());
      const rate = calculateEffectiveIncentiveRate(incentiveCost, qualifiedSales, asOfUtc);

      expect(rate.status).toBe('AVAILABLE');
      expect(rate.value).toBe(33.3333);
    });

    it('ignores EARN movements with units <= 0 or earningBaseNio <= 0 in qualifiedSales', () => {
      const window = computeProfitAwareWindow(asOfUtc);
      const earns: EarnTransactionRecord[] = [
        {
          id: 'tx-0',
          programId: 'prog-1',
          units: 0,
          occurredAt: new Date('2026-08-10T10:00:00Z'),
          earningBaseNio: 100,
          isReversed: false,
        },
        {
          id: 'tx-neg',
          programId: 'prog-1',
          units: -5,
          occurredAt: new Date('2026-08-11T10:00:00Z'),
          earningBaseNio: 50,
          isReversed: false,
        },
        {
          id: 'tx-valid',
          programId: 'prog-1',
          units: 10,
          occurredAt: new Date('2026-08-12T10:00:00Z'),
          earningBaseNio: 200,
          isReversed: false,
        },
      ];

      const res = calculateQualifiedSales(earns, window, asOfUtc);
      expect(res.status).toBe('AVAILABLE');
      expect(res.value).toBe(200);
    });
  });
});
