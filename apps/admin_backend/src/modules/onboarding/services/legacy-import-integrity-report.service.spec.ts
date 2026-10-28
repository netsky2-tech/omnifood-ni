import { Repository, DataSource, EntityManager } from 'typeorm';
import { LegacyImportIntegrityReportService } from './legacy-import-integrity-report.service';
import {
  TENANT_CONTEXT_SET_CONFIG_SQL,
  TenantContextRequiredError,
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
  let mockManager: jest.Mocked<EntityManager>;
  let dataSource: jest.Mocked<DataSource>;

  const tenantId = 'tenant-uuid-1';

  beforeEach(() => {
    // The pooled constructor repositories stay part of the DI surface (S4a
    // precedent) but must NEVER be used for protected data once T2.S4d binds
    // the service: every protected access goes through the transaction
    // manager. The binding tests below assert that negatively.
    stagingRepo = {
      find: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<ImportStaging>>;

    productRepo = {
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<Product>>;

    reportRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<LegacyImportIntegrityReport>>;

    receiptRepo = {
      create: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<LegacyOnboardingMigrationReceipt>>;

    mockManager = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(
        (_entityClass: unknown, plain: unknown) => plain as object,
      ),
      save: jest.fn((_entityClass: unknown, entities: unknown) =>
        Promise.resolve(entities),
      ),
      // The production binding SQL: runInTenantTransaction issues exactly
      // this parameterised set_config on the transaction's manager before
      // any protected access. The kardex SELECT is issued on the SAME
      // manager — never on a nested independent transaction.
      query: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<EntityManager>;

    dataSource = {
      transaction: jest.fn((cb: (mgr: EntityManager) => Promise<unknown>) =>
        cb(mockManager),
      ),
      query: jest.fn(),
    } as unknown as jest.Mocked<DataSource>;

    sessionRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
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

  /** Committed legacy staging row carrying direct stock AND cost. */
  function makeCommittedLegacyRow(): ImportStaging {
    return {
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
  }

  function makeExistingProduct(stock = 50): Product {
    return {
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
      stock,
      is_perishable: false,
      is_active: true,
      tax_rate: 0.15,
      is_tax_exempt: false,
      created_at: new Date('2026-01-01'),
      updated_at: new Date('2026-01-01'),
    };
  }

  describe('generateIntegrityReport (Parsing, Aggregation & Kardex Evidence)', () => {
    it('returns CLEAN report when no legacy imports with direct stock/cost writes exist', async () => {
      mockManager.find.mockResolvedValue([]);

      const report = await service.generateIntegrityReport(tenantId);

      expect(report.status).toBe(LegacyImportIntegrityStatus.CLEAN);
      expect(report.observed_direct_stock_or_cost_writes).toHaveLength(0);
      expect(report.legacy_import_refs).toHaveLength(0);
      expect(mockManager.create).toHaveBeenCalledWith(
        LegacyImportIntegrityReport,
        expect.objectContaining({
          status: LegacyImportIntegrityStatus.CLEAN,
          reviewed_by: null,
        }),
      );
      expect(mockManager.create).toHaveBeenCalledWith(
        LegacyOnboardingMigrationReceipt,
        expect.objectContaining({
          receipt_type: 'LEGACY_IMPORT_INTEGRITY_SCAN',
          decision: 'CLEAN',
        }),
      );
    });

    it('detects unbacked direct stock/cost writes from legacy committed imports and marks REVIEW_REQUIRED (AC-24, ONB1.4H)', async () => {
      mockManager.find.mockImplementation(async (entityClass: unknown) => {
        if (entityClass === ImportStaging) {
          return Promise.resolve([makeCommittedLegacyRow()]);
        }
        if (entityClass === Product) {
          return Promise.resolve([makeExistingProduct()]);
        }
        return Promise.resolve([]);
      });
      // Kardex query returns 0 movements
      mockManager.query.mockImplementation(async (sql: string) =>
        sql.includes('inventory_kardex') ? [{ total: 0 }] : [],
      );

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
      expect(report.reviewed_by).toBeNull();

      // Verifies Onboarding does NOT execute an ad-hoc UPDATE to rewrite
      // stock/cost on the bound manager either.
      expect(mockManager.query).not.toHaveBeenCalledWith(
        expect.stringMatching(/UPDATE products SET/i),
        expect.anything(),
      );
    });

    it('propagates the poisoned transaction when the kardex read fails hard inside the shared transaction (fail-closed, issue #358 lesson)', async () => {
      // Since S4d the kardex aggregate runs on the CALLER'S transaction
      // manager. A hard SQL error there aborts the shared transaction: the
      // service's catch still logs the cause, but it can no longer recover —
      // the very next statement on the same manager fails with PostgreSQL
      // 25P02 and the whole scan rolls back instead of degrading to a
      // silently wrong kardexStock-0 report.
      const warnSpy = jest
        .spyOn(service['logger'], 'warn')
        .mockImplementation(() => undefined);

      mockManager.find.mockImplementation(async (entityClass: unknown) => {
        if (entityClass === ImportStaging) {
          return Promise.resolve([makeCommittedLegacyRow()]);
        }
        if (entityClass === Product) {
          return Promise.resolve([makeExistingProduct()]);
        }
        return Promise.resolve([]);
      });
      mockManager.query.mockImplementation(async (sql: string) => {
        if (sql === TENANT_CONTEXT_SET_CONFIG_SQL) return undefined;
        throw new Error('permission denied for table inventory_kardex');
      });
      // The report INSERT is the next statement after the failed kardex read:
      // emulate PostgreSQL's aborted-transaction rejection honestly.
      (mockManager.save as unknown as jest.Mock).mockRejectedValue(
        new Error(
          'current transaction is aborted, commands ignored until end of transaction block',
        ),
      );

      // The service does NOT return a successful degraded report: the
      // poisoned transaction state propagates and the scan fails.
      await expect(service.generateIntegrityReport(tenantId)).rejects.toThrow(
        /current transaction is aborted/i,
      );

      // The JS catch remains and must not be silenced: the kardex failure is
      // logged before the transaction state takes over.
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('permission denied for table inventory_kardex'),
      );
    });
  });

  describe('expireIncompatibleLegacyStaging (Lifecycle Transitions)', () => {
    it('expires uncommitted legacy staging sessions with incompatible stock/cost fields and issues receipts (ONB1.4H)', async () => {
      const pendingLegacyRow: ImportStaging = {
        ...makeCommittedLegacyRow(),
        id: 'staged-pending-1',
        token_sesion_importacion: 'session-incompatible-1',
        raw_nombre: 'Producto Incompatible',
        parsed_nombre: 'Producto Incompatible',
        estado_fila: ImportStagingStatus.PENDIENTE,
      };

      mockManager.find.mockResolvedValue([pendingLegacyRow]);

      const result = await service.expireIncompatibleLegacyStaging(tenantId);

      expect(result.expiredSessions).toContain('session-incompatible-1');
      expect(result.expiredRowsCount).toBe(1);
      expect(pendingLegacyRow.estado_fila).toBe(ImportStagingStatus.ERROR);
      expect(pendingLegacyRow.mensaje_error_detalle).toContain(
        'Legacy staging incompatible',
      );
      expect(mockManager.save).toHaveBeenCalledWith(
        ImportStaging,
        expect.arrayContaining([pendingLegacyRow]),
      );
      expect(mockManager.create).toHaveBeenCalledWith(
        LegacyOnboardingMigrationReceipt,
        expect.objectContaining({
          receipt_type: 'LEGACY_STAGING_EXPIRY',
          decision: 'EXPIRED_REJECTED',
          target_entity_id: 'session-incompatible-1',
        }),
      );
    });

    it('returns a zero scan without any write when no pending rows exist', async () => {
      mockManager.find.mockResolvedValue([]);

      const result = await service.expireIncompatibleLegacyStaging(tenantId);

      expect(result).toEqual({ expiredSessions: [], expiredRowsCount: 0 });
      expect(mockManager.save).not.toHaveBeenCalled();
    });
  });

  describe('remediateReportWithInventoryCommand & acceptReportAsIs (Rule 72)', () => {
    function makeReviewRequiredReport(id: string): LegacyImportIntegrityReport {
      return {
        id,
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
      };
    }

    it('ONB1.10A: remediates report strictly via inventory command reference and issues REMEDIATED receipt (AC-39, Rule 72)', async () => {
      const existingReport = makeReviewRequiredReport('report-disc-1');
      mockManager.findOne.mockResolvedValue(existingReport);

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
      expect(mockManager.findOne).toHaveBeenCalledWith(
        LegacyImportIntegrityReport,
        expect.objectContaining({
          where: { id: 'report-disc-1', tenant_id: tenantId },
        }),
      );
      expect(mockManager.save).toHaveBeenCalledWith(
        LegacyImportIntegrityReport,
        existingReport,
      );
      expect(mockManager.create).toHaveBeenCalledWith(
        LegacyOnboardingMigrationReceipt,
        expect.objectContaining({
          receipt_type: 'LEGACY_IMPORT_REMEDIATION',
          target_entity_type: 'LEGACY_IMPORT_INTEGRITY_REPORT',
          target_entity_id: 'report-disc-1',
          decision: LegacyMigrationDecision.REMEDIATED,
          executed_by: 'user-inventory-auditor',
        }),
      );
    });

    it('ONB1.10A: short-circuits an already-REMEDIATED report without writing a second receipt', async () => {
      const remediatedReport = {
        ...makeReviewRequiredReport('report-disc-1'),
        status: LegacyImportIntegrityStatus.REMEDIATED,
        remediation_refs: ['INV_ADJUSTMENT:cmd-kardex-adj-999'],
      } as LegacyImportIntegrityReport;
      mockManager.findOne.mockResolvedValue(remediatedReport);

      const result = await service.remediateReportWithInventoryCommand(
        tenantId,
        'report-disc-1',
        'INV_ADJUSTMENT:cmd-kardex-adj-000',
      );

      expect(result.status).toBe(LegacyImportIntegrityStatus.REMEDIATED);
      expect(result.remediation_refs).toEqual([
        'INV_ADJUSTMENT:cmd-kardex-adj-999',
      ]);
      expect(mockManager.save).not.toHaveBeenCalled();
      expect(mockManager.create).not.toHaveBeenCalledWith(
        LegacyOnboardingMigrationReceipt,
        expect.objectContaining({
          receipt_type: 'LEGACY_IMPORT_REMEDIATION',
        }),
      );
    });

    it('ONB1.10A: rejects remediation of an unknown report with the documented NotFoundException', async () => {
      mockManager.findOne.mockResolvedValue(null);

      await expect(
        service.remediateReportWithInventoryCommand(
          tenantId,
          'report-missing',
          'INV_ADJUSTMENT:ref',
        ),
      ).rejects.toThrow(
        "LegacyImportIntegrityReport 'report-missing' not found for tenant 'tenant-uuid-1'",
      );
      expect(mockManager.save).not.toHaveBeenCalled();
    });

    it('ONB1.10A: accepts report as-is with audited rationale and issues ACCEPTED_AS_IS receipt (Rule 72)', async () => {
      const existingReport = makeReviewRequiredReport('report-disc-2');
      mockManager.findOne.mockResolvedValue(existingReport);

      const accepted = await service.acceptReportAsIs(
        tenantId,
        'report-disc-2',
        'Discrepancy verified as non-material promotional samples; accepted by finance',
        'user-finance-director',
      );

      expect(accepted.status).toBe(LegacyImportIntegrityStatus.ACCEPTED_AS_IS);
      expect(accepted.reviewed_by).toBe('user-finance-director');
      expect(mockManager.create).toHaveBeenCalledWith(
        LegacyOnboardingMigrationReceipt,
        expect.objectContaining({
          receipt_type: 'LEGACY_IMPORT_ACCEPT_AS_IS',
          decision: LegacyMigrationDecision.ACCEPTED_AS_IS,
          executed_by: 'user-finance-director',
        }),
      );
    });
  });

  describe('reconcileLegacyBaselineSession (Rule 73, AC-56)', () => {
    it('formally reconciles legacy baseline tenant (measurementEligible=false) without fabricating synthetic TTFSS', async () => {
      const legacySession = {
        id: 'session-legacy-tenant-1',
        tenantId,
        lifecycleState: OnboardingLifecycleState.ACTIVATED,
        legacyBaseline: true,
        measurementEligible: false,
        onboardingStartedAt: null,
        firstSuccessfulSaleAt: null, // Critical: must NOT be fabricated!
        saleReadyFirstAt: null,
      } as unknown as OnboardingSession;

      mockManager.findOne.mockResolvedValue(legacySession);

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
      expect(mockManager.save).toHaveBeenCalledWith(
        OnboardingSession,
        legacySession,
      );
    });

    it('rejects when the optional session repository wiring is absent, before any SQL', async () => {
      const bareService = new LegacyImportIntegrityReportService(
        stagingRepo,
        productRepo,
        reportRepo,
        receiptRepo,
        dataSource,
      );

      await expect(
        bareService.reconcileLegacyBaselineSession(tenantId),
      ).rejects.toThrow('Session repository unavailable');
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(mockManager.findOne).not.toHaveBeenCalled();
    });

    it('rejects with the documented NotFoundException when the tenant has no onboarding session', async () => {
      mockManager.findOne.mockResolvedValue(null);

      await expect(
        service.reconcileLegacyBaselineSession(tenantId),
      ).rejects.toThrow(
        "Onboarding session not found for tenant 'tenant-uuid-1'",
      );
      expect(mockManager.save).not.toHaveBeenCalled();
    });
  });

  describe('tenant binding (T2.S4d): order, scoping, transactions & failure propagation', () => {
    /**
     * Shared probe: records the exact order of binding SQL versus protected
     * access on the transaction manager.
     */
    function recordAccessOrder(): string[] {
      const order: string[] = [];
      mockManager.query.mockImplementation(async (sql: string) => {
        if (sql === TENANT_CONTEXT_SET_CONFIG_SQL) order.push('bind');
        else order.push('kardex-query');
        return [];
      });
      mockManager.find.mockImplementation(async () => {
        order.push('find');
        return [];
      });
      mockManager.findOne.mockImplementation(async () => {
        order.push('findOne');
        return null;
      });
      mockManager.create.mockImplementation(
        (_c: unknown, plain: unknown) => plain as never,
      );
      mockManager.save.mockImplementation(async (_c: unknown, e: unknown) => {
        order.push('save');
        return e;
      });
      return order;
    }

    function stubManagerLookups(): void {
      mockManager.find.mockResolvedValue([]);
      mockManager.findOne.mockImplementation(async (entityClass: unknown) =>
        entityClass === OnboardingSession
          ? Promise.resolve({
              id: 'session-bind-1',
              tenantId,
              legacyBaseline: false,
              measurementEligible: true,
              firstSuccessfulSaleAt: null,
            } as unknown as OnboardingSession)
          : Promise.resolve({
              id: 'report-bind-1',
              tenant_id: tenantId,
              status: LegacyImportIntegrityStatus.REVIEW_REQUIRED,
              remediation_refs: [],
            } as unknown as LegacyImportIntegrityReport),
      );
    }

    it('binds app.tenant_id on the transaction manager BEFORE the first protected access in generateIntegrityReport', async () => {
      const order = recordAccessOrder();

      await service.generateIntegrityReport(tenantId);

      expect(order[0]).toBe('bind');
      expect(mockManager.query).toHaveBeenCalledWith(
        TENANT_CONTEXT_SET_CONFIG_SQL,
        [tenantId],
      );
    });

    it('binds exactly once per public method and opens exactly one transaction', async () => {
      stubManagerLookups();
      await service.generateIntegrityReport(tenantId);
      await service.expireIncompatibleLegacyStaging(tenantId);
      await service.remediateReportWithInventoryCommand(
        tenantId,
        'report-x',
        'ref',
      );
      await service.acceptReportAsIs(
        tenantId,
        'report-x',
        'a substantive rationale',
      );
      await service.reconcileLegacyBaselineSession(tenantId);

      // Five public calls, five transactions, five single bindings.
      expect(dataSource.transaction).toHaveBeenCalledTimes(5);
      expect(mockManager.query).toHaveBeenCalledTimes(5);
      mockManager.query.mock.calls.forEach((call) =>
        expect(call).toEqual([TENANT_CONTEXT_SET_CONFIG_SQL, [tenantId]]),
      );
    });

    it('never uses the pooled repositories for protected data in any public method', async () => {
      stubManagerLookups();
      await service.generateIntegrityReport(tenantId);
      await service.expireIncompatibleLegacyStaging(tenantId);
      await service.remediateReportWithInventoryCommand(
        tenantId,
        'report-x',
        'ref',
      );
      await service.acceptReportAsIs(
        tenantId,
        'report-x',
        'a substantive rationale',
      );
      await service.reconcileLegacyBaselineSession(tenantId);

      expect(stagingRepo.find).not.toHaveBeenCalled();
      expect(stagingRepo.save).not.toHaveBeenCalled();
      expect(productRepo.find).not.toHaveBeenCalled();
      expect(reportRepo.findOne).not.toHaveBeenCalled();
      expect(reportRepo.create).not.toHaveBeenCalled();
      expect(reportRepo.save).not.toHaveBeenCalled();
      expect(receiptRepo.create).not.toHaveBeenCalled();
      expect(receiptRepo.save).not.toHaveBeenCalled();
      expect(sessionRepo.findOne).not.toHaveBeenCalled();
      expect(sessionRepo.save).not.toHaveBeenCalled();
    });

    it('reads inventory_kardex through the CALLER-PROVIDED bound manager, never through a nested independent transaction', async () => {
      mockManager.find.mockImplementation(async (entityClass: unknown) => {
        if (entityClass === ImportStaging) {
          return Promise.resolve([makeCommittedLegacyRow()]);
        }
        if (entityClass === Product) {
          return Promise.resolve([makeExistingProduct()]);
        }
        return Promise.resolve([]);
      });
      mockManager.query.mockImplementation(async (sql: string) =>
        sql.includes('inventory_kardex') ? [{ total: '30' }] : [],
      );

      const report = await service.generateIntegrityReport(tenantId);

      // Exactly ONE transaction: the tenant-bound one. kardexStockFor did not
      // open a second, independent transaction of its own.
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      // The kardex aggregate ran on the SAME manager that holds the binding.
      expect(mockManager.query).toHaveBeenCalledWith(
        expect.stringContaining('inventory_kardex'),
        [tenantId, 'prod-legacy-1'],
      );
      expect(report.observed_direct_stock_or_cost_writes[0]).toMatchObject({
        productStock: 50,
        kardexStock: 30,
        discrepancy: 20,
      });
      expect(report.kardex_evidence_present).toBe(true);
    });

    it('keeps report+receipt writes inside the SAME transaction (atomicity by construction)', async () => {
      mockManager.find.mockResolvedValue([]);
      mockManager.create.mockImplementation(
        (_c: unknown, plain: unknown) => plain as never,
      );
      mockManager.save.mockResolvedValue({ id: 'report-uuid-1' });

      await service.generateIntegrityReport(tenantId);

      // Both writes are manager-scoped saves inside the one bound transaction.
      expect(mockManager.save).toHaveBeenCalledWith(
        LegacyImportIntegrityReport,
        expect.objectContaining({ tenant_id: tenantId }),
      );
      expect(mockManager.save).toHaveBeenCalledWith(
        LegacyOnboardingMigrationReceipt,
        expect.objectContaining({
          receipt_type: 'LEGACY_IMPORT_INTEGRITY_SCAN',
        }),
      );
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });

    it('propagates a receipt-write failure out of the transaction (rollback boundary in production)', async () => {
      mockManager.find.mockResolvedValue([]);
      mockManager.save.mockImplementation(async (entityClass: unknown) =>
        entityClass === LegacyOnboardingMigrationReceipt
          ? Promise.reject(new Error('receipt insert denied'))
          : Promise.resolve({ id: 'report-uuid-1' }),
      );

      await expect(service.generateIntegrityReport(tenantId)).rejects.toThrow(
        'receipt insert denied',
      );
      // The failure happened inside the ONE bound transaction; production
      // rolls the report back with the receipt (proven positively in the DB
      // spec).
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });

    it('fails fast on a blank tenant with TenantContextRequiredError before any SQL in every public method', async () => {
      await expect(service.generateIntegrityReport('   ')).rejects.toThrow(
        TenantContextRequiredError,
      );
      await expect(
        service.expireIncompatibleLegacyStaging('   '),
      ).rejects.toThrow(TenantContextRequiredError);
      await expect(
        service.remediateReportWithInventoryCommand('   ', 'report-x', 'ref'),
      ).rejects.toThrow(TenantContextRequiredError);
      await expect(
        service.acceptReportAsIs('   ', 'report-x', 'a substantive rationale'),
      ).rejects.toThrow(TenantContextRequiredError);
      await expect(
        service.reconcileLegacyBaselineSession('   '),
      ).rejects.toThrow(TenantContextRequiredError);

      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(mockManager.query).not.toHaveBeenCalled();
      expect(mockManager.find).not.toHaveBeenCalled();
      expect(mockManager.findOne).not.toHaveBeenCalled();
      expect(mockManager.save).not.toHaveBeenCalled();
    });

    it('propagates a binding failure with zero protected writes', async () => {
      mockManager.query.mockRejectedValueOnce(
        new Error('set_config permission denied'),
      );

      await expect(service.generateIntegrityReport(tenantId)).rejects.toThrow(
        'set_config permission denied',
      );

      expect(mockManager.find).not.toHaveBeenCalled();
      expect(mockManager.findOne).not.toHaveBeenCalled();
      expect(mockManager.save).not.toHaveBeenCalled();
    });

    it('propagates a transaction-open failure with zero protected writes', async () => {
      (dataSource.transaction as unknown as jest.Mock).mockRejectedValueOnce(
        new Error('connection pool exhausted'),
      );

      await expect(
        service.expireIncompatibleLegacyStaging(tenantId),
      ).rejects.toThrow('connection pool exhausted');

      expect(mockManager.query).not.toHaveBeenCalled();
      expect(mockManager.find).not.toHaveBeenCalled();
      expect(mockManager.save).not.toHaveBeenCalled();
    });
  });
});
