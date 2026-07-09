import {
  MERMA_REASONS,
  normalizeMermaReason,
  requireMermaObservation,
} from './merma-taxonomy';

describe('merma taxonomy', () => {
  it('maps legacy labels to canonical PRD reasons', () => {
    expect(normalizeMermaReason('VENCIMIENTO')).toBe(MERMA_REASONS.VENCIDO);
    expect(normalizeMermaReason('MALA_PREPARACION')).toBe(
      MERMA_REASONS.DESECHO_COCINA,
    );
    expect(normalizeMermaReason('ROTO')).toBe(MERMA_REASONS.DETERIORO_BODEGA);
    expect(normalizeMermaReason('CORTESIA')).toBe(
      MERMA_REASONS.CORTESIA_DEGUSTACION,
    );
  });

  it('keeps canonical reasons unchanged and rejects unknown reasons', () => {
    expect(normalizeMermaReason('DESECHO_COCINA')).toBe(
      MERMA_REASONS.DESECHO_COCINA,
    );
    expect(normalizeMermaReason('UNKNOWN_TYPE')).toBeNull();
  });

  it('requires a non-empty observation', () => {
    expect(requireMermaObservation('  Broken during prep  ')).toBe(
      'Broken during prep',
    );
    expect(() => requireMermaObservation('   ')).toThrow(
      'Merma observation is required',
    );
  });
});
