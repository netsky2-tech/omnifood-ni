import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityModule } from '../identity/identity.module';
import { ChangeLog } from './entities/change-log.entity';
import { ChangeLogService } from './change-log.service';
import { AuditSummaryService } from './audit-summary.service';
import { AuditSummaryController } from './audit-summary.controller';

/**
 * Owner Dashboard V2 Batch 6a: the audit/security executive summary read
 * (architecture spec v0.3 §16) lives beside the change_log ingestion path
 * it aggregates. All summary reads are tenant-bound transaction reads
 * (issue #592), so no forFeature repository token is registered for the
 * summary service on purpose.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ChangeLog]), IdentityModule],
  controllers: [AuditSummaryController],
  providers: [ChangeLogService, AuditSummaryService],
  exports: [ChangeLogService, AuditSummaryService, TypeOrmModule],
})
export class AuditModule {}
