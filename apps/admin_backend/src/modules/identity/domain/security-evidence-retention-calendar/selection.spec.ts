import { computeInclusiveEnd, selectPolicy, validatePolicy } from './policy';
import type { ValidatedPolicy } from './policy';

const pol = (
  cat: 'security/forensic' | 'fiscal/DGI' | 'unknown',
  dur: number,
  eff: string,
): ValidatedPolicy => ({
  category: cat,
  durationYears: dur,
  effectiveDate: eff as import('./calendar').DateOnly,
});

describe('policy validation and selection (Child 2)', () => {
  it('S8 accepts valid policies (5,6,7) and rejects out of range', () => {
    expect(
      validatePolicy({
        category: 'security/forensic',
        durationYears: 5,
        effectiveDate: '2024-01-01',
      }).ok,
    ).toBe(true);
    expect(
      validatePolicy({
        category: 'fiscal/DGI',
        durationYears: 7,
        effectiveDate: '2023-06-15',
      }).ok,
    ).toBe(true);
    expect(
      validatePolicy({
        category: 'security/forensic',
        durationYears: 4,
        effectiveDate: '2024-01-01',
      }),
    ).toEqual({
      ok: false,
      error: { code: 'INVALID_POLICY', reason: 'DURATION_OUT_OF_RANGE' },
    });
    expect(
      validatePolicy({
        category: 'security/forensic',
        durationYears: 8,
        effectiveDate: '2024-01-01',
      }),
    ).toEqual({
      ok: false,
      error: { code: 'INVALID_POLICY', reason: 'DURATION_OUT_OF_RANGE' },
    });
  });

  it('S8 rejects non-record and invalid effective date', () => {
    expect(validatePolicy(null)).toEqual({
      ok: false,
      error: { code: 'INVALID_POLICY', reason: 'MALFORMED_SHAPE' },
    });
    expect(
      validatePolicy({
        category: 'x',
        durationYears: 5,
        effectiveDate: '2024-01-01',
      }),
    ).toEqual({
      ok: false,
      error: { code: 'INVALID_POLICY', reason: 'MALFORMED_SHAPE' },
    });
    expect(
      validatePolicy({
        category: 'security/forensic',
        durationYears: 5,
        effectiveDate: 'bad',
      }),
    ).toEqual({
      ok: false,
      error: { code: 'INVALID_POLICY', reason: 'INVALID_EFFECTIVE_DATE' },
    });
  });

  const secPolicies = [
    pol('security/forensic', 5, '2023-01-01'),
    pol('security/forensic', 7, '2024-06-01'),
  ];
  const evidence = { category: 'security/forensic' as const };

  it('S9 selects latest policy with effectiveDate ≤ originDate', () => {
    const r = selectPolicy(
      evidence,
      '2025-01-15' as import('./calendar').DateOnly,
      secPolicies,
    );
    expect(r).toEqual({
      ok: true,
      value: pol('security/forensic', 7, '2024-06-01'),
    });
  });

  it('S9 returns NO_MATCH when no policies match category or date', () => {
    expect(
      selectPolicy(evidence, '2025-01-01' as import('./calendar').DateOnly, [
        pol('fiscal/DGI', 5, '2024-01-01'),
      ]),
    ).toEqual({
      ok: false,
      error: { code: 'NO_APPLICABLE_POLICY', reason: 'NO_MATCH' },
    });
    expect(
      selectPolicy(evidence, '2025-01-01' as import('./calendar').DateOnly, [
        pol('security/forensic', 5, '2026-01-01'),
      ]),
    ).toEqual({
      ok: false,
      error: { code: 'NO_APPLICABLE_POLICY', reason: 'NO_MATCH' },
    });
  });

  it('S9 returns TIE when two policies share the latest effectiveDate', () => {
    const tie = [
      pol('security/forensic', 5, '2024-06-01'),
      pol('security/forensic', 7, '2024-06-01'),
    ];
    expect(
      selectPolicy(
        evidence,
        '2025-01-01' as import('./calendar').DateOnly,
        tie,
      ),
    ).toEqual({
      ok: false,
      error: { code: 'NO_APPLICABLE_POLICY', reason: 'TIE' },
    });
  });

  it('computeInclusiveEnd subtracts one day from origin + duration', () => {
    expect(
      computeInclusiveEnd(
        '2025-01-01' as import('./calendar').DateOnly,
        pol('security/forensic', 5, '2024-01-01'),
      ),
    ).toEqual({ ok: true, value: '2029-12-31' });
    expect(
      computeInclusiveEnd(
        '2024-02-29' as import('./calendar').DateOnly,
        pol('security/forensic', 1, '2024-01-01'),
      ),
    ).toEqual({ ok: true, value: '2025-02-27' });
  });
});
