/**
 * The owner's REVIEW QUEUE for the tenant's supervision policy
 * (GET /operations/audit/supervision-review).
 *
 * WHAT THIS IS: the record the policy promises. The tenant decides who may
 * authorize a sensitive operation and which flows accept the operator's own
 * signature; this surface is where the owner READS what actually happened —
 * who operated, who signed, with which credential, and whether a supervisor
 * was involved.
 *
 * THE DISCIPLINE IT INHERITS (the ledger's, from audit-logs.dto.ts):
 * - it NEVER exposes the metadata blob. The two facts the review needs that
 *   are not columns — the flow and the self-authorization — are DERIVED
 *   from the action code, which is what the terminal wrote at the moment of
 *   the operation;
 * - it NEVER exposes the hash-chain columns;
 * - the page cap is bounded and the response is honest about truncation.
 */
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AuditSeverity } from './audit-risk-classifier';
import { SupervisionFlow } from '../supervision/contracts/supervision-policy.contract';

/**
 * One signed sensitive operation.
 */
export class SupervisionReviewEntryDto {
  /** When the POS recorded the entry (audit_logs.timestamp, ISO 8601 UTC). */
  occurredAt!: string;

  /** Who performed the operation at the till. */
  actorEmail!: string | null;

  /** Who signed it: the supervisor, or the operator themselves. */
  authorizerEmail!: string | null;

  /**
   * Whether a SUPERVISOR signed it. False means the operator signed their
   * own operation — the case the tenant's policy made possible.
   */
  hadSupervisor!: boolean;

  /** The credential used to sign: PIN or TOTP; null when none was needed. */
  method!: string | null;

  /** The flow this operation belongs to (CLOSE_BOX, MANUAL_DISCOUNT, …). */
  flow!: SupervisionFlow;

  /** The raw forensic action code — the owner's ledger localizes it. */
  action!: string;

  /** Severity derived from the action by the single AuditRiskClassifier. */
  severity!: AuditSeverity;

  /** POS device that produced the entry. */
  deviceId!: string;
}

/**
 * The counts the owner reads first: how many of each flow happened, split
 * by who signed them.
 */
export class SupervisionReviewClassCountDto {
  flow!: SupervisionFlow;

  /** Signed by a supervisor. */
  supervised!: number;

  /** Signed by the operator alone. */
  selfAuthorized!: number;
}

export class SupervisionReviewResponseDto {
  /** The reviewed period, as resolved by the shared reporting-period parser. */
  startDate!: string | null;

  endDate!: string | null;

  /** Total rows in the period (not just the returned page). */
  total!: number;

  /** Total signed by the operator alone — the number the owner reviews. */
  selfAuthorizedTotal!: number;

  byClass!: SupervisionReviewClassCountDto[];

  entries!: SupervisionReviewEntryDto[];

  /** Page size actually applied (default 50, max 100). */
  limit!: number;

  /** True when more matching rows exist beyond this page. */
  truncated!: boolean;

  /** Report generation time — technical metadata only. */
  generatedAt!: string;
}

/**
 * Query params for the review queue. Same period semantics as the rest of
 * the reporting surfaces (inclusive local calendar dates).
 */
export class SupervisionReviewQueryDto {
  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  /** Page cap: default 50, max 100. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
