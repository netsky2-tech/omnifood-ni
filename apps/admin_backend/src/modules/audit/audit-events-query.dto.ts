import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AUDIT_SEVERITIES, AuditSeverity } from './audit-risk-classifier';

/**
 * Query params for the owner-dashboard audit event list
 * (GET /operations/audit/events). Mirrors ListCashShiftsQueryDto: the page
 * size is capped server-side so the oversight surface never pulls an
 * unbounded result set, and the severity filter uses the single
 * AuditRiskClassifier vocabulary (spec §16.2 — never a second severity
 * scheme).
 */
export class AuditEventsQueryDto {
  /** Inclusive local calendar date (YYYY-MM-DD), shared reporting semantics. */
  @IsOptional()
  @IsString()
  startDate?: string;

  /** Inclusive local calendar date (YYYY-MM-DD), shared reporting semantics. */
  @IsOptional()
  @IsString()
  endDate?: string;

  /** Severity filter from the single AuditRiskClassifier taxonomy. */
  @IsOptional()
  @IsIn(AUDIT_SEVERITIES as unknown as string[])
  severity?: AuditSeverity;

  /** Page cap: default 50, max 100. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
