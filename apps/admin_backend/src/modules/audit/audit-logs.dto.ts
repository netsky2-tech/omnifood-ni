/**
 * S4a — POS forensic audit ledger read model (GET /operations/audit/ledger)
 * and nightly integrity alert surface (GET /operations/audit/integrity).
 */
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AuditSeverity } from './audit-risk-classifier';

/**
 * The ledger projects the hash-chained `audit_logs` store (written by the POS
 * through POST /identity/audit) into the owner dashboard. It follows exactly
 * the AuditEventsDto discipline: identity evidence (actor), the action code
 * for frontend localization, the entity reference, the device and the
 * timestamp — NEVER the metadata blob and NEVER the hash-chain columns
 * (`prev_hash`, `entry_hash`, `hash_version`).
 *
 * Severity comes from the SINGLE AuditRiskClassifier (spec §16.2 — there is
 * exactly one severity map), derived from the action exactly as the change_log
 * ingestion path persists it. The classifier's POS/backoffice ledger rows
 * (SALE_VOIDED, CREDIT_NOTE_CREATED, SUPERVISOR_OVERRIDE_*, DRAWER_OPENED_*
 * and friends) were added in S4a with per-code repository evidence in
 * audit-risk-classifier.spec.ts; unknown codes keep the documented INFO
 * fallback, and a spec guard pins the money/privilege/permission codes away
 * from INFO. No second severity scale exists anywhere in this module.
 */

/**
 * One forensic ledger entry from `audit_logs`. The actor is resolved to the
 * displayable identity of `user_id` (the user's email); `actorUserId` travels
 * as reference data only, exactly like `targetId` — never rendered raw by the
 * dashboard.
 */
export class AuditLedgerEntryDto {
  id!: string;

  /** When the POS recorded the entry (audit_logs.timestamp, ISO 8601 UTC). */
  occurredAt!: string;

  /** Human actor email resolved from audit_logs.user_id; null if unresolvable. */
  actorEmail!: string | null;

  /** Actor user id — reference data only, never rendered raw. */
  actorUserId!: string;

  /** POS audit action code (e.g. SALE_VOIDED, CREDIT_NOTE_CREATED). */
  action!: string;

  /** Severity derived from the action by the single AuditRiskClassifier. */
  severity!: AuditSeverity;

  /** Type of the audited entity, when the entry carries one. */
  targetType!: string | null;

  /** Identifier of the audited entity — reference data only, never rendered raw. */
  targetId!: string | null;

  /** POS device that produced the entry (per-device hash-chain stream). */
  deviceId!: string;

  /** Position in the device/actor hash-chain stream (audit_logs.sequence_no). */
  sequenceNo!: number;
}

export class AuditLedgerResponseDto {
  entries!: AuditLedgerEntryDto[];

  /**
   * Page size actually applied (default 50, max 100) — echoed so a client
   * can tell whether the page contract or its own request shaped the slice.
   */
  limit!: number;

  /**
   * True when more matching rows exist beyond this page (probed by fetching
   * limit + 1 rows). A false value means the page was NOT truncated; the
   * response never implies completeness beyond the cap either way.
   */
  truncated!: boolean;

  /** Report generation time — technical metadata only (FR-SYNC-04). */
  generatedAt!: string;
}

/**
 * One nightly integrity alert (audit_integrity_alerts): a detected sequence
 * gap in a device/actor hash-chain stream, written by the nightly cron
 * (AuditIntegrityService) and emitted as `gap_detected`. Deliberately
 * carries NO `signature` column: it is a hash-derived forensic dedupe key,
 * not human-readable evidence.
 */
export class AuditIntegrityAlertDto {
  id!: string;

  /** POS device whose chain shows the gap. */
  deviceId!: string;

  /** Actor whose chain shows the gap — reference data only, never rendered raw. */
  actorUserId!: string;

  /** First missing sequence number in the chain. */
  gapStart!: number;

  /** Last missing sequence number in the chain. */
  gapEnd!: number;

  /** First detection time (ISO 8601 UTC). */
  firstDetectedAt!: string;

  /** Most recent night the same gap was still detected (ISO 8601 UTC). */
  lastSeenAt!: string;
}

export class AuditIntegrityResponseDto {
  alerts!: AuditIntegrityAlertDto[];

  /** Report generation time — technical metadata only (FR-SYNC-04). */
  generatedAt!: string;
}

/**
 * Query params for the POS forensic audit ledger
 * (GET /operations/audit/ledger). Mirrors AuditEventsQueryDto: the page
 * size is capped server-side so the oversight surface never pulls an
 * unbounded result set, and date parsing stays with the shared
 * reporting-period module (spec §6.2 — no duplicated parsing here).
 * No severity param on purpose: see the classifier note above.
 */
export class AuditLedgerQueryDto {
  /** Inclusive local calendar date (YYYY-MM-DD), shared reporting semantics. */
  @IsOptional()
  @IsString()
  startDate?: string;

  /** Inclusive local calendar date (YYYY-MM-DD), shared reporting semantics. */
  @IsOptional()
  @IsString()
  endDate?: string;

  /** Actor filter: the POS user whose entries to include (audit_logs.user_id). */
  @IsOptional()
  @IsString()
  actorUserId?: string;

  /** Target entity type filter (e.g. 'invoice', 'credit_note'). */
  @IsOptional()
  @IsString()
  targetType?: string;

  /** Target entity identifier filter. */
  @IsOptional()
  @IsString()
  targetId?: string;

  /** Action code filter (e.g. SALE_VOIDED). */
  @IsOptional()
  @IsString()
  action?: string;

  /** Page cap: default 50, max 100. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
