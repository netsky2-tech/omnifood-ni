import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';
import { LoyaltyLedgerService } from './loyalty-ledger.service';
import {
  LoyaltyProgramResolution,
  LoyaltySyncIngestionService,
} from './loyalty-sync-ingestion.service';
import { CustomerPointTransaction } from '../../customers/entities/customer-point-transaction.entity';
import { AuditLog } from '../../identity/entities/audit-log.entity';

export interface BackfillUnassignedUnresolvedEntry {
  customerId: string;
  /**
   * `none`: the tenant has no ACTIVE program — program-less rows are the
   * legitimate legacy H2 state, NOT a failure. `PROGRAM_UNRESOLVED`: several
   * ACTIVE programs exist and the customer's projection rows cannot
   * disambiguate them — the rows are left untouched (fail closed).
   */
  outcome: 'none' | 'PROGRAM_UNRESOLVED';
}

export interface BackfillUnassignedReport {
  customersScanned: number;
  transactionsAttributed: number;
  customersAttributed: number;
  unresolved: BackfillUnassignedUnresolvedEntry[];
  dryRun: boolean;
}

interface NullRowsByCustomerRow {
  customer_id: string;
  tx_count?: string | number | null;
}

/**
 * B1b: repairs rows pushed to `customer_point_transactions` BEFORE the
 * loyalty-sync program resolution fix (Batch 5 slice 5b / finding H2). Those
 * rows keep `loyalty_program_id NULL` and are invisible to the projection
 * keyed by (tenant, customer, program).
 *
 * The legacy `classify-legacy` surface is NOT the correct repair: it
 * attributes every NULL row to a fabricated LEGACY program. This service
 * instead reuses the forward-path resolver
 * (`LoyaltySyncIngestionService.resolveLoyaltyProgramId`) so NULL rows are
 * attributed to the tenant's REAL program under the exact same rules the
 * forward path applies, and then rebuilds the per-customer projection from
 * the ledger.
 *
 * Atomicity: each step opens its own tenant transaction — resolve (read),
 * attribute (one UPDATE scoped by tenant+customer+`loyalty_program_id IS
 * NULL`), rebuild (`LoyaltyLedgerService.rebuildProjection`, which also
 * recomputes the ledger-authoritative `customers.points_balance` column).
 * The steps are deliberately NOT nested inside one transaction: the resolver
 * and the rebuild own their transactions, and the NULL-row predicate makes
 * the whole per-customer sequence idempotent and crash-safe — a re-run
 * attributes nothing (no NULL rows left) and the rebuild re-SUMs from the
 * ledger, so an interrupted run heals itself on the next invocation.
 */
@Injectable()
export class LoyaltyProgramBackfillService {
  private readonly logger = new Logger(LoyaltyProgramBackfillService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly ingestionService: LoyaltySyncIngestionService,
    private readonly ledgerService: LoyaltyLedgerService,
  ) {}

  /**
   * Reports what a commit WOULD do without writing anything: per-customer
   * resolution outcomes and NULL-row counts. No rows are attributed, no
   * projections are touched, no audit row is written.
   */
  async previewBackfill(
    tenantId: string,
    batchSize: number,
  ): Promise<BackfillUnassignedReport> {
    const scanned = await this.scanCustomersWithNullRows(tenantId, batchSize);

    const unresolved: BackfillUnassignedUnresolvedEntry[] = [];
    for (const row of scanned) {
      const resolution = await this.ingestionService.resolveLoyaltyProgramId(
        tenantId,
        row.customer_id,
      );
      if (resolution.outcome !== 'resolved') {
        unresolved.push(this.toUnresolvedEntry(row.customer_id, resolution));
      }
    }

    return {
      customersScanned: scanned.length,
      transactionsAttributed: 0,
      customersAttributed: 0,
      unresolved,
      dryRun: true,
    };
  }

  /**
   * Attributes each scanned customer's NULL rows to the customer's resolved
   * program and rebuilds its projection. Customers whose program cannot be
   * resolved are reported and left untouched — the commit never fails the
   * whole batch because of one unresolvable customer, and never forces an
   * attribution (fail closed). One AuditLog row records the whole commit.
   */
  async commitBackfill(
    tenantId: string,
    batchSize: number,
    actorUserId?: string,
  ): Promise<BackfillUnassignedReport> {
    // Fail closed BEFORE any mutation: the audit row carries the actor's
    // identity and audit_logs.user_id is NOT NULL.
    if (!actorUserId?.trim()) {
      throw new UnauthorizedException(
        'Actor user id is required to commit the loyalty program backfill',
      );
    }

    const scanned = await this.scanCustomersWithNullRows(tenantId, batchSize);

    let transactionsAttributed = 0;
    let customersAttributed = 0;
    const unresolved: BackfillUnassignedUnresolvedEntry[] = [];

    for (const row of scanned) {
      const customerId = row.customer_id;
      const resolution = await this.ingestionService.resolveLoyaltyProgramId(
        tenantId,
        customerId,
      );

      if (resolution.outcome !== 'resolved' || !resolution.programId) {
        this.logger.warn(
          `[LOYALTY-BACKFILL] customer=${customerId} tenant=${tenantId} ` +
            `outcome=${resolution.outcome}: NULL point transactions were NOT ` +
            `attributed`,
        );
        unresolved.push(this.toUnresolvedEntry(customerId, resolution));
        continue;
      }

      const attributed = await this.attributeNullRows(
        tenantId,
        customerId,
        resolution.programId,
      );
      transactionsAttributed += attributed;
      customersAttributed += 1;

      // Opens its own tenant transaction and recomputes BOTH the projection
      // row (SUM(units) per customer+program) and the global
      // customers.points_balance column (SUM(points)) from the ledger.
      await this.ledgerService.rebuildProjection(
        tenantId,
        customerId,
        resolution.programId,
      );
    }

    await this.writeAuditLog(tenantId, actorUserId, {
      attributedCustomers: customersAttributed,
      attributedTransactions: transactionsAttributed,
      unresolvedCustomers: unresolved.length,
      batchSize,
    });

    return {
      customersScanned: scanned.length,
      transactionsAttributed,
      customersAttributed,
      unresolved,
      dryRun: false,
    };
  }

  private toUnresolvedEntry(
    customerId: string,
    resolution: LoyaltyProgramResolution,
  ): BackfillUnassignedUnresolvedEntry {
    return {
      customerId,
      outcome:
        resolution.outcome === 'ambiguous' ? 'PROGRAM_UNRESOLVED' : 'none',
    };
  }

  /**
   * Distinct customers holding NULL-program rows, ordered by customer_id for
   * deterministic batching. Read-only, on the tenant-bound manager.
   */
  private async scanCustomersWithNullRows(
    tenantId: string,
    batchSize: number,
  ): Promise<NullRowsByCustomerRow[]> {
    return runInTenantTransaction(this.dataSource, tenantId, (manager) =>
      manager
        .getRepository(CustomerPointTransaction)
        .createQueryBuilder('tx')
        .select('tx.customer_id', 'customer_id')
        .addSelect('COUNT(*)', 'tx_count')
        .where('tx.tenant_id = :tenantId', { tenantId })
        .andWhere('tx.loyalty_program_id IS NULL')
        .groupBy('tx.customer_id')
        .orderBy('tx.customer_id', 'ASC')
        .limit(batchSize)
        .getRawMany<NullRowsByCustomerRow>(),
    );
  }

  /**
   * One UPDATE scoped by tenant + customer + `loyalty_program_id IS NULL` on
   * its own tenant transaction. The NULL predicate makes re-runs no-ops.
   */
  private async attributeNullRows(
    tenantId: string,
    customerId: string,
    loyaltyProgramId: string,
  ): Promise<number> {
    return runInTenantTransaction(this.dataSource, tenantId, (manager) => {
      const txRepo = manager.getRepository(CustomerPointTransaction);
      return txRepo
        .createQueryBuilder()
        .update(CustomerPointTransaction)
        .set({ loyalty_program_id: loyaltyProgramId })
        .where('tenant_id = :tenantId', { tenantId })
        .andWhere('customer_id = :customerId', { customerId })
        .andWhere('loyalty_program_id IS NULL')
        .execute()
        .then((result) => result.affected ?? 0);
    });
  }

  /**
   * ONE audit row for the whole commit (same minimal shape as the inventory
   * remediation precedent; sequence/hash columns carry DB defaults).
   */
  private async writeAuditLog(
    tenantId: string,
    actorUserId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await runInTenantTransaction(this.dataSource, tenantId, (manager) => {
      const auditLog = manager.create(AuditLog, {
        tenant_id: tenantId,
        user_id: actorUserId,
        device_id: 'BACKOFFICE',
        action: 'LOYALTY_PROGRAM_BACKFILL_COMMITTED',
        target_type: 'loyalty_program',
        target_id: null,
        metadata,
        timestamp: new Date(),
      });
      return manager.save(AuditLog, auditLog);
    });
  }
}
