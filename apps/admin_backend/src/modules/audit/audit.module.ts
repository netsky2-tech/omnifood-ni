import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityModule } from '../identity/identity.module';
import { ChangeLog } from './entities/change-log.entity';
import { AuditLog } from '../identity/entities/audit-log.entity';
import { AuditIntegrityAlert } from '../identity/entities/audit-integrity-alert.entity';
import { ChangeLogService } from './change-log.service';
import { AuditSummaryService } from './audit-summary.service';
import { AuditEventsService } from './audit-events.service';
import { AuditLogsService } from './audit-logs.service';
import { AuditSummaryController } from './audit-summary.controller';

/**
 * Owner Dashboard V2 Batch 6a: the audit/security executive summary read
 * (architecture spec v0.3 §16) lives beside the change_log ingestion path
 * it aggregates. All summary reads are tenant-bound transaction reads
 * (issue #592), so no forFeature repository token is registered for the
 * summary service on purpose.
 *
 * S4a adds the POS forensic audit ledger read (AuditLogsService): it
 * projects the hash-chained `audit_logs` store and the nightly
 * `audit_integrity_alerts` state through tenant-bound transaction reads.
 * Both tables are RLS debt entries (issue #512 T3 slice 7), so their pooled
 * repository tokens are registered for DI compatibility only and every
 * access rides the bound manager inside the service.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ChangeLog, AuditLog, AuditIntegrityAlert]),
    IdentityModule,
  ],
  controllers: [AuditSummaryController],
  providers: [
    ChangeLogService,
    AuditSummaryService,
    AuditEventsService,
    AuditLogsService,
  ],
  exports: [
    ChangeLogService,
    AuditSummaryService,
    AuditEventsService,
    AuditLogsService,
    TypeOrmModule,
  ],
})
export class AuditModule {}
