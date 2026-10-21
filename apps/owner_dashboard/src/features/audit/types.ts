/** Severity domain of the single backend AuditRiskClassifier (spec §16.2). */
export type AuditSeverity = "CRITICAL" | "WARNING" | "INFO";

/**
 * Audit event list read model (slice 6b, finding H6).
 *
 * Contract mirrors the backend AuditEventsResponseDto: executive-grade only
 * — no `changes` payload, no forensic detail ever reaches the dashboard
 * (dashboard-api rule). Machine codes (`action`, `targetType`) stay on the
 * wire and are localized only at the view layer (labels.ts convention D3).
 * `targetId` is reference data for future drill-down context; the UI never
 * renders it.
 */
export interface AuditEvent {
  id: string;
  /** When the change was recorded (ISO 8601 UTC). */
  occurredAt: string;
  /** Human actor email; null for logical actors. */
  actorEmail: string | null;
  /** Logical actor ref (system job / terminal); null for human actors. */
  actorRef: string | null;
  action: string;
  severity: AuditSeverity;
  targetType: string;
  targetId: string;
}

export interface AuditEventsResponse {
  events: AuditEvent[];
  /** Report generation time — technical metadata only (FR-SYNC-04). */
  generatedAt: string;
}

/** Severity filter values accepted by GET /operations/audit/events. */
export type AuditSeverityFilter = AuditSeverity;

/**
 * The owner's REVIEW QUEUE for the tenant's supervision policy
 * (GET /operations/audit/supervision-review).
 *
 * It answers the question the policy exists for: what happened, who signed
 * it, with which credential, and whether a supervisor was involved. The
 * flow and the self-authorization are DERIVED server-side from the action
 * code, so the dashboard never has to guess them.
 */
export type SupervisionFlow =
  | "CLOSE_BOX"
  | "MANUAL_DISCOUNT"
  | "CASH_DRAWER"
  | "MODIFIER_QUANTITY";

export interface SupervisionReviewEntry {
  occurredAt: string;
  /** Who performed the operation at the till. */
  actorEmail: string | null;
  /** Who signed it: the supervisor, or the operator themselves. */
  authorizerEmail: string | null;
  /** False means the operator signed their own operation. */
  hadSupervisor: boolean;
  /** The credential used to sign: PIN or TOTP; null when none was needed. */
  method: string | null;
  flow: SupervisionFlow;
  action: string;
  severity: AuditSeverity;
  deviceId: string;
}

export interface SupervisionReviewClassCount {
  flow: SupervisionFlow;
  supervised: number;
  selfAuthorized: number;
}

export interface SupervisionReviewResponse {
  startDate: string | null;
  endDate: string | null;
  /** Total signed operations in the period (not just the returned page). */
  total: number;
  /** How many of them the operator signed alone — the number to review. */
  selfAuthorizedTotal: number;
  byClass: SupervisionReviewClassCount[];
  entries: SupervisionReviewEntry[];
  limit: number;
  truncated: boolean;
  generatedAt: string;
}
