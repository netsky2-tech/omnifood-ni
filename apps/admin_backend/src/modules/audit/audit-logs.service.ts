import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { runInTenantTransaction } from '../../core/database/tenant-transaction';
import {
  resolveReportingBounds,
} from '../../core/reporting/reporting-period';
import {
  classifyAuditSeverity,
} from './audit-risk-classifier';
import { AuditLog } from '../identity/entities/audit-log.entity';
import { AuditIntegrityAlert } from '../identity/entities/audit-integrity-alert.entity';
import {
  AuditIntegrityAlertDto,
  AuditIntegrityResponseDto,
  AuditLedgerEntryDto,
  AuditLedgerResponseDto,
} from './audit-logs.dto';

/**
 * S4a — POS forensic audit ledger read service.
 *
 * The POS writes hash-chained rows into `audit_logs` via
 * POST /identity/audit; this service projects that store into the owner
 * dashboard as a SECOND, correct source beside the change_log stream
 * (AuditEventsService). It never writes, never mutates and never duplicates
 * rows across stores: the append-only hash chain stays the single source of
 * forensic truth.
 *
 * Contract family (mirrors AuditEventsService / ChangeLogService):
 * - every read rides the tenant-bound transaction path (issue #512); the
 *   pooled repositories below stand declared for Nest DI compatibility only
 *   and are never queried — `audit_logs` and `audit_integrity_alerts` are
 *   still RLS debt tables (scripts/schema-rls-coverage-manifest.txt), so the
 *   explicit `tenant_id` predicate inside the bound transaction is the
 *   isolation boundary until their promotion lands;
 * - the shared reporting-period parser interprets the date inputs
 *   (spec §6.2 — no duplicated parsing);
 * - the response carries identity evidence, action code, entity reference,
 *   device and timestamp — NEVER the metadata blob and NEVER the hash-chain
 *   columns (see audit-logs.dto.ts for the severity decision);
 * - the page cap is bounded and the response is honest about truncation.
 */
@Injectable()
export class AuditLogsService {
  /** Page size contract for GET /operations/audit/ledger (mirrors /events). */
  static readonly DEFAULT_LEDGER_LIMIT = 50;
  static readonly MAX_LEDGER_LIMIT = 100;

  constructor(
    @InjectRepository(AuditLog)
    // RLS debt table (#512 T3 slice 7): read only through the tenant-bound
    // transaction manager below; this pooled repository stays declared for
    // Nest DI compatibility only.
    private readonly auditLogRepo: Repository<AuditLog>,
    @InjectRepository(AuditIntegrityAlert)
    // Same debt story: its single writer is the pooled nightly integrity
    // cron, so the table is read here only through the bound manager.
    private readonly integrityAlertRepo: Repository<AuditIntegrityAlert>,
    private readonly dataSource: DataSource,
  ) {}

  async getLedger(
    tenantId: string,
    filter: {
      startDate?: string;
      endDate?: string;
      actorUserId?: string;
      targetType?: string;
      targetId?: string;
      action?: string;
      limitInput?: number;
    },
    generatedAt: Date = new Date(),
  ): Promise<AuditLedgerResponseDto> {
    // Shared reporting-period parsing (spec §6.2); validation errors
    // propagate so callers get the module's documented failure shape.
    const bounds = resolveReportingBounds(filter.startDate, filter.endDate);
    const startInclusiveUtc = bounds.startInclusiveUtc ?? null;
    const endExclusiveUtc = bounds.endExclusiveUtc ?? null;

    const limit =
      filter.limitInput === undefined || filter.limitInput === null
        ? AuditLogsService.DEFAULT_LEDGER_LIMIT
        : Math.min(
            Math.trunc(filter.limitInput),
            AuditLogsService.MAX_LEDGER_LIMIT,
          );

    const rows = await runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (bound) => {
        const qb = bound
          .getRepository(AuditLog)
          .createQueryBuilder('audit')
          // Actor resolution: audit_logs carries only user_id (no
          // denormalized user_email / actor_ref like change_log), so the
          // displayable identity is joined from users. The joined entity is
          // never selected into the response — only the email is mapped.
          .leftJoinAndSelect('audit.user', 'actor')
          .where('audit.tenant_id = :tenantId', { tenantId })
          .orderBy('audit.timestamp', 'DESC')
          .addOrderBy('audit.id', 'DESC')
          // One probe row beyond the cap so `truncated` is provable.
          .take(limit + 1);

        if (startInclusiveUtc) {
          qb.andWhere('audit.timestamp >= :startInclusiveUtc', {
            startInclusiveUtc,
          });
        }
        if (endExclusiveUtc) {
          qb.andWhere('audit.timestamp < :endExclusiveUtc', {
            endExclusiveUtc,
          });
        }
        if (filter.actorUserId) {
          qb.andWhere('audit.user_id = :actorUserId', {
            actorUserId: filter.actorUserId,
          });
        }
        if (filter.targetType) {
          qb.andWhere('audit.target_type = :targetType', {
            targetType: filter.targetType,
          });
        }
        if (filter.targetId) {
          qb.andWhere('audit.target_id = :targetId', {
            targetId: filter.targetId,
          });
        }
        if (filter.action) {
          qb.andWhere('audit.action = :action', { action: filter.action });
        }

        return qb.getMany();
      },
    );

    const truncated = rows.length > limit;
    const page = truncated ? rows.slice(0, limit) : rows;

    const entries: AuditLedgerEntryDto[] = page.map((row) => ({
      id: row.id,
      occurredAt: row.timestamp.toISOString(),
      actorEmail: row.user?.email ?? null,
      actorUserId: row.user_id,
      action: row.action,
      // Derived from the action through the single AuditRiskClassifier —
      // audit_logs persists no severity column, and this is the same map
      // ChangeLogService persists at change_log ingestion (spec §16.2).
      severity: classifyAuditSeverity(row.action),
      targetType: row.target_type ?? null,
      targetId: row.target_id ?? null,
      deviceId: row.device_id,
      sequenceNo: row.sequence_no,
    }));

    return {
      entries,
      limit,
      truncated,
      generatedAt: generatedAt.toISOString(),
    };
  }

  /**
   * Read-only surface for the nightly hash-chain gap detection
   * (audit_integrity_alerts, written by the identity AuditIntegrityService
   * cron and announced as `gap_detected`). Read-only by contract: alert
   * lifecycle stays with the cron that owns the table.
   */
  async getIntegrityAlerts(
    tenantId: string,
    generatedAt: Date = new Date(),
  ): Promise<AuditIntegrityResponseDto> {
    const rows = await runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (bound) =>
        bound.getRepository(AuditIntegrityAlert).find({
          where: { tenant_id: tenantId },
          order: { last_seen_at: 'DESC' },
        }),
    );

    const alerts: AuditIntegrityAlertDto[] = rows.map((row) => ({
      id: row.id,
      deviceId: row.device_id,
      actorUserId: row.user_id,
      gapStart: row.gap_start,
      gapEnd: row.gap_end,
      firstDetectedAt: row.first_detected_at.toISOString(),
      lastSeenAt: row.last_seen_at.toISOString(),
    }));

    return { alerts, generatedAt: generatedAt.toISOString() };
  }
}
