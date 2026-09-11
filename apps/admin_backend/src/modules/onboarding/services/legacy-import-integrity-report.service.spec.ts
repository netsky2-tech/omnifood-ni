import { Repository, DataSource } from 'typeorm';
import { LegacyImportIntegrityReportService } from './legacy-import-integrity-report.service';
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
  LegacyOnboardingMigrationReceipt,
  LegacyMigrationDecision,
} from '../entities/legacy-migration-receipt.entity';
import {
  OnboardingSession,
  OnboardingLifecycleState,
} from '../entities/onboarding-session.entity';

describe('LegacyImportIntegrityReportService (Unit & Triangulation / ONB1.4H)', () => {
  let service: LegacyImportIntegrityReportService;
  let stagingRepo: jest.Mocked<Repository<ImportStaging>>;
  let productRepo: jest.Mocked<Repository<Product>>;
  let reportRepo: jest.Mocked<Repository<LegacyImportIntegrityReport>>;
  let receiptRepo: jest.Mocked<Repository<LegacyOnboardingMigrationReceipt>>;
  let sessionRepo: jest.Mocked<Repository<OnboardingSession>>;
  let dataSource: jest.Mocked<DataSource>;

  const tenantId = 'tenant-uuid-1';

  beforeEach(() => {
    stagingRepo = {
      find: jest.fn(),
      save: jest.fn((items) => Promise.resolve(items)),
    } as unknown as jest.Mocked<Repository<ImportStaging>>;

    productRepo = {
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<Product>>;

    reportRepo = {
      create: jest.fn((plain) => plain as LegacyImportIntegrityReport),
      save: jest.fn((report) =>
        Promise.resolve({ id: 'report-uuid-1', ...report }),
      ),
      find: jest.fn(),
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<LegacyImportIntegrityReport>>;

    receiptRepo = {
      create: jest.fn((plain) => plain as LegacyOnboardingMigrationReceipt),
      save: jest.fn((receipt) =>
        Promise.resolve({ id: 'receipt-uuid-1', ...receipt }),
      ),
    } as unknown as jest.Mocked<Repository<LegacyOnboardingMigrationReceipt>>;

    dataSource = {
      query: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<DataSource>;

    sessionRepo = {
      findOne: jest.fn(),
      save: jest.fn((session) => Promise.resolve(session)),
    } as unknown as jest.Mocked<Repository<OnboardingSession>>;

    service = new LegacyImportIntegrityReportService(
      stagingRepo,
      productRepo,
      reportRepo,
      receiptRepo,
      dataSource,
      sessionRepo,
    );
  });

  it('returns CLEAN report when no legacy imports with direct stock/cost writes exist', async () => {
    stagingRepo.find.mockResolvedValue([]);
    productRepo.find.mockResolvedValue([]);

    const report = await service.generateIntegrityReport(tenantId);

    expect(report.status).toBe(LegacyImportIntegrityStatus.CLEAN);
    expect(report.observed_direct_stock_or_cost_writes).toHaveLength(0);
    expect(report.legacy_import_refs).toHaveLength(0);
    expect(reportRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: LegacyImportIntegrityStatus.CLEAN,
      }),
    );
    expect(receiptRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        receipt_type: 'LEGACY_IMPORT_INTEGRITY_SCAN',
        decision: 'CLEAN',
      }),
    );
  });

  it('detects unbacked direct stock/cost writes from legacy committed imports and marks REVIEW_REQUIRED (AC-24, ONB1.4H)', async () => {
    const legacyStagedRow: ImportStaging = {
      id: 'staged-1',
      tenant_id: tenantId,
      token_sesion_importacion: 'session-legacy-1',
      raw_nombre: 'Producto Legacy',
      raw_sku: null,
      raw_precio_venta: '100',
      raw_costo_insumo: '60',
      raw_categoria: 'General',
      raw_porcentaje_iva: '15',
      raw_uom: 'UN',
      raw_stock_inicial: '50',
      parsed_nombre: 'Producto Legacy',
      parsed_sku: null,
      parsed_precio_venta: 100,
      parsed_costo_insumo: 60,
      parsed_categoria: 'General',
      parsed_porcentaje_iva: 15,
      parsed_uom: 'UN',
      parsed_stock_inicial: 50,
      estado_fila: ImportStagingStatus.COMMITTED,
      mensaje_error_detalle: null,
      row_ordinal: 1,
      matched_by: null,
      target_product_id: null,
      fields_to_change: null,
      conflict_reason: null,
      unsupported_fields: null,
      unknown_columns: null,
      created_at: new Date('2026-01-01'),
      updated_at: new Date('2026-01-01'),
    };

    const existingProduct: Product = {
      id: 'prod-legacy-1',
      tenant_id: tenantId,
      tenant: null,
      warehouse_id: 'wh-1',
      name: 'Producto Legacy',
      uom: 'UN',
      product_type: 'SIMPLE' as never,
      category_code: null,
      sellPrice: 100,
      averageCost: 60,
      stock: 50,
      is_perishable: false,
      is_active: true,
      tax_rate: 0.15,
      is_tax_exempt: false,
      created_at: new Date('2026-01-01'),
      updated_at: new Date('2026-01-01'),
    };

    stagingRepo.find.mockResolvedValue([legacyStagedRow]);
    productRepo.find.mockResolvedValue([existingProduct]);
    // Kardex query returns 0 movements
    (dataSource.query as jest.Mock).mockResolvedValue([]);

    const report = await service.generateIntegrityReport(tenantId);

    expect(report.status).toBe(LegacyImportIntegrityStatus.REVIEW_REQUIRED);
    expect(report.observed_direct_stock_or_cost_writes).toHaveLength(1);
    expect(report.observed_direct_stock_or_cost_writes[0]).toMatchObject({
      productId: 'prod-legacy-1',
      productName: 'Producto Legacy',
      productStock: 50,
      kardexStock: 0,
      discrepancy: 50,
      directCostObserved: 60,
      sourceImportSession: 'session-legacy-1',
    });
    expect(report.kardex_evidence_present).toBe(false);

    // Verifies Onboarding does NOT execute an ad-hoc UPDATE to rewrite stock/cost
    expect(dataSource.query).not.toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE products SET/i),
    );
  });

  it('expires uncommitted legacy staging sessions with incompatible stock/cost fields and issues receipts (ONB1.4H)', async () => {
    const pendingLegacyRow: ImportStaging = {
      id: 'staged-pending-1',
      tenant_id: tenantId,
      token_sesion_importacion: 'session-incompatible-1',
      raw_nombre: 'Producto Incompatible',
      raw_sku: null,
      raw_precio_venta: '100',
      raw_costo_insumo: '50',
      raw_categoria: 'General',
      raw_porcentaje_iva: '15',
      raw_uom: 'UN',
      raw_stock_inicial: '25',
      parsed_nombre: 'Producto Incompatible',
      parsed_sku: null,
      parsed_precio_venta: 100,
      parsed_costo_insumo: 50,
      parsed_categoria: 'General',
      parsed_porcentaje_iva: 15,
      parsed_uom: 'UN',
      parsed_stock_inicial: 25,
      estado_fila: ImportStagingStatus.PENDIENTE,
      mensaje_error_detalle: null,
      row_ordinal: 1,
      matched_by: null,
      target_product_id: null,
      fields_to_change: null,
      conflict_reason: null,
      unsupported_fields: null,
      unknown_columns: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    stagingRepo.find.mockResolvedValue([pendingLegacyRow]);

    const result = await service.expireIncompatibleLegacyStaging(tenantId);

    expect(result.expiredSessions).toContain('session-incompatible-1');
    expect(result.expiredRowsCount).toBe(1);
    expect(pendingLegacyRow.estado_fila).toBe(ImportStagingStatus.ERROR);
    expect(pendingLegacyRow.mensaje_error_detalle).toContain(
      'Legacy staging incompatible',
    );
    expect(stagingRepo.save).toHaveBeenCalled();
    expect(receiptRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        receipt_type: 'LEGACY_STAGING_EXPIRY',
        decision: 'EXPIRED_REJECTED',
      }),
    );
  });

  it('ONB1.10A: remediates report strictly via inventory command reference and issues REMEDIATED receipt (AC-39, Rule 72)', async () => {
    const existingReport = {
      id: 'report-disc-1',
      tenant_id: tenantId,
      legacy_import_refs: ['session-legacy-1'],
      affected_product_refs: ['prod-legacy-1'],
      observed_direct_stock_or_cost_writes: [
        {
          productId: 'prod-legacy-1',
          productName: 'Producto Legacy',
          productStock: 50,
          kardexStock: 0,
          discrepancy: 50,
          directCostObserved: 60,
        },
      ],
      kardex_evidence_present: false,
      status: LegacyImportIntegrityStatus.REVIEW_REQUIRED,
      reviewed_by: null,
      remediation_refs: [],
      created_at: new Date(),
    } as LegacyImportIntegrityReport;

    reportRepo.findOne.mockResolvedValue(existingReport);

    const remediated = await service.remediateReportWithInventoryCommand(
      tenantId,
      'report-disc-1',
      'INV_ADJUSTMENT:cmd-kardex-adj-999',
      'user-inventory-auditor',
    );

    expect(remediated.status).toBe(LegacyImportIntegrityStatus.REMEDIATED);
    expect(remediated.reviewed_by).toBe('user-inventory-auditor');
    expect(remediated.remediation_refs).toContain(
      'INV_ADJUSTMENT:cmd-kardex-adj-999',
    );
    expect(reportRepo.save).toHaveBeenCalled();
    expect(receiptRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        receipt_type: 'LEGACY_IMPORT_REMEDIATION',
        target_entity_type: 'LEGACY_IMPORT_INTEGRITY_REPORT',
        target_entity_id: 'report-disc-1',
        decision: LegacyMigrationDecision.REMEDIATED,
        executed_by: 'user-inventory-auditor',
      }),
    );
  });

  it('ONB1.10A: accepts report as-is with audited rationale and issues ACCEPTED_AS_IS receipt (Rule 72)', async () => {
    const existingReport = {
      id: 'report-disc-2',
      tenant_id: tenantId,
      legacy_import_refs: ['session-legacy-2'],
      affected_product_refs: ['prod-legacy-2'],
      observed_direct_stock_or_cost_writes: [],
      kardex_evidence_present: false,
      status: LegacyImportIntegrityStatus.REVIEW_REQUIRED,
      reviewed_by: null,
      remediation_refs: [],
      created_at: new Date(),
    } as LegacyImportIntegrityReport;

    reportRepo.findOne.mockResolvedValue(existingReport);

    const accepted = await service.acceptReportAsIs(
      tenantId,
      'report-disc-2',
      'Discrepancy verified as non-material promotional samples; accepted by finance',
      'user-finance-director',
    );

    expect(accepted.status).toBe(LegacyImportIntegrityStatus.ACCEPTED_AS_IS);
    expect(accepted.reviewed_by).toBe('user-finance-director');
    expect(receiptRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        receipt_type: 'LEGACY_IMPORT_ACCEPT_AS_IS',
        decision: LegacyMigrationDecision.ACCEPTED_AS_IS,
        executed_by: 'user-finance-director',
      }),
    );
  });

  it('ONB1.10A: formally reconciles legacy baseline tenant (measurementEligible=false) without fabricating synthetic TTFSS (Rule 73, AC-56)', async () => {
    const legacySession = {
      id: 'session-legacy-tenant-1',
      tenantId,
      lifecycleState: OnboardingLifecycleState.ACTIVATED,
      legacyBaseline: true,
      measurementEligible: false,
      onboardingStartedAt: null,
      firstSuccessfulSaleAt: null, // Critical: must NOT be fabricated!
      saleReadyFirstAt: null,
    } as OnboardingSession;

    sessionRepo.findOne.mockResolvedValue(legacySession);

    const receipt = await service.reconcileLegacyBaselineSession(
      tenantId,
      'user-compliance-auditor',
    );

    expect(receipt.receipt_type).toBe('LEGACY_BASELINE_RECONCILIATION');
    expect(receipt.decision).toBe(
      LegacyMigrationDecision.LEGACY_BASELINE_CLOSED,
    );
    expect(receipt.evidence_json).toMatchObject({
      legacyBaseline: true,
      measurementEligible: false,
      firstSuccessfulSaleAt: null,
    });
    expect(legacySession.firstSuccessfulSaleAt).toBeNull(); // Still null, no fake TTFSS!
  });
});
