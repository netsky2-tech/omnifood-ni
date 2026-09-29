import { Injectable } from '@nestjs/common';
import {
  resolveReportingBounds,
} from '../../core/reporting/reporting-period';
import { resolveAuditSeverity, AuditSeverity } from './audit-risk-classifier';
import { AuditEventDto, AuditEventsResponseDto } from './audit-events.dto';
import { ChangeLogService } from './change-log.service';

/**
 * Owner Dashboard V2 — audit event list read service (slice 6b, finding H6).
 *
 * Same contract family as the executive summary (AuditSummaryService): the
 * shared reporting-period parser interprets the date inputs (spec §6.2 — no
 * duplicated parsing), the single AuditRiskClassifier resolves the severity
 * of every row (NULL history -> INFO), and the response carries NO forensic
 * payload — identity evidence (actor email/ref), the action code for
 * frontend localization, and the entity reference only.
 *
 * All change_log access rides the ChangeLogService bound path (issue #512);
 * this service holds no repository of its own.
 */
@Injectable()
export class AuditEventsService {
  /** Page size contract for GET /operations/audit/events (mirrors cash shifts). */
  static readonly DEFAULT_EVENTS_LIMIT = 50;
  static readonly MAX_EVENTS_LIMIT = 100;

  constructor(private readonly changeLogService: ChangeLogService) {}

  async getEvents(
    tenantId: string,
    startDate?: string,
    endDate?: string,
    severity?: AuditSeverity,
    limitInput?: number,
    generatedAt: Date = new Date(),
  ): Promise<AuditEventsResponseDto> {
    // Shared reporting-period parsing (spec §6.2); validation errors
    // propagate so callers get the module's documented failure shape.
    const bounds = resolveReportingBounds(startDate, endDate);
    const startInclusiveUtc = bounds.startInclusiveUtc ?? null;
    const endExclusiveUtc = bounds.endExclusiveUtc ?? null;

    const limit =
      limitInput === undefined || limitInput === null
        ? AuditEventsService.DEFAULT_EVENTS_LIMIT
        : Math.min(
            Math.trunc(limitInput),
            AuditEventsService.MAX_EVENTS_LIMIT,
          );

    const rows = await this.changeLogService.findEvents(tenantId, {
      startInclusiveUtc,
      endExclusiveUtc,
      severity,
      limit,
    });

    const events: AuditEventDto[] = rows.map((row) => ({
      id: row.id,
      occurredAt: row.created_at.toISOString(),
      actorEmail: row.user_email,
      actorRef: row.actor_ref,
      action: row.action,
      severity: resolveAuditSeverity(row.severity),
      targetType: row.target_type,
      targetId: row.target_id,
    }));

    return { events, generatedAt: generatedAt.toISOString() };
  }
}
