import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, In } from 'typeorm';
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

export interface LegacyScanResult {
  expiredSessions: string[];
  expiredRowsCount: number;
}

@Injectable()
export class LegacyImportIntegrityReportService {
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
  ) {}

  /**
   * Generates a forensic report scanning for any legacy imports that may have committed
   * direct stock or cost modifications outside of the Kardex ledger.
   * Onboarding NEVER modifies product stock/cost via ad-hoc updates.
   */
  async generateIntegrityReport(
    tenantId: string,
    reviewedBy?: string,
  ): Promise<LegacyImportIntegrityReport> {
    const trimmedTenant = tenantId?.trim();
    if (!trimmedTenant) {
      throw new BadRequestException('Tenant ID is required');
    }

    // 1. Find all committed staging rows with stock or cost in the tenant
    const legacyCommittedRows = await this.stagingRepo.find({
      where: {
        tenant_id: trimmedTenant,
        estado_fila: ImportStagingStatus.COMMITTED,
      },
    });

    const rowsWithStockOrCost = legacyCommittedRows.filter(
      (r) =>
        (r.parsed_stock_inicial !== null &&
          Number(r.parsed_stock_inicial) > 0) ||
        (r.parsed_costo_insumo !== null && Number(r.parsed_costo_insumo) > 0),
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
      const liveProducts = await this.productRepo.find({
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

          // Check if there are real movements in inventory_kardex
          let kardexStock = 0;
          try {
            const kardexRows = await this.dataSource.query(
              `SELECT COALESCE(SUM(quantity), 0) as total FROM inventory_kardex WHERE tenant_id = $1 AND insumo_id = $2`,
              [trimmedTenant, matchedProduct.id],
            );
            if (kardexRows && kardexRows.length > 0 && kardexRows[0].total) {
              kardexStock = Number(kardexRows[0].total);
              kardexEvidencePresent = true;
            }
          } catch {
            // If table doesn't have matching structure, kardexStock remains 0
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

    const reportEntity = this.reportRepo.create({
      tenant_id: trimmedTenant,
      legacy_import_refs: legacyImportRefs,
      affected_product_refs: affectedProductRefs,
      observed_direct_stock_or_cost_writes: observedWrites,
      kardex_evidence_present: kardexEvidencePresent,
      status,
      reviewed_by: reviewedBy || null,
      remediation_refs: [],
    });

    const savedReport = await this.reportRepo.save(reportEntity);

    // Write forensic receipt
    const decision =
      status === LegacyImportIntegrityStatus.CLEAN
        ? LegacyMigrationDecision.CLEAN
        : LegacyMigrationDecision.REVIEW_REQUIRED;

    const receipt = this.receiptRepo.create({
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
    await this.receiptRepo.save(receipt);

    return savedReport;
  }

  /**
   * Expires and rejects uncommitted legacy staging rows that contain incompatible
   * stock or cost fields, requiring re-upload under the canonical ImportContractVersion.
   */
  async expireIncompatibleLegacyStaging(
    tenantId: string,
  ): Promise<LegacyScanResult> {
    const trimmedTenant = tenantId?.trim();
    if (!trimmedTenant) {
      throw new BadRequestException('Tenant ID is required');
    }

    const pendingRows = await this.stagingRepo.find({
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
        (r.parsed_costo_insumo !== null && Number(r.parsed_costo_insumo) > 0),
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

    await this.stagingRepo.save(incompatibleRows);

    // Write expiry receipts for each affected session
    for (const sessionToken of sessionTokens) {
      const receipt = this.receiptRepo.create({
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
      await this.receiptRepo.save(receipt);
    }

    return {
      expiredSessions: sessionTokens,
      expiredRowsCount: incompatibleRows.length,
    };
  }
}
