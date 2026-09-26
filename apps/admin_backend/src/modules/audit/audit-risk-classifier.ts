/**
 * AG-07 / architecture spec v0.3 §16.2: the single deterministic
 * `AuditRiskClassifier` for the change-log audit stream.
 *
 * Severity semantics are the PRD v1.0 §19.1 taxonomy:
 *   CRITICAL — material fiscal, financial, security or integrity risk;
 *   WARNING  — operational follow-up;
 *   INFO     — awareness without urgent action.
 *
 * The classifier is pure and total: every action classifies, unknown actions
 * fall back to INFO (a conservative rule, documented in the spec table). New
 * events classify at ingestion (ChangeLogService.log writes the persisted
 * column); historical rows keep NULL and surface as INFO through
 * `resolveAuditSeverity` — history is never mutated (backfill-free rule).
 * There is deliberately exactly ONE severity map in the codebase (§16.2:
 * do not maintain two independent severity maps).
 */

export type AuditSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export const AUDIT_SEVERITIES: readonly AuditSeverity[] = [
  'CRITICAL',
  'WARNING',
  'INFO',
] as const;

/**
 * The persisted column spelling for a severity value. Kept explicit so the
 * entity annotation, the migration, and the summary aggregation all share
 * one definition of the stored domain.
 */
export const AUDIT_SEVERITY_COLUMN_LENGTH = 16;

/**
 * Event/action type -> severity, keyed by the exact `change_log.action`
 * values written by the current ingestion call sites (activation, catalog,
 * product services). Each entry's repository evidence is documented in
 * `audit-risk-classifier.spec.ts`.
 */
const ACTION_SEVERITY_TABLE: Readonly<Record<string, AuditSeverity>> = {
  // Security/integrity control failure during device activation.
  ONBOARDING_ACTIVATION_CHECK_FAILED: 'CRITICAL',
  // Privileged override of the activation flow (control bypass).
  ONBOARDING_ACTIVATION_SUPPORT_OVERRIDE: 'CRITICAL',
  // Credential-issuing lifecycle completion: security-relevant follow-up.
  ONBOARDING_ACTIVATION_FINALIZED: 'WARNING',
  // An open follow-up is explicit operational follow-up.
  ONBOARDING_ACTIVATION_FOLLOW_UP_OPENED: 'WARNING',
  // Follow-up resolution: awareness only.
  ONBOARDING_ACTIVATION_FOLLOW_UP_CLOSED: 'INFO',
  // Expected activation lifecycle start.
  ONBOARDING_ACTIVATION_ATTEMPT_STARTED: 'INFO',
  // Routine data changes.
  CREATE: 'INFO',
  UPDATE: 'INFO',
  // Availability removal: catalog analog of void activity requiring review.
  DEACTIVATE: 'WARNING',
};

/**
 * Classifies a change-log action into the PRD §19.1 severity taxonomy.
 * Deterministic and total: unknown actions (including future ones) fall
 * back to INFO so the summary can never fail closed on a new event type.
 */
export function classifyAuditSeverity(action: string): AuditSeverity {
  const normalized = String(action ?? '')
    .trim()
    .toUpperCase();
  return ACTION_SEVERITY_TABLE[normalized] ?? 'INFO';
}

/**
 * Resolves the display severity of a stored change_log row:
 * the persisted column when it carries a known taxonomy value, INFO
 * otherwise. Historical rows (NULL severity, written before the column
 * existed) surface as INFO — the documented backfill-free rule; history is
 * never rewritten.
 */
export function resolveAuditSeverity(
  storedSeverity: string | null | undefined,
): AuditSeverity {
  const normalized = String(storedSeverity ?? '')
    .trim()
    .toUpperCase();
  return (AUDIT_SEVERITIES as readonly string[]).includes(normalized)
    ? (normalized as AuditSeverity)
    : 'INFO';
}
