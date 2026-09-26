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
 */
@Module({
  imports: [IdentityModule],
  controllers: [SyncHealthController, CardReconciliationSummaryController],
  providers: [SyncHealthService, CardReconciliationSummaryService],
  exports: [SyncHealthService, CardReconciliationSummaryService],
})
export class SyncHealthModule {}
