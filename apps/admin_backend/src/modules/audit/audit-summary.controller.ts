import {
  Controller,
  Get,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '../identity/guards/auth.guard';
import { AuthoritativeCurrentUserGuard } from '../identity/guards/authoritative-current-user.guard';
import { RolesGuard } from '../identity/guards/roles.guard';
import { Roles } from '../../core/decorators/roles.decorator';
import { GetTenantId } from '../../core/decorators/tenant.decorator';
import { TenantInterceptor } from '../../core/database/rls.interceptor';
import { UserRole } from '../identity/entities/user.entity';
import { AuditSummaryService } from './audit-summary.service';
import { AuditEventsService } from './audit-events.service';
import { AuditLogsService } from './audit-logs.service';
import { AuditExecutiveSummaryDto } from './audit-executive-summary.dto';
import { AuditEventsResponseDto } from './audit-events.dto';
import { AuditEventsQueryDto } from './audit-events-query.dto';
import {
  AuditIntegrityResponseDto,
  AuditLedgerQueryDto,
  AuditLedgerResponseDto,
} from './audit-logs.dto';

/**
 * Owner Dashboard V2 — audit/security executive summary read
 * (architecture spec v0.3 §16): GET /operations/audit/summary.
 *
 * Route naming: the spec's example (`/identity/audit/summary`) defers to
 * current module conventions; the dashboard-consumed operational read
 * surface established in Batch 3 is `operations/*` (SyncHealthController),
 * and this summary aggregates the audit module's own change_log stream, so
 * the route lives under operations/audit.
 *
 * Guards mirror the other dashboard-consumed endpoints and the existing
 * audit-view policy (spec §23.3; identity AuditController): browser
 * AuthGuard chain, OWNER/MANAGER, tenant derived from the verified JWT —
 * a client can never supply or override tenant authority.
 */
@Controller('operations/audit')
@UseGuards(AuthGuard, AuthoritativeCurrentUserGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class AuditSummaryController {
  constructor(
    private readonly auditSummaryService: AuditSummaryService,
    // Slice 6b: the event-list read model lives in its own service so the
    // summary service's contract (and constructor) stays untouched.
    private readonly auditEventsService: AuditEventsService,
    // S4a: the POS forensic audit ledger read model (audit_logs store) and
    // the nightly integrity alert surface live in their own service too —
    // the change_log reads above are never repointed.
    private readonly auditLogsService: AuditLogsService,
  ) {}

  @Get('summary')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getExecutiveSummary(
    @GetTenantId() tenantId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<AuditExecutiveSummaryDto> {
    return this.auditSummaryService.getExecutiveSummary(
      tenantId,
      startDate,
      endDate,
    );
  }

  /**
   * Page-capped audit event list backing the dashboard audit page (slice
   * 6b, finding H6). Same guard chain, roles and JWT-derived tenant as the
   * summary route; query-param validation (severity taxonomy, page cap)
   * lives in AuditEventsQueryDto.
   */
  @Get('events')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getEvents(
    @GetTenantId() tenantId: string,
    @Query() query: AuditEventsQueryDto,
  ): Promise<AuditEventsResponseDto> {
    return this.auditEventsService.getEvents(
      tenantId,
      query.startDate,
      query.endDate,
      query.severity,
      query.limit,
    );
  }

  /**
   * S4a: page-capped projection of the POS forensic audit ledger
   * (audit_logs — the hash-chained store the POS feeds via
   * POST /identity/audit) onto the dashboard. The voids, credit notes,
   * manual discounts and supervisor overrides recorded at the POS become
   * visible here without duplicating rows into change_log or touching the
   * hash chain. Same guard chain, roles and JWT-derived tenant as the
   * routes above; query-param validation (page cap) lives in
   * AuditLedgerQueryDto and the response never carries the metadata blob
   * or the hash columns.
   */
  @Get('ledger')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getLedger(
    @GetTenantId() tenantId: string,
    @Query() query: AuditLedgerQueryDto,
  ): Promise<AuditLedgerResponseDto> {
    return this.auditLogsService.getLedger(tenantId, {
      startDate: query.startDate,
      endDate: query.endDate,
      actorUserId: query.actorUserId,
      targetType: query.targetType,
      targetId: query.targetId,
      action: query.action,
      limitInput: query.limit,
    });
  }

  /**
   * S4a: read-only surface for the nightly hash-chain gap detection state
   * (audit_integrity_alerts), so the `gap_detected` event the nightly cron
   * emits is finally visible to a human. Same guard chain, roles and
   * JWT-derived tenant as the routes above.
   */
  @Get('integrity')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getIntegrityAlerts(
    @GetTenantId() tenantId: string,
  ): Promise<AuditIntegrityResponseDto> {
    return this.auditLogsService.getIntegrityAlerts(tenantId);
  }
}
