import { Repository, DataSource } from 'typeorm';
import {
  LegacyImportIntegrityReportService,
  LegacyScanResult,
} from './legacy-import-integrity-report.service';
import {
  ImportStaging,
  ImportStagingStatus,
} from '../entities/import-staging.entity';
import { Product } from '../../inventory/entities/product.entity';
import {
  LegacyImportIntegrityReport,
  LegacyImportIntegrityStatus,
} from '../entities/legacy-import-integrity-report.entity';
import { LegacyOnboardingMigrationReceipt } from '../entities/legacy-migration-receipt.entity';

describe('LegacyImportIntegrityReportService (Unit & Triangulation / ONB1.4H)', () => {
  let service: LegacyImportIntegrityReportService;
  let stagingRepo: jest.Mocked<Repository<ImportStaging>>;
  let productRepo: jest.Mocked<Repository<Product>>;
  let reportRepo: jest.Mocked<Repository<LegacyImportIntegrityReport>>;
  let receiptRepo: jest.Mocked<Repository<LegacyOnboardingMigrationReceipt>>;
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

    service = new LegacyImportIntegrityReportService(
      stagingRepo,
      productRepo,
      reportRepo,
      receiptRepo,
      dataSource,
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
});
