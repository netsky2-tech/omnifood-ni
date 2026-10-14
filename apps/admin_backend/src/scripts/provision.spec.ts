import { assertSeedOutcome } from './provision-seed-guard';

/**
 * Review R3-1 hardening (owner decision: hard verification). A provisioned
 * tenant whose catalog seeding wrote zero values must fail the provision —
 * the terminal would be born without master catalogs (the exact #903
 * defect), and a green "✅ Provisión completada" for it would be a lie.
 */
describe('provision assertSeedOutcome (hard seed verification)', () => {
  it('accepts a full default seed (positive count)', () => {
    expect(() => assertSeedOutcome('tenant-1', 32)).not.toThrow();
  });

  it('rejects a zero-value seed write with an actionable message', () => {
    expect(() => assertSeedOutcome('tenant-1', 0)).toThrow(
      /wrote 0 values for tenant tenant-1/,
    );
  });

  it('rejects negative and non-finite counts (defensive)', () => {
    expect(() => assertSeedOutcome('tenant-1', -1)).toThrow();
    expect(() => assertSeedOutcome('tenant-1', Number.NaN)).toThrow();
  });
});
