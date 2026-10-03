/**
 * Owner Dashboard V2 — synchronization freshness/completeness derivation.
 *
 * Pure function per architecture spec v0.3 §17.3/§17.12 and PRD v1.0 §20
 * (FR-SYNC-01..03). No I/O, no clock access, no TypeORM — the caller supplies
 * per-terminal receipt evidence gathered inside a tenant-bound transaction
 * (issue #592 rule) and the freshness threshold from centralized config.
 *
 * State semantics (PRD §20):
 * - COMPLETE: every terminal's newest confirmed receipt watermark is within
 *   the threshold. Age is measured from the receipt/watermark time, NEVER
 *   from the last sale — a quiet store stays COMPLETE (AC-09A).
 * - STALE: completeness was established but the newest watermark is older
 *   than the threshold.
 * - PARTIAL: at least one participating terminal proves an unresolved
 *   sequence gap (pending staged / rejected receipts above its watermark),
 *   or at least one terminal cannot prove completeness while others can.
 * - UNKNOWN: completeness cannot be established (no participating terminals,
 *   or a terminal that cannot prove completeness despite having synced, or
 *   contradictory/unparseable metadata).
 * - PENDING (per-terminal only, display-only): a provisioned device that has
 *   never completed a first successful sync checkpoint (no historical
 *   ACCEPTED receipt). Per the founder freshness participation policy it is
 *   NOT a freshness participant: it never holds the tenant at PARTIAL or
 *   STALE and never appears in the tenant-level rollup state. Once a device
 *   has reached its first checkpoint, the strict posture applies forever —
 *   no grace period.
 */

export type SyncFreshnessState = 'COMPLETE' | 'STALE' | 'PARTIAL' | 'UNKNOWN';

/**
 * Terminal-level freshness state. 'PENDING' is a display-only marker for
 * devices that have never completed a first successful sync checkpoint; it
 * is excluded from the tenant-level rollup and never appears in
 * SyncFreshnessDto.state.
 */
export type SyncFreshnessTerminalState = SyncFreshnessState | 'PENDING';

/**
 * Per-(terminal, flow) gap evidence, aggregated by the service from persisted
 * sync data. Every count is already scoped to sequences strictly ABOVE that
 * stream's accepted watermark — the derivation must not re-interpret them.
 */
export interface TerminalStreamGapEvidence {
  flowType: string;
  /** Highest contiguous accepted source_sequence for the stream (null = never accepted). */
  acceptedMax: number | null;
  /** Number of ACCEPTED receipts for the stream (null = unknown). */
  acceptedCount: number | null;
  /** Lowest accepted source_sequence for the stream (null = never accepted). */
  minAcceptedSequence: number | null;
  /** Receipt rows with a non-ACCEPTED result_status above the accepted watermark. */
  rejectedAboveWatermark: number;
  /** STAGED_FUTURE outbox rows above the accepted watermark (records blocked on a sequence gap). */
  pendingAboveWatermark: number;
  /** Number of declared gap fill receipts (result_code = 'GAP_FILL_DECLARED') indicating permanent data loss. */
  declaredGapCount?: number;
}

export interface SyncGapEvidence {
  streams: TerminalStreamGapEvidence[];
}

/** Per-terminal receipt evidence handed to the derivation. */
export interface TerminalReceiptEvidence {
  terminalId: string;
  /** Human label when the device registry exposes one; null when unavailable. */
  label: string | null;
  /** Conservative (weakest) accepted watermark across the terminal's streams. */
  acceptedThroughSequence: number | null;
  /** Oldest per-stream newest confirmed receipt timestamp (ISO string), null when none. */
  lastReceiptAt: string | null;
  gapEvidence: SyncGapEvidence | null;
}

export interface DeriveSyncFreshnessInput {
  terminals: TerminalReceiptEvidence[];
  thresholdMinutes: number;
  /** ISO instant the evaluation runs at; injected so the function stays pure. */
  now: string;
}

export interface TerminalFreshness {
  terminalId: string;
  label: string | null;
  state: SyncFreshnessTerminalState;
  acceptedThroughSequence: number | null;
  lastReceiptAt: string | null;
  hasDeclaredGaps: boolean;
}

export interface SyncFreshnessDerivation {
  state: SyncFreshnessState;
  /** ISO instant data is confirmed complete through (conservative oldest watermark), null when not provable. */
  lastCompleteAt: string | null;
  perTerminal: TerminalFreshness[];
  evaluatedAt: string;
  thresholdMinutes: number;
  hasDeclaredGaps: boolean;
}

/** Raised when the freshness threshold is not a positive finite number. */
export class InvalidFreshnessThresholdError extends Error {
  constructor(thresholdMinutes: number) {
    super(
      `INVALID_FRESHNESS_THRESHOLD: thresholdMinutes must be a positive finite number, got ${thresholdMinutes}`,
    );
    this.name = 'InvalidFreshnessThresholdError';
  }
}

const isPositiveThreshold = (thresholdMinutes: number): boolean =>
  Number.isFinite(thresholdMinutes) && thresholdMinutes > 0;

/**
 * Gap rule — strongest provable from persisted data.
 *
 * The backend enforces strict ordered acceptance per (tenant, device, flow):
 * `resolveExpectedSequence` = last ACCEPTED receipt + 1, and any record
 * arriving ahead of the cursor is staged (not accepted). Consequently the
 * accepted receipt sequences are contiguous *by construction*: a hole inside
 * 1..acceptedMax is unprovable from receipts alone (it could only appear via
 * external data mutation). What persistence DOES prove is unresolved work
 * above the watermark:
 *
 * - STAGED_FUTURE outbox rows above the accepted watermark = real records
 *   blocked on a sequence gap (completeness NOT proven);
 * - non-ACCEPTED receipt rows above the accepted watermark;
 * - defensively, an accepted count smaller than the accepted span
 *   (acceptedMax - minAcceptedSequence + 1).
 */
const streamHasGap = (stream: TerminalStreamGapEvidence): boolean => {
  if ((stream.declaredGapCount ?? 0) > 0) return true;
  if (stream.pendingAboveWatermark > 0) return true;
  if (stream.rejectedAboveWatermark > 0) return true;
  if (
    stream.acceptedMax !== null &&
    stream.acceptedCount !== null &&
    stream.minAcceptedSequence !== null
  ) {
    const span = stream.acceptedMax - stream.minAcceptedSequence + 1;
    if (stream.acceptedCount < span) return true;
  }
  return false;
};

const terminalHasGap = (evidence: TerminalReceiptEvidence): boolean =>
  (evidence.gapEvidence?.streams ?? []).some(streamHasGap);

const terminalHasDeclaredGaps = (evidence: TerminalReceiptEvidence): boolean =>
  (evidence.gapEvidence?.streams ?? []).some(
    (stream) => (stream.declaredGapCount ?? 0) > 0,
  );

/**
 * Founder freshness participation policy: a device participates only once it
 * has completed a first successful sync checkpoint (at least one historical
 * ACCEPTED receipt). The watermark AND the per-stream acceptedMax are both
 * checked defensively so contradictory evidence cannot slip through.
 */
const terminalHasAcceptedReceipt = (
  evidence: TerminalReceiptEvidence,
): boolean =>
  evidence.acceptedThroughSequence !== null ||
  (evidence.gapEvidence?.streams ?? []).some(
    (stream) => stream.acceptedMax !== null,
  );

const parseTimestamp = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const deriveTerminalState = (
  evidence: TerminalReceiptEvidence,
  thresholdMs: number,
  nowMs: number,
): SyncFreshnessTerminalState => {
  // Founder participation policy: no historical ACCEPTED receipt at all ->
  // display-only PENDING, never a freshness participant. This check precedes
  // the gap rule: a never-checkpointed device must not hold the tenant at
  // PARTIAL even when STAGED_FUTURE rows exist for it.
  if (!terminalHasAcceptedReceipt(evidence)) return 'PENDING';
  if (terminalHasGap(evidence)) return 'PARTIAL';
  if (evidence.acceptedThroughSequence === null) return 'UNKNOWN';
  const lastReceiptMs = parseTimestamp(evidence.lastReceiptAt);
  if (lastReceiptMs === null) return 'UNKNOWN';
  return nowMs - lastReceiptMs > thresholdMs ? 'STALE' : 'COMPLETE';
};

const rollupStates = (states: SyncFreshnessState[]): SyncFreshnessState => {
  // Empty (no participating terminals after PENDING filtering, or no
  // terminals at all) cannot be distinguished from "cannot establish" ->
  // UNKNOWN: nothing has ever proven completeness.
  if (states.length === 0) return 'UNKNOWN';
  // All-unknown cannot be distinguished from "cannot establish" -> UNKNOWN.
  if (states.every((state) => state === 'UNKNOWN')) return 'UNKNOWN';
  // Any terminal that cannot prove completeness while others can -> PARTIAL
  // (FR-SYNC-03); PARTIAL otherwise outranks STALE/COMPLETE.
  const hasUnknown = states.includes('UNKNOWN');
  const hasPartial = states.includes('PARTIAL');
  if (hasUnknown || hasPartial) return 'PARTIAL';
  if (states.includes('STALE')) return 'STALE';
  return 'COMPLETE';
};

/**
 * Conservative complete-through: the oldest participating terminal watermark.
 * Only meaningful (and only emitted) when the tenant state is COMPLETE or
 * STALE — for PARTIAL a single global complete-through would be misleading
 * (§17.12). Display-only PENDING terminals are excluded by the caller.
 */
const deriveLastCompleteAt = (
  terminals: TerminalReceiptEvidence[],
): string | null => {
  const timestamps = terminals
    .map((terminal) => parseTimestamp(terminal.lastReceiptAt))
    .filter((value): value is number => value !== null);
  if (terminals.length === 0 || timestamps.length !== terminals.length) {
    return null;
  }
  const oldest = new Date(Math.min(...timestamps));
  return oldest.toISOString();
};

export function deriveSyncFreshness(
  input: DeriveSyncFreshnessInput,
): SyncFreshnessDerivation {
  const { terminals, thresholdMinutes, now } = input;
  if (!isPositiveThreshold(thresholdMinutes)) {
    throw new InvalidFreshnessThresholdError(thresholdMinutes);
  }
  const nowMs = Date.parse(now);
  const thresholdMs = thresholdMinutes * 60_000;

  const perTerminal: TerminalFreshness[] = terminals.map((terminal) => ({
    terminalId: terminal.terminalId,
    label: terminal.label,
    state: deriveTerminalState(terminal, thresholdMs, nowMs),
    acceptedThroughSequence: terminal.acceptedThroughSequence,
    lastReceiptAt: terminal.lastReceiptAt,
    hasDeclaredGaps: terminalHasDeclaredGaps(terminal),
  }));

  // PENDING terminals are display-only: they are filtered out before the
  // tenant-level rollup (founder freshness participation policy).
  const participatingStates = perTerminal
    .map((terminal) => terminal.state)
    .filter((state): state is SyncFreshnessState => state !== 'PENDING');

  const state =
    perTerminal.length === 0 ? 'UNKNOWN' : rollupStates(participatingStates);

  // Complete-through is conservative across PARTICIPATING terminals only:
  // a display-only PENDING device (no watermark) must not null it out.
  const participatingTerminals = terminals.filter(
    (_, index) => perTerminal[index].state !== 'PENDING',
  );
  const lastCompleteAt =
    state === 'COMPLETE' || state === 'STALE'
      ? deriveLastCompleteAt(participatingTerminals)
      : null;

  const hasDeclaredGaps = perTerminal.some((terminal) => terminal.hasDeclaredGaps);

  return {
    state,
    lastCompleteAt,
    perTerminal,
    evaluatedAt: now,
    thresholdMinutes,
    hasDeclaredGaps,
  };
}
