import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Optional,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  runInTenantTransaction,
  resolveTenantContextId,
} from '../../../core/database/tenant-transaction';
import {
  ImportStaging,
  ImportStagingStatus,
} from '../entities/import-staging.entity';
import { Product } from '../../inventory/entities/product.entity';
import {
  LegacyImportIntegrityReport,
  LegacyImportIntegrityStatus,
} from '../entities/legacy-import-integrity-report.entity';
import {
  LegacyMigrationDecision,
  LegacyOnboardingMigrationReceipt,
} from '../entities/legacy-migration-receipt.entity';
import { OnboardingSession } from '../entities/onboarding-session.entity';

export interface LegacyScanResult {
  expiredSessions: string[];
  expiredRowsCount: number;
}

interface KardexTotalRow {
  total: unknown;
}

function isKardexTotalRow(row: unknown): row is KardexTotalRow {
  return typeof row === 'object' && row !== null && 'total' in row;
}

@Injectable()
export class LegacyImportIntegrityReportService {
  private readonly logger = new Logger(LegacyImportIntegrityReportService.name);

  constructor(
    @InjectRepository(ImportStaging)
    private readonly stagingRepo: Repository<ImportStaging>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(LegacyImportIntegrityReport)
    private readonly reportRepo: Repository<LegacyImportIntegrityReport>,
    @InjectRepository(LegacyOnboardingMigrationReceipt)
    private readonly receiptRepo: Repository<LegacyOnboardingMigrationReceipt>,
    private readonly dataSource: DataSource,
    @Optional()
    @InjectRepository(OnboardingSession)
    private readonly sessionRepo?: Repository<OnboardingSession>,
  ) {}

  /**
   * Sums the Kardex movements for one insumo.
   *
   * `inventory_kardex` carries FORCE ROW LEVEL SECURITY, so this read has to
   * run on a connection with the tenant bound: unbound, the policy evaluates
   * `current_setting('app.tenant_id', true)::uuid` on a blank value and the
   * query either throws or silently returns nothing, depending on what the
   * pooled connection last held. Read through the default connection, it did
   * both at different times, and the caller's catch turned either outcome
   * into a quietly wrong integrity report (issue #358).
   *
   * T2.S4d: the read reuses the CALLER'S transaction manager — the manager
   * whose `app.tenant_id` is already bound — instead of opening its own
   * transaction. A nested independent transaction inside a bound operation
   * would escape the caller's atomicity boundary and read without sharing
   * its consistent snapshot.
   */
  private async kardexStockFor(
    manager: EntityManager,
    tenantId: string,
    insumoId: string,
  ): Promise<number> {
    const rows: unknown = await manager.query(
      `SELECT COALESCE(SUM(quantity), 0) as total FROM inventory_kardex WHERE tenant_id = $1 AND insumo_id = $2`,
      [tenantId, insumoId],
    );
    if (
      Array.isArray(rows) &&
      rows.length > 0 &&
      isKardexTotalRow(rows[0]) &&
      rows[0].total
    ) {
      return Number(rows[0].total);
    }
    return 0;
  }

  /**
   * Generates a forensic report scanning for any legacy imports that may have committed
   * direct stock or cost modifications outside of the Kardex ledger.
   * Onboarding NEVER modifies product stock/cost via ad-hoc updates.
   *
   * T2.S4d: ONE tenant-bound transaction — `app.tenant_id` is bound before
   * the first protected access and the scan, the report and its forensic
   * receipt are all read/written through the transaction manager, so
   * report+receipt commit or roll back atomically and no pooled connection
   * ever serves protected data.
   */
  async generateIntegrityReport(
    tenantId: string,
    reviewedBy?: string,
  ): Promise<LegacyImportIntegrityReport> {
    // Fail closed on a blank tenant before any SQL: the same
    // TenantContextRequiredError contract as the other bound onboarding
    // paths (T2.S2a/S2b/S4a/S4b/S4c).
    const trimmedTenant = resolveTenantContextId(tenantId);

    return runInTenantTransaction(
      this.dataSource,
      trimmedTenant,
      async (manager: EntityManager) => {
        // 1. Find all committed staging rows with stock or cost in the tenant
        const legacyCommittedRows = await manager.find(ImportStaging, {
          where: {
            tenant_id: trimmedTenant,
            estado_fila: ImportStagingStatus.COMMITTED,
          },
        });

        const rowsWithStockOrCost = legacyCommittedRows.filter(
          (r) =>
            (r.parsed_stock_inicial !== null &&
              Number(r.parsed_stock_inicial) > 0) ||
            (r.parsed_costo_insumo !== null &&
              Number(r.parsed_costo_insumo) > 0),
        );

        const legacyImportRefs = Array.from(
          new Set(rowsWithStockOrCost.map((r) => r.token_sesion_importacion)),
        );

        const affectedProductRefs: string[] = [];
        const observedWrites: Array<{
          productId: string;
          productName: string;
          productStock: number;
          kardexStock: number;
          discrepancy: number;
          directCostObserved: number | null;
          sourceImportSession?: string;
        }> = [];

        let kardexEvidencePresent = false;

        if (rowsWithStockOrCost.length > 0) {
          // `products` is RLS debt until T3, but the read shares the bound
          // manager for forward correctness (S4c precedent).
          const liveProducts = await manager.find(Product, {
            where: { tenant_id: trimmedTenant },
          });

          for (const row of rowsWithStockOrCost) {
            const productName = (row.parsed_nombre || '').trim().toLowerCase();
            const matchedProduct = liveProducts.find(
              (p) => p.name.trim().toLowerCase() === productName,
            );

            if (matchedProduct) {
              if (!affectedProductRefs.includes(matchedProduct.id)) {
                affectedProductRefs.push(matchedProduct.id);
              }

              // Check if there are real movements in inventory_kardex — on
              // the SAME bound manager, never a nested transaction.
              let kardexStock = 0;
              try {
                kardexStock = await this.kardexStockFor(
                  manager,
                  trimmedTenant,
                  matchedProduct.id,
                );
                if (kardexStock > 0) {
                  kardexEvidencePresent = true;
                }
              } catch (error) {
                // The column shape is the documented reason for tolerating a failure here.
                // Log it instead of swallowing it: a silent catch turned an unbound read of
                // a FORCE-RLS table into a quietly wrong integrity report (issue #358).
                this.logger.warn(
                  `Kardex stock unavailable for insumo ${matchedProduct.id}: ` +
                    `${(error as Error).message}`,
                );
              }

              const productStock = Number(matchedProduct.stock) || 0;
              const directCost =
                row.parsed_costo_insumo !== null
                  ? Number(row.parsed_costo_insumo)
                  : null;

              if (productStock > 0 || (directCost !== null && directCost > 0)) {
                observedWrites.push({
                  productId: matchedProduct.id,
                  productName: matchedProduct.name,
                  productStock,
                  kardexStock,
                  discrepancy: Math.abs(productStock - kardexStock),
                  directCostObserved: directCost,
                  sourceImportSession: row.token_sesion_importacion,
                });
              }
            }
          }
        }

        const hasDiscrepancy = observedWrites.length > 0;
        const status = hasDiscrepancy
          ? LegacyImportIntegrityStatus.REVIEW_REQUIRED
          : LegacyImportIntegrityStatus.CLEAN;

        const reportEntity = manager.create(LegacyImportIntegrityReport, {
          tenant_id: trimmedTenant,
          legacy_import_refs: legacyImportRefs,
          affected_product_refs: affectedProductRefs,
          observed_direct_stock_or_cost_writes: observedWrites,
          kardex_evidence_present: kardexEvidencePresent,
          status,
          reviewed_by: reviewedBy || null,
          remediation_refs: [],
        });

        const savedReport = await manager.save(
          LegacyImportIntegrityReport,
          reportEntity,
        );

        // Write forensic receipt — inside the SAME transaction, so the
        // report and its receipt are atomic.
        const decision =
          status === LegacyImportIntegrityStatus.CLEAN
            ? LegacyMigrationDecision.CLEAN
            : LegacyMigrationDecision.REVIEW_REQUIRED;

        const receipt = manager.create(LegacyOnboardingMigrationReceipt, {
          tenant_id: trimmedTenant,
          receipt_type: 'LEGACY_IMPORT_INTEGRITY_SCAN',
          target_entity_type: 'LEGACY_IMPORT_INTEGRITY_REPORT',
          target_entity_id: savedReport.id,
          decision,
          reason: hasDiscrepancy
            ? `Detected ${observedWrites.length} products with unbacked direct stock/cost writes outside Kardex.`
            : 'Scan completed. No direct stock or cost writes detected outside Kardex.',
          evidence_json: {
            reportId: savedReport.id,
            legacyImportRefs,
            affectedProductCount: affectedProductRefs.length,
            observedWritesCount: observedWrites.length,
          },
          executed_by: reviewedBy || 'SYSTEM',
        });
        await manager.save(LegacyOnboardingMigrationReceipt, receipt);

        return savedReport;
      },
    );
  }

  /**
   * Expires and rejects uncommitted legacy staging rows that contain incompatible
   * stock or cost fields, requiring re-upload under the canonical ImportContractVersion.
   *
   * T2.S4d: ONE tenant-bound transaction — staging updates and the expiry
   * receipts commit or roll back atomically through the transaction manager.
   */
  async expireIncompatibleLegacyStaging(
    tenantId: string,
  ): Promise<LegacyScanResult> {
    const trimmedTenant = resolveTenantContextId(tenantId);

    return runInTenantTransaction(
      this.dataSource,
      trimmedTenant,
      async (manager: EntityManager) => {
        const pendingRows = await manager.find(ImportStaging, {
          where: {
            tenant_id: trimmedTenant,
            estado_fila: In([
              ImportStagingStatus.PENDIENTE,
              ImportStagingStatus.VALIDO,
            ]),
          },
        });

        const incompatibleRows = pendingRows.filter(
          (r) =>
            (r.raw_stock_inicial !== null && r.raw_stock_inicial !== '') ||
            (r.raw_costo_insumo !== null && r.raw_costo_insumo !== '') ||
            (r.parsed_stock_inicial !== null &&
              Number(r.parsed_stock_inicial) > 0) ||
            (r.parsed_costo_insumo !== null &&
              Number(r.parsed_costo_insumo) > 0),
        );

        if (incompatibleRows.length === 0) {
          return {
            expiredSessions: [],
            expiredRowsCount: 0,
          };
        }

        const sessionTokens = Array.from(
          new Set(incompatibleRows.map((r) => r.token_sesion_importacion)),
        );

        for (const row of incompatibleRows) {
          row.estado_fila = ImportStagingStatus.ERROR;
          row.mensaje_error_detalle =
            'Legacy staging incompatible: stock y costo no se admiten en V1. Por favor re-subir con la plantilla canónica.';
        }

        await manager.save(ImportStaging, incompatibleRows);

        // Write expiry receipts for each affected session — inside the SAME
        // transaction, so staging updates and receipts are atomic.
        for (const sessionToken of sessionTokens) {
          const receipt = manager.create(LegacyOnboardingMigrationReceipt, {
            tenant_id: trimmedTenant,
            receipt_type: 'LEGACY_STAGING_EXPIRY',
            target_entity_type: 'PRODUCT_IMPORT_SESSION',
            target_entity_id: sessionToken,
            decision: LegacyMigrationDecision.EXPIRED_REJECTED,
            reason:
              'Staging session contained legacy stock/cost fields incompatible with V1 canonical contract. Expired for re-upload.',
            evidence_json: {
              sessionToken,
              incompatibleRowsCount: incompatibleRows.filter(
                (r) => r.token_sesion_importacion === sessionToken,
              ).length,
            },
            executed_by: 'SYSTEM',
          });
          await manager.save(LegacyOnboardingMigrationReceipt, receipt);
        }

        return {
          expiredSessions: sessionTokens,
          expiredRowsCount: incompatibleRows.length,
        };
      },
    );
  }

  /**
   * Formally remediates a LegacyImportIntegrityReport strictly via inventory command/Kardex reference.
   * Onboarding NEVER mutates product stock or CPP directly via ad-hoc SQL updates (AC-39, Rule 72).
   *
   * T2.S4d: ONE tenant-bound transaction — the report update and its
   * remediation receipt commit or roll back atomically through the
   * transaction manager.
   */
  async remediateReportWithInventoryCommand(
    tenantId: string,
    reportId: string,
    inventoryCommandRef: string,
    reviewedBy?: string,
  ): Promise<LegacyImportIntegrityReport> {
    const trimmedTenant = resolveTenantContextId(tenantId);
    const trimmedReportId = reportId?.trim();
    if (!trimmedReportId) {
      throw new BadRequestException('Report ID is required');
    }
    const trimmedRef = inventoryCommandRef?.trim();
    if (!trimmedRef) {
      throw new BadRequestException('Inventory command reference is required');
    }

    return runInTenantTransaction(
      this.dataSource,
      trimmedTenant,
      async (manager: EntityManager) => {
        const report = await manager.findOne(LegacyImportIntegrityReport, {
          where: { id: trimmedReportId, tenant_id: trimmedTenant },
        });
        if (!report) {
          throw new NotFoundException(
            `LegacyImportIntegrityReport '${trimmedReportId}' not found for tenant '${trimmedTenant}'`,
          );
        }

        if (report.status === LegacyImportIntegrityStatus.REMEDIATED) {
          return report;
        }

        const updatedRemediationRefs = [
          ...(report.remediation_refs || []),
          trimmedRef,
        ];
        report.remediation_refs = updatedRemediationRefs;
        report.status = LegacyImportIntegrityStatus.REMEDIATED;
        report.reviewed_by = reviewedBy || 'SYSTEM';

        const savedReport = await manager.save(
          LegacyImportIntegrityReport,
          report,
        );

        const receipt = manager.create(LegacyOnboardingMigrationReceipt, {
          tenant_id: trimmedTenant,
          receipt_type: 'LEGACY_IMPORT_REMEDIATION',
          target_entity_type: 'LEGACY_IMPORT_INTEGRITY_REPORT',
          target_entity_id: savedReport.id,
          decision: LegacyMigrationDecision.REMEDIATED,
          reason:
            'Discrepancy remediated strictly via inventory command and Kardex receipt reference.',
          evidence_json: {
            reportId: savedReport.id,
            inventoryCommandRef: trimmedRef,
            previousStatus: 'REVIEW_REQUIRED',
            remediationRefs: updatedRemediationRefs,
          },
          executed_by: reviewedBy || 'SYSTEM',
        });
        await manager.save(LegacyOnboardingMigrationReceipt, receipt);

        return savedReport;
      },
    );
  }

  /**
   * Accepts a LegacyImportIntegrityReport as-is with audited justification (Rule 72).
   *
   * T2.S4d: ONE tenant-bound transaction — the report update and its
   * accept-as-is receipt commit or roll back atomically through the
   * transaction manager.
   */
  async acceptReportAsIs(
    tenantId: string,
    reportId: string,
    rationale: string,
    reviewedBy?: string,
  ): Promise<LegacyImportIntegrityReport> {
    const trimmedTenant = resolveTenantContextId(tenantId);
    const trimmedReportId = reportId?.trim();
    if (!trimmedReportId) {
      throw new BadRequestException('Report ID is required');
    }
    const trimmedRationale = rationale?.trim();
    if (!trimmedRationale || trimmedRationale.length < 10) {
      throw new BadRequestException(
        'A substantive rationale (at least 10 characters) is required to accept legacy discrepancy as-is',
      );
    }

    return runInTenantTransaction(
      this.dataSource,
      trimmedTenant,
      async (manager: EntityManager) => {
        const report = await manager.findOne(LegacyImportIntegrityReport, {
          where: { id: trimmedReportId, tenant_id: trimmedTenant },
        });
        if (!report) {
          throw new NotFoundException(
            `LegacyImportIntegrityReport '${trimmedReportId}' not found for tenant '${trimmedTenant}'`,
          );
        }

        report.status = LegacyImportIntegrityStatus.ACCEPTED_AS_IS;
        report.reviewed_by = reviewedBy || 'SYSTEM';

        const savedReport = await manager.save(
          LegacyImportIntegrityReport,
          report,
        );

        const receipt = manager.create(LegacyOnboardingMigrationReceipt, {
          tenant_id: trimmedTenant,
          receipt_type: 'LEGACY_IMPORT_ACCEPT_AS_IS',
          target_entity_type: 'LEGACY_IMPORT_INTEGRITY_REPORT',
          target_entity_id: savedReport.id,
          decision: LegacyMigrationDecision.ACCEPTED_AS_IS,
          reason: trimmedRationale,
          evidence_json: {
            reportId: savedReport.id,
            rationale: trimmedRationale,
          },
          executed_by: reviewedBy || 'SYSTEM',
        });
        await manager.save(LegacyOnboardingMigrationReceipt, receipt);

        return savedReport;
      },
    );
  }

  /**
   * Formally reconciles legacy baseline tenants (measurementEligible=false).
   * INVARIANT: Never fabricates or synthesizes a fake historical TTFSS (Rule 73, AC-56).
   *
   * T2.S4d: ONE tenant-bound transaction — the session update and its
   * reconciliation receipt commit or roll back atomically through the
   * transaction manager. The optional `sessionRepo` guard stays as the
   * wiring contract: the onboarding_sessions access itself resolves from the
   * bound manager, so no pooled connection serves the protected read.
   */
  async reconcileLegacyBaselineSession(
    tenantId: string,
    reviewedBy?: string,
  ): Promise<LegacyOnboardingMigrationReceipt> {
    const trimmedTenant = resolveTenantContextId(tenantId);
    if (!this.sessionRepo) {
      throw new BadRequestException('Session repository unavailable');
    }

    return runInTenantTransaction(
      this.dataSource,
      trimmedTenant,
      async (manager: EntityManager) => {
        const session = await manager.findOne(OnboardingSession, {
          where: { tenantId: trimmedTenant },
        });
        if (!session) {
          throw new NotFoundException(
            `Onboarding session not found for tenant '${trimmedTenant}'`,
          );
        }

        // Enforce legacy baseline invariants
        session.legacyBaseline = true;
        session.measurementEligible = false;
        // INVARIANT: firstSuccessfulSaleAt remains untampered! If null, NEVER invent a timestamp
        const savedSession = await manager.save(OnboardingSession, session);

        const receipt = manager.create(LegacyOnboardingMigrationReceipt, {
          tenant_id: trimmedTenant,
          receipt_type: 'LEGACY_BASELINE_RECONCILIATION',
          target_entity_type: 'ONBOARDING_SESSION',
          target_entity_id: savedSession.id,
          decision: LegacyMigrationDecision.LEGACY_BASELINE_CLOSED,
          reason:
            'Legacy baseline tenant formally reconciled with measurementEligible=false; no synthetic TTFSS published.',
          evidence_json: {
            sessionId: savedSession.id,
            legacyBaseline: savedSession.legacyBaseline,
            measurementEligible: savedSession.measurementEligible,
            firstSuccessfulSaleAt: savedSession.firstSuccessfulSaleAt,
          },
          executed_by: reviewedBy || 'SYSTEM',
        });

        return manager.save(LegacyOnboardingMigrationReceipt, receipt);
      },
    );
  }
}
