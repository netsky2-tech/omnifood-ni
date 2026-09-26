/**
 * Owner Dashboard V2 — sync freshness read model
 * (architecture spec v0.3 §17.12, PRD v1.0 §20).
 *
 * `evaluatedAt` is technical metadata only (FR-SYNC-04) — freshness meaning
 * lives in `state` and `lastCompleteAt`, which are derived from confirmed
 * receipt watermarks, never from report generation time.
 */

import type { SyncFreshnessTerminalState } from './freshness-derivation';

export type SyncFreshnessState = 'COMPLETE' | 'STALE' | 'PARTIAL' | 'UNKNOWN';

/**
 * Re-exported terminal-level state: 'PENDING' is display-only and never
 * appears in the top-level SyncFreshnessDto.state.
 */
export type { SyncFreshnessTerminalState };

export class SyncFreshnessTerminalDto {
  /** Canonical terminal/device identity from the sync stream or credential registry. */
  terminalId!: string;

  /** Human label when the device registry exposes one; null otherwise (AG-03). */
  label!: string | null;

  /**
   * Display-only terminal freshness state. 'PENDING' marks a provisioned
   * device that has never completed a first successful sync checkpoint: it
   * is shown per-terminal so the owner sees it exists, but it never
   * participates in the tenant rollup and never appears in the top-level
   * SyncFreshnessDto.state (founder freshness participation policy).
   */
  state!: SyncFreshnessTerminalState;

  /** Highest contiguous accepted source_sequence (weakest stream for the terminal). */
  acceptedThroughSequence!: number | null;

  /** Newest confirmed receipt watermark (ISO 8601), oldest across the terminal's streams. */
  lastReceiptAt!: string | null;
}

export class SyncFreshnessDto {
  state!: SyncFreshnessState;

  /** Platform freshness target in minutes (FR-SYNC-03, centralized config, default 5). */
  thresholdMinutes!: number;

  /**
   * Conservative complete-through (oldest terminal watermark) when the
   * tenant state is COMPLETE or STALE; null for PARTIAL/UNKNOWN so no
   * misleading global time is emitted (§17.12).
   */
  lastCompleteAt!: string | null;

  perTerminal!: SyncFreshnessTerminalDto[];

  /** Report generation time — technical metadata only, never freshness (FR-SYNC-04). */
  evaluatedAt!: string;
}
