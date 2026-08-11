import { normalizeSecurityEvidence } from './index';

describe('normalizeSecurityEvidence', () => {
  it.each([null, 'evidence', [], { entries: 'not-an-array' }])(
    'returns one container error and all empty streams for invalid root %p',
    (input) => {
      expect(normalizeSecurityEvidence(input)).toEqual({
        facts: [],
        errors: [{ code: 'E_CONTAINER', reason: 'R_NOT_OBJECT' }],
        notices: [],
        conflicts: [],
      });
    },
  );

  it('continues after malformed entries while preserving fact and error order', () => {
    const input = {
      entries: [
        { name: 'segmentClosed', status: 'verified', value: true },
        null,
        { name: 'hold', status: 'failed', value: 'active' },
      ],
    };

    expect(normalizeSecurityEvidence(input)).toEqual({
      facts: [
        { name: 'segmentClosed', status: 'verified', value: true },
        { name: 'hold', status: 'failed', value: 'active' },
      ],
      errors: [{ code: 'E_CONTAINER', reason: 'R_NOT_OBJECT', entryIndex: 1 }],
      notices: [],
      conflicts: [],
    });
  });

  it('uses one stable error precedence and rejects semantic mismatches', () => {
    const input = {
      entries: [
        {},
        { name: 'not-known', status: 'bogus', value: true },
        { name: 'category', status: 'bogus', value: 'invalid-category' },
        { name: 'hold', status: 'verified', value: 'invalid-hold' },
        { name: 'segmentClosed', status: 'verified', value: 'true' },
      ],
    };

    expect(normalizeSecurityEvidence(input).errors).toEqual([
      { code: 'E_REQUIRED_FIELD', reason: 'R_MISSING_FIELD', entryIndex: 0 },
      {
        code: 'E_NAME',
        reason: 'R_UNKNOWN_NAME',
        entryIndex: 1,
        name: 'not-known',
      },
      {
        code: 'E_STATUS',
        reason: 'R_INVALID_STATUS',
        entryIndex: 2,
        name: 'category',
      },
      {
        code: 'E_VALUE',
        reason: 'R_INVALID_SEMANTIC_VALUE',
        entryIndex: 3,
        name: 'hold',
      },
      {
        code: 'E_VALUE',
        reason: 'R_INVALID_SEMANTIC_VALUE',
        entryIndex: 4,
        name: 'segmentClosed',
      },
    ]);
  });

  it('accepts category, hold, and boolean facts without duplicate resolution', () => {
    const input = {
      entries: [
        { name: 'category', status: 'verified', value: 'fiscal/DGI' },
        { name: 'hold', status: 'failed', value: 'clear' },
        { name: 'archiveEncrypted', status: 'unavailable', value: false },
      ],
    };

    expect(normalizeSecurityEvidence(input)).toEqual({
      facts: input.entries,
      errors: [],
      notices: [],
      conflicts: [],
    });
  });

  it('does not mutate frozen input and returns deterministic four-stream results', () => {
    const entries = Object.freeze([
      Object.freeze({ name: 'segmentClosed', status: 'verified', value: true }),
      Object.freeze({ name: 'category', status: 'failed', value: 'unknown' }),
    ]);
    const input = Object.freeze({ entries });

    const first = normalizeSecurityEvidence(input);
    const second = normalizeSecurityEvidence(input);

    expect(first).toEqual({
      facts: [
        { name: 'segmentClosed', status: 'verified', value: true },
        { name: 'category', status: 'failed', value: 'unknown' },
      ],
      errors: [],
      notices: [],
      conflicts: [],
    });
    expect(second).toEqual(first);
    expect(input).toEqual({ entries });
  });

  it('contains hostile entry and root proxies', () => {
    const hostileEntry = new Proxy(
      {},
      {
        get: () => {
          throw new Error('hostile');
        },
      },
    );
    const hostileRoot = new Proxy(
      {},
      {
        get: () => {
          throw new Error('hostile');
        },
      },
    );
    let lengthReads = 0;
    const entries = new Proxy([], {
      get: () => (lengthReads++ === 0 ? Infinity : 0),
    });
    const input = Object.freeze({ entries });
    expect(
      normalizeSecurityEvidence({ entries: [hostileEntry] }).errors,
    ).toEqual([{ code: 'E_CONTAINER', reason: 'R_NOT_OBJECT', entryIndex: 0 }]);
    expect(normalizeSecurityEvidence(hostileRoot)).toEqual({
      facts: [],
      errors: [{ code: 'E_CONTAINER', reason: 'R_NOT_OBJECT' }],
      notices: [],
      conflicts: [],
    });
    expect(normalizeSecurityEvidence(input)).toEqual(
      normalizeSecurityEvidence(hostileRoot),
    );
    expect(input.entries).toBe(entries);
    expect(lengthReads).toBe(1);
  });

  it('retains the first valid fact and notices every identical duplicate', () => {
    expect(
      normalizeSecurityEvidence({
        entries: [
          { name: 'segmentClosed', status: 'verified', value: true },
          { name: 'segmentClosed', status: 'verified', value: true },
          { name: 'segmentClosed', status: 'verified', value: true },
        ],
      }),
    ).toEqual({
      facts: [{ name: 'segmentClosed', status: 'verified', value: true }],
      errors: [],
      notices: [
        { name: 'segmentClosed', reason: 'R_IDENTICAL_DUPLICATE' },
        { name: 'segmentClosed', reason: 'R_IDENTICAL_DUPLICATE' },
      ],
      conflicts: [],
    });
  });

  it('compares later value and status differences against the original winner', () => {
    expect(
      normalizeSecurityEvidence({
        entries: [
          { name: 'hold', status: 'verified', value: 'active' },
          { name: 'hold', status: 'verified', value: 'clear' },
          { name: 'hold', status: 'failed', value: 'active' },
        ],
      }),
    ).toEqual({
      facts: [{ name: 'hold', status: 'verified', value: 'active' }],
      errors: [],
      notices: [],
      conflicts: [
        { name: 'hold', reason: 'R_CONFLICTING_DUPLICATE' },
        { name: 'hold', reason: 'R_CONFLICTING_DUPLICATE' },
      ],
    });
  });

  it('keeps conflict and winner-identical notices with independent and invalid entries', () => {
    expect(
      normalizeSecurityEvidence({
        entries: [
          { name: 'segmentClosed', status: 'verified', value: true },
          { name: 'segmentClosed', status: 'failed', value: true },
          null,
          { name: 'archiveEncrypted', status: 'verified', value: false },
          { name: 'segmentClosed', status: 'verified', value: true },
          { name: 'archiveEncrypted', status: 'verified', value: false },
        ],
      }),
    ).toEqual({
      facts: [
        { name: 'segmentClosed', status: 'verified', value: true },
        { name: 'archiveEncrypted', status: 'verified', value: false },
      ],
      errors: [{ code: 'E_CONTAINER', reason: 'R_NOT_OBJECT', entryIndex: 2 }],
      notices: [
        { name: 'segmentClosed', reason: 'R_IDENTICAL_DUPLICATE' },
        { name: 'archiveEncrypted', reason: 'R_IDENTICAL_DUPLICATE' },
      ],
      conflicts: [{ name: 'segmentClosed', reason: 'R_CONFLICTING_DUPLICATE' }],
    });
  });

  it('creates fresh duplicate tracking for stable repeated invocations', () => {
    const input = {
      entries: [
        { name: 'category', status: 'verified', value: 'fiscal/DGI' },
        { name: 'category', status: 'verified', value: 'fiscal/DGI' },
        { name: 'category', status: 'failed', value: 'fiscal/DGI' },
      ],
    };

    const first = normalizeSecurityEvidence(input);

    expect(normalizeSecurityEvidence(input)).toEqual(first);
    expect(first).toEqual({
      facts: [{ name: 'category', status: 'verified', value: 'fiscal/DGI' }],
      errors: [],
      notices: [{ name: 'category', reason: 'R_IDENTICAL_DUPLICATE' }],
      conflicts: [{ name: 'category', reason: 'R_CONFLICTING_DUPLICATE' }],
    });
  });

  it('keeps duplicate diagnostics stable across invalid interleaving', () => {
    const input = {
      entries: [
        { name: 'hold', status: 'verified', value: 'clear' },
        { name: 'hold', status: 'verified', value: 'clear' },
        { name: 'hold', status: 'failed', value: 'clear' },
        { name: 'hold', status: 'verified', value: 'invalid-hold' },
      ],
    };

    const first = normalizeSecurityEvidence(input);
    const second = normalizeSecurityEvidence(input);

    expect(second).toEqual(first);
    expect(first).toEqual({
      facts: [{ name: 'hold', status: 'verified', value: 'clear' }],
      errors: [
        {
          code: 'E_VALUE',
          reason: 'R_INVALID_SEMANTIC_VALUE',
          name: 'hold',
          entryIndex: 3,
        },
      ],
      notices: [{ name: 'hold', reason: 'R_IDENTICAL_DUPLICATE' }],
      conflicts: [{ name: 'hold', reason: 'R_CONFLICTING_DUPLICATE' }],
    });
  });
});
