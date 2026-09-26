import { AuditSeverity } from './audit-risk-classifier';

/**
 * Owner Dashboard V2 — audit/security executive summary read model
 * (architecture spec v0.3 §16, PRD v1.0 §26.3).
 *
 * Executive contract only: no raw forensic payload, no before/after bodies,
 * no sensitive event details (spec §16.1). Drill-down stays on the existing
 * Audit surface (identity/audit).
 */

/**
 * Most recent high-severity event in the selected window (spec §16 shape;
 * `id` added per the Dashboard V2 batch brief for deep-linking).
 */
export class AuditExecutiveSummaryLatestHighSeverityDto {
  id!: string;

  /** Event category: the change_log action that classified the event. */
  category!: string;

  severity!: 'CRITICAL' | 'WARNING';

  occurredAt!: string;
}

export class AuditExecutiveSummaryDto {
  criticalCount!: number;

  warningCount!: number;

  /** Awareness-level events; historical rows (NULL severity) surface here. */
  infoCount!: number;

  latestHighSeverity!: AuditExecutiveSummaryLatestHighSeverityDto | null;

  /** Report generation time — technical metadata only. */
  generatedAt!: string;
}

/** Re-exported so route consumers can name the severity domain. */
export type { AuditSeverity };
