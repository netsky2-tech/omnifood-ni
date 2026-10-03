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

const buildPendingTerminal = (
  overrides: Partial<TerminalReceiptEvidence> = {},
): TerminalReceiptEvidence =>
  buildTerminal({
    terminalId: 'pos-new',
    label: null,
    acceptedThroughSequence: null,
    lastReceiptAt: null,
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

  it('case 3b — returns PARTIAL and hasDeclaredGaps=true when an explicit gap fill was declared', () => {
    // When a gap was declared unrecoverable, fill receipts were inserted
    // (result_code = 'GAP_FILL_DECLARED') advancing the watermark. Staged rows
    // have drained (pendingAboveWatermark=0), but declaredGapCount > 0 proves
    // permanent data loss: the terminal must resolve to PARTIAL, never COMPLETE.
    const result = deriveSyncFreshness(
      buildInput({
        terminals: [
          buildTerminal({
            acceptedThroughSequence: 10,
            lastReceiptAt: '2026-09-01T11:59:00.000Z',
            gapEvidence: {
              streams: [
                {
                  flowType: 'sales',
                  acceptedMax: 10,
                  acceptedCount: 10,
                  minAcceptedSequence: 1,
                  rejectedAboveWatermark: 0,
                  pendingAboveWatermark: 0,
                  declaredGapCount: 1,
                },
              ],
            },
          }),
        ],
      }),
    );

    expect(result.state).toBe('PARTIAL');
    expect(result.hasDeclaredGaps).toBe(true);
    expect(result.perTerminal[0].state).toBe('PARTIAL');
    expect(result.perTerminal[0].hasDeclaredGaps).toBe(true);
    // A gap declaration is an event with data loss: it must not emit lastCompleteAt.
    expect(result.lastCompleteAt).toBeNull();
  });

  it('case 3c — a terminal with declared gaps never reverts to COMPLETE even with fresh subsequent receipts', () => {
    // Later sync batches arrive and are accepted contiguous through seq 25,
    // receipts are 30s old, zero pending outbox. The terminal still stays PARTIAL.
    const result = deriveSyncFreshness(
      buildInput({
        terminals: [
          buildTerminal({
            acceptedThroughSequence: 25,
            lastReceiptAt: '2026-09-01T11:59:30.000Z',
            gapEvidence: {
              streams: [
                {
                  flowType: 'sales',
                  acceptedMax: 25,
                  acceptedCount: 25,
                  minAcceptedSequence: 1,
                  rejectedAboveWatermark: 0,
                  pendingAboveWatermark: 0,
                  declaredGapCount: 2,
                },
              ],
            },
          }),
        ],
      }),
    );

    expect(result.state).toBe('PARTIAL');
    expect(result.hasDeclaredGaps).toBe(true);
    expect(result.perTerminal[0].state).toBe('PARTIAL');
    expect(result.perTerminal[0].hasDeclaredGaps).toBe(true);
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

  it('founder policy (a) — a never-synced device is PENDING display-only and does not hold the tenant back', () => {
    // One healthy stream + one provisioned device that has NEVER completed a
    // first successful sync checkpoint: the rollup ignores the PENDING device.
    const result = deriveSyncFreshness(
      buildInput({
        terminals: [buildTerminal(), buildPendingTerminal()],
      }),
    );

    expect(result.state).toBe('COMPLETE');
    expect(result.perTerminal.find((t) => t.terminalId === 'pos-new')).toEqual(
      expect.objectContaining({
        state: 'PENDING',
        acceptedThroughSequence: null,
        lastReceiptAt: null,
      }),
    );
    // Complete-through is derived from participating terminals only.
    expect(result.lastCompleteAt).toBe('2026-09-01T11:58:00.000Z');
  });

  it('founder policy (a2) — a never-synced device with staged-gap evidence is still PENDING, not PARTIAL', () => {
    // No historical ACCEPTED receipt means no freshness participation at all,
    // even when STAGED_FUTURE outbox rows exist: the strict posture (gap ->
    // PARTIAL) only applies once the first checkpoint has been reached.
    const result = deriveSyncFreshness(
      buildInput({
        terminals: [
          buildTerminal(),
          buildPendingTerminal({
            gapEvidence: {
              streams: [
                {
                  flowType: 'sales',
                  acceptedMax: null,
                  acceptedCount: null,
                  minAcceptedSequence: null,
                  rejectedAboveWatermark: 0,
                  pendingAboveWatermark: 3,
                },
              ],
            },
          }),
        ],
      }),
    );

    expect(result.state).toBe('COMPLETE');
    expect(result.perTerminal[1].state).toBe('PENDING');
  });

  it('founder policy (b) — after the first accepted receipt the strict posture applies forever (silence -> STALE)', () => {
    // The same device, now having reached its first checkpoint, then going
    // silent beyond the threshold: STALE per the existing rollup rules — no
    // 24h grace, no PENDING shielding.
    const result = deriveSyncFreshness(
      buildInput({
        terminals: [
          buildTerminal({ terminalId: 'pos-01' }),
          buildPendingTerminal({
            terminalId: 'pos-02',
            acceptedThroughSequence: 3,
            lastReceiptAt: '2026-09-01T10:00:00.000Z',
          }),
        ],
      }),
    );

    expect(result.perTerminal.find((t) => t.terminalId === 'pos-02')).toEqual(
      expect.objectContaining({ state: 'STALE' }),
    );
    expect(result.state).toBe('STALE');
  });

  it('founder policy (c) — an all-PENDING tenant rolls up to UNKNOWN (nothing has ever proven completeness)', () => {
    const result = deriveSyncFreshness(
      buildInput({
        terminals: [
          buildPendingTerminal({ terminalId: 'pos-01' }),
          buildPendingTerminal({ terminalId: 'pos-02' }),
        ],
      }),
    );

    expect(result.state).toBe('UNKNOWN');
    expect(result.perTerminal.map((t) => t.state)).toEqual([
      'PENDING',
      'PENDING',
    ]);
    expect(result.lastCompleteAt).toBeNull();
  });

  it('rolls up mixed UNKNOWN + COMPLETE as PARTIAL (one terminal cannot prove completeness)', () => {
    const result = deriveSyncFreshness(
      buildInput({
        terminals: [
          buildTerminal(),
          // A post-checkpoint terminal whose completeness cannot be proven
          // (contradictory watermark metadata) is a genuine UNKNOWN.
          buildTerminal({
            terminalId: 'pos-02',
            lastReceiptAt: 'not-a-timestamp',
          }),
        ],
      }),
    );

    expect(result.state).toBe('PARTIAL');
    expect(result.perTerminal[1].state).toBe('UNKNOWN');
    expect(result.lastCompleteAt).toBeNull();
  });

  it('rolls up all-UNKNOWN terminals as UNKNOWN (post-checkpoint but unprovable)', () => {
    const result = deriveSyncFreshness(
      buildInput({
        terminals: [buildTerminal({ lastReceiptAt: 'not-a-timestamp' })],
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
