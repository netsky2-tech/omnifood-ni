import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { runInTenantTransaction } from '../../core/database/tenant-transaction';
import {
  resolveReportingBounds,
  ReportingPeriodValidationError,
} from '../../core/reporting/reporting-period';
import {
  resolveAuditSeverity,
  AuditSeverity,
} from './audit-risk-classifier';
import {
  AuditExecutiveSummaryDto,
  AuditExecutiveSummaryLatestHighSeverityDto,
} from './audit-executive-summary.dto';

/**
 * Owner Dashboard V2 — audit/security executive summary service
 * (architecture spec v0.3 §16, PRD v1.0 §26.3).
 *
 * Issue #592 permanent rule: change_log is a tenant-RLS-forced table
 * (direct:SIUD), so every read here runs inside runInTenantTransaction with
 * a transaction-local tenant binding. There are NO pooled repository reads.
 *
 * The service only gathers tenant-bound evidence; the NULL-severity
 * historical rule and the severity domain live in the single
 * AuditRiskClassifier module (spec §16.2: one severity map, never two).
 *
 * Period: the summary follows the selected Dashboard reporting period
 * (spec §16.3); date inputs are interpreted by the shared
 * resolveReportingBounds parser (spec §6.2 — no duplicated date parsing).
 */
@Injectable()
export class AuditSummaryService {
  constructor(
    // Bound-read tripwire (#592 pattern): no pooled repository token exists
    // for change_log here; the DataSource is used exclusively to open
    // tenant-bound transactions.
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async getExecutiveSummary(
    tenantId: string,
    startDate?: string,
    endDate?: string,
    generatedAt: Date = new Date(),
  ): Promise<AuditExecutiveSummaryDto> {
    // Shared reporting-period parsing (spec §6.2); validation errors are
    // translated once here so the controller stays thin.
    let startInclusiveUtc: Date | null = null;
    let endExclusiveUtc: Date | null = null;
    try {
      const bounds = resolveReportingBounds(startDate, endDate);
      startInclusiveUtc = bounds.startInclusiveUtc ?? null;
      endExclusiveUtc = bounds.endExclusiveUtc ?? null;
    } catch (error) {
      if (error instanceof ReportingPeriodValidationError) {
        throw error;
      }
      throw error;
    }

    const rows = await runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        const severityCounts = await manager.query<SeverityCountRow[]>(
          AuditSummaryService.SEVERITY_COUNTS_SQL,
          [tenantId, startInclusiveUtc, endExclusiveUtc],
        );
        const latestHigh = await manager.query<LatestHighRow[]>(
          AuditSummaryService.LATEST_HIGH_SEVERITY_SQL,
          [tenantId, startInclusiveUtc, endExclusiveUtc],
        );
        return { severityCounts, latestHigh };
      },
    );

    // Historical rows (NULL severity) count as INFO — the documented
    // backfill-free rule; an unknown stored value never escalates.
    const countBySeverity = new Map<AuditSeverity, number>([
      ['CRITICAL', 0],
      ['WARNING', 0],
      ['INFO', 0],
    ]);
    for (const row of rows.severityCounts) {
      const severity = resolveAuditSeverity(row.severity, '');
      countBySeverity.set(
        severity,
        (countBySeverity.get(severity) ?? 0) + Number(row.count),
      );
    }

    const latest = rows.latestHigh[0]
      ? {
          id: rows.latestHigh[0].id,
          category: rows.latestHigh[0].category,
          severity: rows.latestHigh[0].severity as 'CRITICAL' | 'WARNING',
          occurredAt: new Date(rows.latestHigh[0].occurredAt).toISOString(),
        }
      : null;

    return {
      criticalCount: countBySeverity.get('CRITICAL') ?? 0,
      warningCount: countBySeverity.get('WARNING') ?? 0,
      infoCount: countBySeverity.get('INFO') ?? 0,
      latestHighSeverity: latest,
      generatedAt: generatedAt.toISOString(),
    };
  }

  /**
   * Severity counts over the selected window. COALESCE maps historical
   * NULL-severity rows into INFO at read time without mutating history.
   * The tenant predicate mirrors the RLS binding (defense in depth); the
   * half-open window [start, end) matches the shared reporting semantics.
   */
  private static readonly SEVERITY_COUNTS_SQL = `
    SELECT
      COALESCE(c.severity, 'INFO') AS severity,
      COUNT(*)::int AS count
    FROM change_log c
    WHERE c.tenant_id = $1
      AND ($2::timestamptz IS NULL OR c.created_at >= $2::timestamptz)
      AND ($3::timestamptz IS NULL OR c.created_at < $3::timestamptz)
    GROUP BY COALESCE(c.severity, 'INFO')
  `;

  /**
   * Most recent high-severity event (CRITICAL first by recency, WARNING
   * next): deterministic order created_at DESC, id DESC, LIMIT 1.
   * Executive payload only: id, action (category), severity, occurredAt —
   * no changes payload, no user email, no forensic detail (spec §16.1).
   */
  private static readonly LATEST_HIGH_SEVERITY_SQL = `
    SELECT
      c.id,
      c.action AS category,
      c.severity,
      c.created_at AS "occurredAt"
    FROM change_log c
    WHERE c.tenant_id = $1
      AND c.severity IN ('CRITICAL', 'WARNING')
      AND ($2::timestamptz IS NULL OR c.created_at >= $2::timestamptz)
      AND ($3::timestamptz IS NULL OR c.created_at < $3::timestamptz)
    ORDER BY c.created_at DESC, c.id DESC
    LIMIT 1
  `;
}

interface SeverityCountRow {
  severity: string | null;
  count: string | number;
}

interface LatestHighRow {
  id: string;
  category: string;
  severity: string;
  occurredAt: Date | string;
}
