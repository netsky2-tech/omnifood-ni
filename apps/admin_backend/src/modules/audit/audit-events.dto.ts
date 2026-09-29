import { AuditSeverity } from './audit-risk-classifier';

/**
 * Owner Dashboard V2 — audit event list read model (slice 6b, finding H6).
 *
 * Executive-grade contract only, exactly like AuditExecutiveSummaryDto:
 * no `changes` payload, no before/after bodies, no forensic detail
 * (dashboard-api rule: "no raw forensic payload ever reaches the
 * dashboard"). The `action`/`targetType` machine codes travel on the wire
 * so the frontend view layer localizes them (labels.ts convention D3); the
 * UI never renders them raw.
 *
 * Actor identity is the human-readable evidence the change log actually
 * stores: the actor's email when a human performed the change, or the
 * logical actor ref (e.g. a system reconciler or terminal id) otherwise.
 * Exactly one of the two is populated, mirroring the
 * change_log_actor_exactly_one CHECK constraint (issue #412).
 */
export class AuditEventDto {
  id!: string;

  /** When the change was recorded (change_log.created_at, ISO 8601 UTC). */
  occurredAt!: string;

  /** Human actor email; null for logical actors. */
  actorEmail!: string | null;

  /** Logical actor ref (system job / terminal); null for human actors. */
  actorRef!: string | null;

  /** change_log action code; the frontend localizes it, never renders it raw. */
  action!: string;

  /** Severity resolved by the single AuditRiskClassifier (NULL history -> INFO). */
  severity!: AuditSeverity;

  /** Type of the audited entity (e.g. 'ActivationAttempt', 'product'). */
  targetType!: string;

  /** Identifier of the audited entity — reference data only, never rendered by the dashboard. */
  targetId!: string;
}

export class AuditEventsResponseDto {
  events!: AuditEventDto[];

  /** Report generation time — technical metadata only (FR-SYNC-04). */
  generatedAt!: string;
}
