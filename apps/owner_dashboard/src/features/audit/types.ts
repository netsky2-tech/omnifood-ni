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
