import { extractEvidenceInput } from './evidence';

describe('evidence input extraction (Child 2)', () => {
  it('S6 accepts valid categories with origin date and source', () => {
    const r1 = extractEvidenceInput({
      category: 'security/forensic',
      originDate: '2025-01-15',
      source: 'audit-chain',
    });
    expect(r1).toEqual({
      ok: true,
      value: {
        category: 'security/forensic',
        originDate: '2025-01-15',
        source: 'audit-chain',
      },
    });
    const r2 = extractEvidenceInput({
      category: 'fiscal/DGI',
      originDate: '2024-06-01',
      source: 'inv',
    });
    const r3 = extractEvidenceInput({
      category: 'unknown',
      originDate: '2024-12-31',
      source: 'legacy',
    });
    expect(r2.ok).toBe(true);
    expect(r3.ok).toBe(true);
  });

  it('S7 rejects non-record, unknown category, empty source, invalid date', () => {
    expect(extractEvidenceInput(null)).toEqual({
      ok: false,
      error: { code: 'INVALID_EVIDENCE', reason: 'MALFORMED_SHAPE' },
    });
    expect(extractEvidenceInput('str')).toEqual({
      ok: false,
      error: { code: 'INVALID_EVIDENCE', reason: 'MALFORMED_SHAPE' },
    });
    expect(
      extractEvidenceInput({
        category: 'tax/fiscal',
        originDate: '2025-01-01',
        source: 'x',
      }),
    ).toEqual({
      ok: false,
      error: { code: 'INVALID_EVIDENCE', reason: 'UNKNOWN_CATEGORY' },
    });
    expect(
      extractEvidenceInput({
        category: 'security/forensic',
        originDate: '2025-01-01',
      }),
    ).toEqual({
      ok: false,
      error: { code: 'INVALID_EVIDENCE', reason: 'MALFORMED_SHAPE' },
    });
    expect(
      extractEvidenceInput({
        category: 'security/forensic',
        originDate: '2025-01-01',
        source: '',
      }),
    ).toEqual({
      ok: false,
      error: { code: 'INVALID_EVIDENCE', reason: 'MALFORMED_SHAPE' },
    });
    expect(
      extractEvidenceInput({
        category: 'security/forensic',
        originDate: 'bad',
        source: 'x',
      }),
    ).toEqual({
      ok: false,
      error: { code: 'INVALID_EVIDENCE', reason: 'MALFORMED_SHAPE' },
    });
  });
});
