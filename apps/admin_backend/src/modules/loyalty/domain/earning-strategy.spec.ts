import { SpendPointsStrategy, ProductStampsStrategy, VisitStampsStrategy } from './earning-strategy';
import { LoyaltyTicketSnapshot } from './loyalty-ticket-snapshot';
import { LoyaltyProgram, LoyaltyProgramStatus, LoyaltyProgramType } from '../entities/loyalty-program.entity';

function makeSnapshot(overrides?: Partial<LoyaltyTicketSnapshot>): LoyaltyTicketSnapshot {
  return {
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    terminalId: 'terminal-1',
    ticketId: 'ticket-1',
    customerId: 'cust-1',
    paidAt: new Date('2026-09-01T12:00:00Z'),
    lines: [
      {
        lineId: 'line-1',
        productId: 'prod-1',
        quantity: 2,
        merchandiseNetNioAfterAllBenefits: 100,
        source: 'NORMAL',
      },
    ],
    ...overrides,
  };
}

function makeProgram(overrides?: Partial<LoyaltyProgram>): LoyaltyProgram {
  return {
    id: 'prog-1',
    tenant_id: 'tenant-1',
    name: 'Test Program',
    program_type: LoyaltyProgramType.SPEND_POINTS,
    status: LoyaltyProgramStatus.ACTIVE,
    earning_rule: { spendBlockNio: 10, pointsPerBlock: 1 },
    eligibility_rule: {},
    config_version: 1,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as LoyaltyProgram;
}

describe('SpendPointsStrategy', () => {
  const strategy = new SpendPointsStrategy();

  it('returns null for zero eligible spend', () => {
    const snapshot = makeSnapshot({ lines: [] });
    const program = makeProgram();
    expect(strategy.evaluate(snapshot, program)).toBeNull();
  });

  it('returns null when spend < spendBlock', () => {
    const snapshot = makeSnapshot({
      lines: [{ lineId: 'l1', productId: 'p1', quantity: 1, merchandiseNetNioAfterAllBenefits: 5, source: 'NORMAL' }],
    });
    const program = makeProgram({ earning_rule: { spendBlockNio: 10, pointsPerBlock: 1 } });
    expect(strategy.evaluate(snapshot, program)).toBeNull();
  });

  it('calculates floor(eligibleSpend / spendBlock) * pointsPerBlock and records earningBaseNio in commercialSnapshot', () => {
    const snapshot = makeSnapshot({
      lines: [{ lineId: 'l1', productId: 'p1', quantity: 1, merchandiseNetNioAfterAllBenefits: 250, source: 'NORMAL' }],
    });
    const program = makeProgram({ earning_rule: { spendBlockNio: 10, pointsPerBlock: 1 } });
    const result = strategy.evaluate(snapshot, program);
    expect(result).not.toBeNull();
    expect(result!.units).toBe(25);
    expect(result!.commercialSnapshot.earningBaseNio).toBe(250);
  });

  it('applies floor for fractional blocks', () => {
    const snapshot = makeSnapshot({
      lines: [{ lineId: 'l1', productId: 'p1', quantity: 1, merchandiseNetNioAfterAllBenefits: 99, source: 'NORMAL' }],
    });
    const program = makeProgram({ earning_rule: { spendBlockNio: 10, pointsPerBlock: 1 } });
    const result = strategy.evaluate(snapshot, program);
    expect(result).not.toBeNull();
    expect(result!.units).toBe(9);
  });

  it('excludes LOYALTY_REWARD lines from eligible spend', () => {
    const snapshot = makeSnapshot({
      lines: [
        { lineId: 'l1', productId: 'p1', quantity: 1, merchandiseNetNioAfterAllBenefits: 200, source: 'NORMAL' },
        { lineId: 'l2', productId: 'p2', quantity: 1, merchandiseNetNioAfterAllBenefits: 50, source: 'LOYALTY_REWARD' },
      ],
    });
    const program = makeProgram({ earning_rule: { spendBlockNio: 10, pointsPerBlock: 1 } });
    const result = strategy.evaluate(snapshot, program);
    expect(result!.units).toBe(20);
  });

  it('handles multiple normal lines', () => {
    const snapshot = makeSnapshot({
      lines: [
        { lineId: 'l1', productId: 'p1', quantity: 1, merchandiseNetNioAfterAllBenefits: 60, source: 'NORMAL' },
        { lineId: 'l2', productId: 'p2', quantity: 1, merchandiseNetNioAfterAllBenefits: 40, source: 'NORMAL' },
      ],
    });
    const program = makeProgram({ earning_rule: { spendBlockNio: 10, pointsPerBlock: 2 } });
    const result = strategy.evaluate(snapshot, program);
    expect(result!.units).toBe(20);
  });
});

describe('ProductStampsStrategy', () => {
  const strategy = new ProductStampsStrategy();

  it('returns null for empty lines', () => {
    const snapshot = makeSnapshot({ lines: [] });
    const program = makeProgram({ program_type: LoyaltyProgramType.PRODUCT_STAMPS });
    expect(strategy.evaluate(snapshot, program)).toBeNull();
  });

  it('counts discrete quantities of eligible products and records earningBaseNio', () => {
    const snapshot = makeSnapshot({
      lines: [
        { lineId: 'l1', productId: 'prod-1', quantity: 3, merchandiseNetNioAfterAllBenefits: 30, source: 'NORMAL' },
        { lineId: 'l2', productId: 'prod-2', quantity: 2, merchandiseNetNioAfterAllBenefits: 20, source: 'NORMAL' },
      ],
    });
    const program = makeProgram({
      program_type: LoyaltyProgramType.PRODUCT_STAMPS,
      earning_rule: { eligibleProductIds: ['prod-1'], unitsPerPurchasedUnit: 1 },
    });
    const result = strategy.evaluate(snapshot, program);
    expect(result).not.toBeNull();
    expect(result!.units).toBe(3);
    expect(result!.commercialSnapshot.earningBaseNio).toBe(30);
  });

  it('excludes fractional quantities', () => {
    const snapshot = makeSnapshot({
      lines: [
        { lineId: 'l1', productId: 'prod-1', quantity: 2.5, merchandiseNetNioAfterAllBenefits: 25, source: 'NORMAL' },
      ],
    });
    const program = makeProgram({
      program_type: LoyaltyProgramType.PRODUCT_STAMPS,
      earning_rule: { eligibleProductIds: ['prod-1'], unitsPerPurchasedUnit: 1 },
    });
    expect(strategy.evaluate(snapshot, program)).toBeNull();
  });

  it('excludes LOYALTY_REWARD lines', () => {
    const snapshot = makeSnapshot({
      lines: [
        { lineId: 'l1', productId: 'prod-1', quantity: 2, merchandiseNetNioAfterAllBenefits: 20, source: 'LOYALTY_REWARD' },
      ],
    });
    const program = makeProgram({
      program_type: LoyaltyProgramType.PRODUCT_STAMPS,
      earning_rule: { eligibleProductIds: ['prod-1'], unitsPerPurchasedUnit: 1 },
    });
    expect(strategy.evaluate(snapshot, program)).toBeNull();
  });

  it('applies unitsPerPurchasedUnit multiplier', () => {
    const snapshot = makeSnapshot({
      lines: [
        { lineId: 'l1', productId: 'prod-1', quantity: 2, merchandiseNetNioAfterAllBenefits: 20, source: 'NORMAL' },
      ],
    });
    const program = makeProgram({
      program_type: LoyaltyProgramType.PRODUCT_STAMPS,
      earning_rule: { eligibleProductIds: ['prod-1'], unitsPerPurchasedUnit: 3 },
    });
    const result = strategy.evaluate(snapshot, program);
    expect(result!.units).toBe(6);
  });

  it('matches by categoryId', () => {
    const snapshot = makeSnapshot({
      lines: [
        { lineId: 'l1', productId: 'p1', categoryId: 'cat-1', quantity: 2, merchandiseNetNioAfterAllBenefits: 20, source: 'NORMAL' },
        { lineId: 'l2', productId: 'p2', categoryId: 'cat-2', quantity: 1, merchandiseNetNioAfterAllBenefits: 10, source: 'NORMAL' },
      ],
    });
    const program = makeProgram({
      program_type: LoyaltyProgramType.PRODUCT_STAMPS,
      earning_rule: { eligibleCategoryIds: ['cat-1'], unitsPerPurchasedUnit: 1 },
    });
    const result = strategy.evaluate(snapshot, program);
    expect(result!.units).toBe(2);
  });
});

describe('VisitStampsStrategy', () => {
  const strategy = new VisitStampsStrategy();

  it('returns 1 visit stamp for any eligible ticket and records earningBaseNio', () => {
    const snapshot = makeSnapshot();
    const program = makeProgram({
      program_type: LoyaltyProgramType.VISIT_STAMPS,
      earning_rule: { unitsPerVisit: 1 },
    });
    const result = strategy.evaluate(snapshot, program);
    expect(result).not.toBeNull();
    expect(result!.units).toBe(1);
    expect(result!.commercialSnapshot.earningBaseNio).toBe(100);
  });

  it('returns null when minimumSpendNio not met', () => {
    const snapshot = makeSnapshot({
      lines: [{ lineId: 'l1', productId: 'p1', quantity: 1, merchandiseNetNioAfterAllBenefits: 5, source: 'NORMAL' }],
    });
    const program = makeProgram({
      program_type: LoyaltyProgramType.VISIT_STAMPS,
      earning_rule: { unitsPerVisit: 1, minimumSpendNio: 10 },
    });
    expect(strategy.evaluate(snapshot, program)).toBeNull();
  });

  it('returns stamp when minimumSpendNio met', () => {
    const snapshot = makeSnapshot({
      lines: [{ lineId: 'l1', productId: 'p1', quantity: 1, merchandiseNetNioAfterAllBenefits: 15, source: 'NORMAL' }],
    });
    const program = makeProgram({
      program_type: LoyaltyProgramType.VISIT_STAMPS,
      earning_rule: { unitsPerVisit: 1, minimumSpendNio: 10 },
    });
    const result = strategy.evaluate(snapshot, program);
    expect(result).not.toBeNull();
    expect(result!.units).toBe(1);
  });

  it('applies unitsPerVisit multiplier', () => {
    const snapshot = makeSnapshot();
    const program = makeProgram({
      program_type: LoyaltyProgramType.VISIT_STAMPS,
      earning_rule: { unitsPerVisit: 2 },
    });
    const result = strategy.evaluate(snapshot, program);
    expect(result!.units).toBe(2);
  });

  it('uses normal lines only for minimumSpendNio check', () => {
    const snapshot = makeSnapshot({
      lines: [
        { lineId: 'l1', productId: 'p1', quantity: 1, merchandiseNetNioAfterAllBenefits: 5, source: 'NORMAL' },
        { lineId: 'l2', productId: 'p2', quantity: 1, merchandiseNetNioAfterAllBenefits: 100, source: 'LOYALTY_REWARD' },
      ],
    });
    const program = makeProgram({
      program_type: LoyaltyProgramType.VISIT_STAMPS,
      earning_rule: { unitsPerVisit: 1, minimumSpendNio: 10 },
    });
    expect(strategy.evaluate(snapshot, program)).toBeNull();
  });
});
