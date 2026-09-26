import {
  deriveSyncFreshness,
  InvalidFreshnessThresholdError,
  type DeriveSyncFreshnessInput,
  type TerminalReceiptEvidence,
} from './freshness-derivation';

/**
 * PRD v1.0 §20 Gate C cases for the sync-freshness derivation:
 * complete, stale, partial, unknown, reconnect/catch-up (stale -> fresh).
 *
 * The derivation is a pure function over per-terminal receipt evidence.
 * Freshness age is measured from the newest confirmed receipt (watermark),
 * never from business activity time (AC-09A: a quiet store stays COMPLETE).
 */

const NOW = '2026-09-01T12:00:00.000Z';

const buildTerminal = (
  overrides: Partial<TerminalReceiptEvidence> = {},
): TerminalReceiptEvidence => ({
  terminalId: 'pos-01',
  label: 'POS 01',
  acceptedThroughSequence: 42,
  lastReceiptAt: '2026-09-01T11:58:00.000Z',
  gapEvidence: null,
  ...overrides,
});

const buildInput = (
  overrides: Partial<DeriveSyncFreshnessInput> = {},
): DeriveSyncFreshnessInput => ({
  terminals: [buildTerminal()],
  thresholdMinutes: 5,
  now: NOW,
  ...overrides,
});

describe('deriveSyncFreshness (PRD §20 Gate C)', () => {
  it('case 1 — returns COMPLETE when every terminal has a fresh confirmed receipt', () => {
    const result = deriveSyncFreshness(
      buildInput({
        terminals: [
          buildTerminal({ terminalId: 'pos-01' }),
          buildTerminal({ terminalId: 'pos-02', label: null }),
        ],
      }),
    );

    expect(result.state).toBe('COMPLETE');
    expect(result.perTerminal).toHaveLength(2);
    expect(result.perTerminal[0]).toMatchObject({
      terminalId: 'pos-01',
      state: 'COMPLETE',
      acceptedThroughSequence: 42,
      lastReceiptAt: '2026-09-01T11:58:00.000Z',
    });
    expect(result.lastCompleteAt).toBe('2026-09-01T11:58:00.000Z');
  });

  it('case 2 — returns STALE when the newest watermark is older than the threshold', () => {
    const result = deriveSyncFreshness(
      buildInput({
        terminals: [
          buildTerminal({ lastReceiptAt: '2026-09-01T11:50:00.000Z' }),
        ],
      }),
    );

    expect(result.state).toBe('STALE');
    expect(result.perTerminal[0].state).toBe('STALE');
    // STALE still knows through when data was complete (display: "completos hasta ...").
    expect(result.lastCompleteAt).toBe('2026-09-01T11:50:00.000Z');
  });

  it('case 3 — returns PARTIAL when a terminal proves a sequence gap (staged records above the watermark)', () => {
    const result = deriveSyncFreshness(
      buildInput({
        terminals: [
          buildTerminal({
            gapEvidence: {
              streams: [
                {
                  flowType: 'sales',
                  acceptedMax: 42,
                  acceptedCount: 42,
                  minAcceptedSequence: 1,
                  rejectedAboveWatermark: 0,
                  pendingAboveWatermark: 2,
                },
              ],
            },
          }),
        ],
      }),
    );

    expect(result.state).toBe('PARTIAL');
    expect(result.perTerminal[0].state).toBe('PARTIAL');
    // A misleading global complete-through must not be emitted for PARTIAL.
    expect(result.lastCompleteAt).toBeNull();
  });

  it('case 4 — returns UNKNOWN when no terminals resolve', () => {
    const result = deriveSyncFreshness(buildInput({ terminals: [] }));

    expect(result.state).toBe('UNKNOWN');
    expect(result.perTerminal).toHaveLength(0);
    expect(result.lastCompleteAt).toBeNull();
  });

  it('case 5 — reconnect/catch-up: a terminal that was STALE becomes COMPLETE when a fresh receipt arrives', () => {
    const staleInput = buildInput({
      terminals: [buildTerminal({ lastReceiptAt: '2026-09-01T10:00:00.000Z' })],
    });
    expect(deriveSyncFreshness(staleInput).state).toBe('STALE');

    // The device reconnects and its sync batch is accepted at 11:59:30.
    const reconnected = deriveSyncFreshness(
      buildInput({
        terminals: [
          buildTerminal({
            acceptedThroughSequence: 57,
            lastReceiptAt: '2026-09-01T11:59:30.000Z',
          }),
        ],
      }),
    );

    expect(reconnected.state).toBe('COMPLETE');
    expect(reconnected.perTerminal[0].state).toBe('COMPLETE');
    expect(reconnected.perTerminal[0].acceptedThroughSequence).toBe(57);
  });

  it('AC-09A quiet store — an old watermark sequence with a fresh receipt stays COMPLETE', () => {
    // No business activity for 30 minutes, but the last confirmed receipt
    // (proving "nothing pending") is 1 minute old. Age is measured from the
    // receipt watermark, never from the last transaction.
    const result = deriveSyncFreshness(
      buildInput({
        terminals: [
          buildTerminal({
            acceptedThroughSequence: 42,
            lastReceiptAt: '2026-09-01T11:59:00.000Z',
          }),
        ],
      }),
    );

    expect(result.state).toBe('COMPLETE');
  });

  it('rolls up mixed UNKNOWN + COMPLETE as PARTIAL (one terminal cannot prove completeness)', () => {
    const result = deriveSyncFreshness(
      buildInput({
        terminals: [
          buildTerminal(),
          buildTerminal({
            terminalId: 'pos-02',
            acceptedThroughSequence: null,
            lastReceiptAt: null,
          }),
        ],
      }),
    );

    expect(result.state).toBe('PARTIAL');
    expect(result.perTerminal[1].state).toBe('UNKNOWN');
    expect(result.lastCompleteAt).toBeNull();
  });

  it('rolls up all-UNKNOWN terminals as UNKNOWN', () => {
    const result = deriveSyncFreshness(
      buildInput({
        terminals: [
          buildTerminal({
            acceptedThroughSequence: null,
            lastReceiptAt: null,
          }),
        ],
      }),
    );

    expect(result.state).toBe('UNKNOWN');
  });

  it('treats non-accepted receipts above the watermark as gap evidence (PARTIAL)', () => {
    const result = deriveSyncFreshness(
      buildInput({
        terminals: [
          buildTerminal({
            gapEvidence: {
              streams: [
                {
                  flowType: 'sales',
                  acceptedMax: 42,
                  acceptedCount: 42,
                  minAcceptedSequence: 1,
                  rejectedAboveWatermark: 1,
                  pendingAboveWatermark: 0,
                },
              ],
            },
          }),
        ],
      }),
    );

    expect(result.state).toBe('PARTIAL');
  });

  it('treats non-contiguous accepted sequences (count smaller than span) as gap evidence (PARTIAL)', () => {
    const result = deriveSyncFreshness(
      buildInput({
        terminals: [
          buildTerminal({
            gapEvidence: {
              streams: [
                {
                  flowType: 'sales',
                  acceptedMax: 42,
                  acceptedCount: 40,
                  minAcceptedSequence: 1,
                  rejectedAboveWatermark: 0,
                  pendingAboveWatermark: 0,
                },
              ],
            },
          }),
        ],
      }),
    );

    expect(result.state).toBe('PARTIAL');
  });

  it('does not treat gap evidence scoped to the watermark itself as a gap (all counts zero -> COMPLETE)', () => {
    // The service only ever reports counts strictly above the per-stream
    // watermark; sequences at/below it are already accepted and can never be
    // a gap. The derivation therefore has no below-watermark concept: zeroed
    // evidence must not block COMPLETE.
    const result = deriveSyncFreshness(
      buildInput({
        terminals: [
          buildTerminal({
            gapEvidence: {
              streams: [
                {
                  flowType: 'sales',
                  acceptedMax: 42,
                  acceptedCount: 42,
                  minAcceptedSequence: 1,
                  rejectedAboveWatermark: 0,
                  pendingAboveWatermark: 0,
                },
              ],
            },
          }),
        ],
      }),
    );

    expect(result.state).toBe('COMPLETE');
  });

  it('treats an unparseable lastReceiptAt as UNKNOWN for that terminal (contradictory metadata)', () => {
    const result = deriveSyncFreshness(
      buildInput({
        terminals: [buildTerminal({ lastReceiptAt: 'not-a-timestamp' })],
      }),
    );

    expect(result.state).toBe('UNKNOWN');
    expect(result.perTerminal[0].state).toBe('UNKNOWN');
  });

  it('reports evaluatedAt and the thresholdMinutes it used', () => {
    const result = deriveSyncFreshness(buildInput({ thresholdMinutes: 7 }));

    expect(result.evaluatedAt).toBe(NOW);
    expect(result.thresholdMinutes).toBe(7);
  });

  it('throws InvalidFreshnessThresholdError for a non-positive threshold', () => {
    expect(() =>
      deriveSyncFreshness(buildInput({ thresholdMinutes: 0 })),
    ).toThrow(InvalidFreshnessThresholdError);
    expect(() =>
      deriveSyncFreshness(buildInput({ thresholdMinutes: -3 })),
    ).toThrow(InvalidFreshnessThresholdError);
    expect(() =>
      deriveSyncFreshness(buildInput({ thresholdMinutes: Number.NaN })),
    ).toThrow(InvalidFreshnessThresholdError);
  });
});
