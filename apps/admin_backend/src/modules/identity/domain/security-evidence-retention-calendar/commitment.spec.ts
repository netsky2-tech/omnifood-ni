import { createCommitment, extendCommitment } from './commitment';
import { validateCommitmentId } from './identifiers';
import { validateHoldRef } from './holds';
import type { CommitmentSnapshot } from './commitment';
import type { ValidatedEvidenceInput } from './evidence';
import type { ValidatedPolicy } from './policy';

const evidence = (
  cat: 'security/forensic' | 'fiscal/DGI' | 'unknown',
): ValidatedEvidenceInput => ({
  category: cat,
  originDate: '2025-01-01' as import('./calendar').DateOnly,
  source: 'test',
});

const policy = (
  cat: 'security/forensic' | 'fiscal/DGI' | 'unknown',
  dur: number,
  eff: string,
): ValidatedPolicy => ({
  category: cat,
  durationYears: dur,
  effectiveDate: eff as import('./calendar').DateOnly,
});

const snapshot = (
  overrides?: Partial<CommitmentSnapshot>,
): CommitmentSnapshot => ({
  commitmentId: 'c1' as import('./identifiers').CommitmentId,
  category: 'security/forensic',
  originDate: '2025-01-01' as import('./calendar').DateOnly,
  effectiveDate: '2024-06-01' as import('./calendar').DateOnly,
  durationYears: 7,
  createdAt: '2025-01-01' as import('./calendar').DateOnly,
  ...overrides,
});

describe('commitment creation and extension (Child 3)', () => {
  it('S10 creates complete snapshot with all fields', () => {
    const result = createCommitment(
      'c1' as import('./identifiers').CommitmentId,
      evidence('security/forensic'),
      '2025-01-01' as import('./calendar').DateOnly,
      policy('security/forensic', 7, '2024-06-01'),
      'h1' as import('./holds').HoldRef,
    );
    expect(result).toEqual({
      ok: true,
      value: {
        commitmentId: 'c1',
        category: 'security/forensic',
        originDate: '2025-01-01',
        effectiveDate: '2024-06-01',
        durationYears: 7,
        holdRef: 'h1',
        createdAt: '2025-01-01',
      },
    });
  });

  it('S10 rejects originDate mismatch with evidence', () => {
    const result = createCommitment(
      'c1' as import('./identifiers').CommitmentId,
      evidence('security/forensic'),
      '2025-06-01' as import('./calendar').DateOnly,
      policy('security/forensic', 5, '2024-01-01'),
    );
    expect(result).toEqual({
      ok: false,
      error: { code: 'INVALID_EVIDENCE', reason: 'MALFORMED_SHAPE' },
    });
  });

  it('S10 rejects category mismatch between evidence and policy', () => {
    const result = createCommitment(
      'c1' as import('./identifiers').CommitmentId,
      evidence('fiscal/DGI'),
      '2025-01-01' as import('./calendar').DateOnly,
      policy('security/forensic', 5, '2024-01-01'),
    );
    expect(result).toEqual({
      ok: false,
      error: { code: 'INVALID_POLICY', reason: 'MALFORMED_SHAPE' },
    });
  });

  it('S11 creates valid successor with predecessor linkage', () => {
    const pred = snapshot({ durationYears: 5 });
    const result = extendCommitment(
      pred,
      'c2' as import('./identifiers').CommitmentId,
      policy('security/forensic', 7, '2025-06-01'),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.predecessorId).toBe('c1');
      expect(result.value.commitmentId).toBe('c2');
      expect(result.value.originDate).toBe('2025-06-01');
      expect(result.value.effectiveDate).toBe('2025-06-01');
      expect(result.value.durationYears).toBe(7);
    }
  });

  it('S11 inherits holdRef from predecessor when not provided', () => {
    const pred = snapshot({
      durationYears: 5,
      holdRef: 'h-old' as import('./holds').HoldRef,
    });
    const result = extendCommitment(
      pred,
      'c2' as import('./identifiers').CommitmentId,
      policy('security/forensic', 7, '2025-06-01'),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.holdRef).toBe('h-old');
  });

  it('S11 uses new holdRef when provided', () => {
    const pred = snapshot({
      durationYears: 5,
      holdRef: 'h-old' as import('./holds').HoldRef,
    });
    const result = extendCommitment(
      pred,
      'c2' as import('./identifiers').CommitmentId,
      policy('security/forensic', 7, '2025-06-01'),
      'h-new' as import('./holds').HoldRef,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.holdRef).toBe('h-new');
  });

  it('S12 rejects shortening (new duration < predecessor duration)', () => {
    const pred = snapshot({ durationYears: 7 });
    const result = extendCommitment(
      pred,
      'c2' as import('./identifiers').CommitmentId,
      policy('security/forensic', 5, '2025-06-01'),
    );
    expect(result).toEqual({
      ok: false,
      error: { code: 'INVALID_POLICY', reason: 'DURATION_OUT_OF_RANGE' },
    });
  });

  it('S12 rejects equal duration (no extension)', () => {
    const pred = snapshot({ durationYears: 5 });
    const result = extendCommitment(
      pred,
      'c2' as import('./identifiers').CommitmentId,
      policy('security/forensic', 5, '2025-06-01'),
    );
    expect(result).toEqual({
      ok: false,
      error: { code: 'INVALID_POLICY', reason: 'DURATION_OUT_OF_RANGE' },
    });
  });

  it('S12 accepts extension (new duration > predecessor duration)', () => {
    const pred = snapshot({ durationYears: 5 });
    const result = extendCommitment(
      pred,
      'c2' as import('./identifiers').CommitmentId,
      policy('security/forensic', 7, '2025-06-01'),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.durationYears).toBe(7);
  });

  it('S12 rejects category mismatch on extension', () => {
    const pred = snapshot({ category: 'fiscal/DGI' });
    const result = extendCommitment(
      pred,
      'c2' as import('./identifiers').CommitmentId,
      policy('security/forensic', 7, '2025-06-01'),
    );
    expect(result).toEqual({
      ok: false,
      error: { code: 'INVALID_POLICY', reason: 'MALFORMED_SHAPE' },
    });
  });

  it('S13 holdRef is optional and reference-only', () => {
    const r1 = createCommitment(
      'c1' as import('./identifiers').CommitmentId,
      evidence('security/forensic'),
      '2025-01-01' as import('./calendar').DateOnly,
      policy('security/forensic', 5, '2024-01-01'),
    );
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.value.holdRef).toBeUndefined();

    const r2 = createCommitment(
      'c2' as import('./identifiers').CommitmentId,
      evidence('security/forensic'),
      '2025-01-01' as import('./calendar').DateOnly,
      policy('security/forensic', 5, '2024-01-01'),
      'hold-42' as import('./holds').HoldRef,
    );
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.value.holdRef).toBe('hold-42');
  });

  it('S13 validateHoldRef rejects empty strings', () => {
    expect(validateHoldRef('')).toEqual({
      ok: false,
      error: { code: 'INVALID_EVIDENCE', reason: 'MALFORMED_SHAPE' },
    });
    expect(validateHoldRef(null)).toEqual({
      ok: false,
      error: { code: 'INVALID_EVIDENCE', reason: 'MALFORMED_SHAPE' },
    });
  });

  it('validateCommitmentId rejects empty strings', () => {
    expect(validateCommitmentId('')).toEqual({
      ok: false,
      error: { code: 'INVALID_EVIDENCE', reason: 'MALFORMED_SHAPE' },
    });
    expect(validateCommitmentId(42)).toEqual({
      ok: false,
      error: { code: 'INVALID_EVIDENCE', reason: 'MALFORMED_SHAPE' },
    });
  });
});
