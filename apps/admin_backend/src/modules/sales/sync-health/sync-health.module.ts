import { Module } from '@nestjs/common';
import { SyncHealthController } from './sync-health.controller';
import { SyncHealthService } from './sync-health.service';

/**
 * Owner Dashboard V2 — sync freshness foundation (Batch 3).
 *
 * Registered through SalesModule so the freshness read sits beside the sync
 * ingestion path that owns the receipt/outbox tables it derives evidence
 * from. All table reads are tenant-bound transaction reads (issue #592), so
 * no forFeature repository tokens are registered here on purpose: the
 * service's only DataSource use is runInTenantTransaction.
 */
@Module({
  controllers: [SyncHealthController],
  providers: [SyncHealthService],
  exports: [SyncHealthService],
})
export class SyncHealthModule {}
