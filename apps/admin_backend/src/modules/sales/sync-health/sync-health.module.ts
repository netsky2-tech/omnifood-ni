import { Module } from '@nestjs/common';
import { IdentityModule } from '../../identity/identity.module';
import { SyncHealthController } from './sync-health.controller';
import { SyncHealthService } from './sync-health.service';
import { CardReconciliationSummaryController } from './card-reconciliation-summary.controller';
import { CardReconciliationSummaryService } from './card-reconciliation-summary.service';

/**
 * Owner Dashboard V2 — sync freshness foundation (Batch 3) + card
 * reconciliation summary (Batch 6a, architecture spec v0.3 §15).
 *
 * Registered through SalesModule so the freshness read sits beside the sync
 * ingestion path that owns the receipt/outbox tables it derives evidence
 * from, and the reconciliation summary sits beside the payments it
 * aggregates. All table reads are tenant-bound transaction reads (issue
 * #592), so no forFeature repository tokens are registered here on
 * purpose: the services' only DataSource use is runInTenantTransaction.
 *
 * The sequence-gap policy rides the same sync ingestion ownership: it is
 * consulted by InvoicesService.syncBatch (SalesModule imports this module)
 * at the moment a record would otherwise be staged STAGED_FUTURE forever
 * behind a lost source_sequence. It writes audit entries through the
 * ChangeLogService (AuditModule) inside the same transaction as the fill
 * receipts, so a declaration and its audit trail commit atomically.
 */
@Module({
  imports: [IdentityModule, AuditModule],
  controllers: [SyncHealthController, CardReconciliationSummaryController],
  providers: [
    SyncHealthService,
    CardReconciliationSummaryService,
    SequenceGapPolicyService,
  ],
  exports: [
    SyncHealthService,
    CardReconciliationSummaryService,
    SequenceGapPolicyService,
  ],
})
export class SyncHealthModule {}
