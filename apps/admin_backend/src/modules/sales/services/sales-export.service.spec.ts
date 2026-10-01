import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../../core/database/tenant-transaction';
import { SalesExportService } from './sales-export.service';
import { FiscalSetupService } from '../../onboarding/services/fiscal-setup.service';
import { Invoice } from '../entities/invoice.entity';
import {
  CashShiftSession,
  CashShiftStatus,
} from '../entities/cash-shift.entity';
import {
  CashMovement,
  CashMovementType,
} from '../entities/cash-movement.entity';
import { InvoiceItem } from '../entities/invoice-item.entity';

describe('SalesExportService', () => {
  let service: SalesExportService;
  let mockInvoiceRepo: {
    find: jest.Mock;
  };
  let mockShiftRepo: {
    find: jest.Mock;
  };
  // G1 (issue #522 Finding 1): X-report cash-movement reads run through the
  // bound transaction manager; the pooled token only feeds DI and the
  // runtime-teeth tripwires below.
  let mockMovementRepo: {
    find: jest.Mock;
  };
  // B2e U3 (D-3): the export IVA labels derive from the tenant's effective
  // fiscal configuration through FiscalSetupService; the mock defaults to a
  // Regimen General tenant at 15% so the existing label assertions keep
  // proving the derived output while the Cuota Fija tests below prove the
  // regime actually governs the labels.
  let mockFiscalSetup: { getFiscalSetup: jest.Mock };
  // The tenant-bound transaction fake: the manager hands back the same
  // repository mocks the pooled tokens provide, so the existing behavior
  // assertions keep working unchanged while the guard test below proves the
  // binding itself with isolated instrumented fakes.
  let transactionalManager: {
    query: jest.Mock;
    getRepository: jest.Mock;
  };
  let transactionalDataSource: { transaction: jest.Mock };

  const tenantId = 'tenant-export-101';

  beforeEach(async () => {
    transactionalManager = {
      query: jest.fn(async () => []),
      getRepository: jest.fn((entity: unknown) =>
        entity === Invoice
          ? mockInvoiceRepo
          : entity === CashMovement
            ? mockMovementRepo
            : mockShiftRepo,
      ),
    };
    transactionalDataSource = {
      transaction: jest.fn(
        async (work: (manager: unknown) => Promise<unknown>) =>
          work(transactionalManager),
      ),
    };
    mockInvoiceRepo = {
      find: jest.fn(),
    };
    mockShiftRepo = {
      find: jest.fn(),
    };
    mockMovementRepo = {
      find: jest.fn(),
    };
    mockFiscalSetup = {
      getFiscalSetup: jest.fn().mockResolvedValue({
        regime: 'REGIMEN_GENERAL',
        taxRateIva: 0.15,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesExportService,
        {
          provide: getRepositoryToken(Invoice),
          useValue: mockInvoiceRepo,
        },
        {
          provide: getRepositoryToken(CashShiftSession),
          useValue: mockShiftRepo,
        },
        {
          provide: getRepositoryToken(CashMovement),
          useValue: mockMovementRepo,
        },
        { provide: DataSource, useValue: transactionalDataSource },
        {
          provide: FiscalSetupService,
          useValue: mockFiscalSetup,
        },
      ],
    }).compile();

    service = module.get<SalesExportService>(SalesExportService);
  });

  describe('exportSalesBook', () => {
    const mockInvoices: Partial<Invoice>[] = [
      {
        id: 'inv-1',
        tenant_id: tenantId,
        number: '001-001-01-00000001',
        type: 'regular',
        subtotal: 1000,
        totalTax: 150,
        total: 1150,
        totalUsd: 31.51,
        isCanceled: false,
        customerId: 'J0310000000000',
        created_at: new Date('2026-08-26T10:00:00.000Z'),
        items: [
          {
            id: 'item-1',
            productId: 'p-1',
            productName: 'Comida',
            quantity: 1,
            unitPrice: 1000,
            discount: 0,
            originalTaxRate: 0.15,
            appliedTaxRate: 0.15,
            taxAmount: 150,
            total: 1150,
          } as InvoiceItem,
        ],
      },
      {
        id: 'inv-2',
        tenant_id: tenantId,
        number: '001-001-01-00000002',
        type: 'regular',
        subtotal: 300,
        totalTax: 45,
        total: 345,
        totalUsd: 9.45,
        isCanceled: true,
        created_at: new Date('2026-08-26T11:00:00.000Z'),
        items: [],
      },
    ];

    it('should generate structured JSON and CSV for sales book register', async () => {
      mockInvoiceRepo.find.mockResolvedValue(mockInvoices);

      const jsonResult = await service.exportSalesBook(tenantId, {
        startDate: '2026-08-26',
        endDate: '2026-08-26',
        format: 'json',
      });

      expect(jsonResult.format).toBe('json');
      expect(jsonResult.filename).toContain('libro-ventas-dgi-2026-08-26.json');
      expect(jsonResult.data.totalRecords).toBe(2);
      expect(jsonResult.data.totalGrossNio).toBe(1150);
      expect(jsonResult.data.totalTaxNio).toBe(150);
      expect(jsonResult.data.records[0].documentType).toBe('FACTURA');
      expect(jsonResult.data.records[0].customerName).toBe('J0310000000000');
      expect(jsonResult.data.records[1].documentType).toBe('ANULADA');
      expect(jsonResult.data.records[1].status).toBe('ANULADA');

      const csvResult = await service.exportSalesBook(tenantId, {
        format: 'csv',
      });

      // B2e U3 (D-3): the IVA percentage in the header is derived from the
      // tenant's fiscal config (15% Regimen General in the default mock).
      expect(csvResult.content).toContain(
        '"Fecha","Numero Factura","Tipo Documento","Cliente","Subtotal Exento (NIO)","Subtotal Gravado 15% (NIO)","IVA 15% (NIO)","Descuento (NIO)","Total (NIO)","Total (USD)","Estado"',
      );
      expect(csvResult.content).toContain(
        '"2026-08-26","001-001-01-00000001","FACTURA","J0310000000000",0.00,1000.00,150.00,0.00,1150.00,31.51,"VALIDA"',
      );
      expect(csvResult.content).toContain(
        '"2026-08-26","001-001-01-00000002","ANULADA","CONSUMIDOR FINAL",0.00,300.00,45.00,0.00,345.00,9.45,"ANULADA"',
      );
    });

    // B2e U3 (D-3): the configured rate governs the label — with a 15%
    // Regimen General setup (the beforeEach default) the derived header is
    // 'IVA 15% (NIO)'; a different configured rate must flow through.
    it('derives the IVA CSV header from the fiscal config rate (D-3)', async () => {
      mockInvoiceRepo.find.mockResolvedValue([]);
      mockFiscalSetup.getFiscalSetup.mockResolvedValue({
        regime: 'REGIMEN_GENERAL',
        taxRateIva: 0.15,
      });

      const csvResult = await service.exportSalesBook(tenantId, {
        format: 'csv',
      });

      expect(csvResult.content).toContain('"IVA 15% (NIO)"');
      expect(csvResult.content).toContain('"Subtotal Gravado 15% (NIO)"');
    });

    // B2e U3 (D-3): a Cuota Fija sales book collects no IVA, so its headers
    // must never carry a percentage — and never the fabricated 'IVA 15%'.
    it('omits any IVA percentage for a Cuota Fija sales book (D-3)', async () => {
      mockInvoiceRepo.find.mockResolvedValue(mockInvoices);
      mockFiscalSetup.getFiscalSetup.mockResolvedValue({
        regime: 'CUOTA_FIJA',
        taxRateIva: 0.0,
      });

      const csvResult = await service.exportSalesBook(tenantId, {
        startDate: '2026-08-26',
        endDate: '2026-08-26',
        format: 'csv',
      });

      expect(csvResult.content).not.toContain('15%');
      expect(csvResult.content).toContain('"IVA (NIO)"');
      expect(csvResult.content).toContain('"Subtotal Gravado (NIO)"');

      const xlsxResult = await service.exportSalesBook(tenantId, {
        startDate: '2026-08-26',
        endDate: '2026-08-26',
        format: 'xlsx',
      });

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(xlsxResult.buffer as unknown as ExcelJS.Buffer);
      const headerValues = workbook
        .getWorksheet('Libro de Ventas DGI')
        .getRow(1).values as unknown[];
      const headers = headerValues.slice(1).map(String);
      expect(headers).toContain('Gravado (NIO)');
      expect(headers).toContain('IVA (NIO)');
      expect(headers.join(',')).not.toContain('15%');
    });

    // B2e U3 (D-3): fail closed — if the fiscal setup cannot be read, the
    // labels degrade to plain 'IVA' / 'Gravado', never to a hardcoded 15%.
    it('falls back to plain IVA labels when the fiscal setup cannot be read (D-3)', async () => {
      mockInvoiceRepo.find.mockResolvedValue([]);
      mockFiscalSetup.getFiscalSetup.mockRejectedValue(
        new Error('fiscal setup unavailable'),
      );

      const csvResult = await service.exportSalesBook(tenantId, {
        format: 'csv',
      });

      expect(csvResult.content).not.toContain('15%');
      expect(csvResult.content).toContain('"IVA (NIO)"');
      expect(csvResult.content).toContain('"Subtotal Gravado (NIO)"');
    });

    it('should generate valid XLSX binary buffer for sales book', async () => {
      mockInvoiceRepo.find.mockResolvedValue(mockInvoices);

      const xlsxResult = await service.exportSalesBook(tenantId, {
        startDate: '2026-08-26',
        endDate: '2026-08-26',
        format: 'xlsx',
      });

      expect(xlsxResult.format).toBe('xlsx');
      expect(xlsxResult.filename).toContain('libro-ventas-dgi-2026-08-26.xlsx');
      expect(xlsxResult.contentType).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(xlsxResult.buffer).toBeDefined();
      expect(xlsxResult.buffer.length).toBeGreaterThan(100);
    });

    it('should generate valid PDF binary buffer for sales book', async () => {
      mockInvoiceRepo.find.mockResolvedValue(mockInvoices);

      const pdfResult = await service.exportSalesBook(tenantId, {
        startDate: '2026-08-26',
        endDate: '2026-08-26',
        format: 'pdf',
      });

      expect(pdfResult.format).toBe('pdf');
      expect(pdfResult.filename).toContain('libro-ventas-dgi-2026-08-26.pdf');
      expect(pdfResult.contentType).toBe('application/pdf');
      expect(pdfResult.buffer).toBeDefined();
      expect(pdfResult.buffer.length).toBeGreaterThan(100);
    });
  });

  describe('exportZReports', () => {
    const mockShifts: Partial<CashShiftSession>[] = [
      {
        id: 'shift-1',
        tenant_id: tenantId,
        terminal_id: 'POS-01',
        cashier_id: 'user-c1',
        cashier_name: 'Carlos Cajero',
        opened_at: new Date('2026-08-26T08:00:00.000Z'),
        closed_at: new Date('2026-08-26T17:00:00.000Z'),
        status: CashShiftStatus.CLOSED,
        initial_float_nio: 1000,
        initial_float_usd: 50,
        expected_cash_nio: 6500,
        expected_cash_usd: 120,
        final_counted_nio: 6500,
        final_counted_usd: 120,
        difference_nio: 0,
        difference_usd: 0,
        z_report_sequence: 14,
      },
    ];

    it('should generate structured JSON and CSV for Z-cuts summary', async () => {
      mockShiftRepo.find.mockResolvedValue(mockShifts);

      const result = await service.exportZReports(tenantId, {
        startDate: '2026-08-26',
        endDate: '2026-08-26',
        format: 'json',
      });

      expect(result.data.totalRecords).toBe(1);
      expect(result.data.records[0].terminalId).toBe('POS-01');
      expect(result.data.records[0].zSequence).toBe(14);
      expect(result.data.records[0].cashierName).toBe('Carlos Cajero');
      expect(result.data.records[0].differenceNio).toBe(0);

      const csvResult = await service.exportZReports(tenantId, {
        format: 'csv',
      });

      expect(csvResult.content).toContain(
        '"ID Turno","Fecha Apertura","Fecha Cierre","Terminal","Secuencia Z","Cajero","Fondo Inicial (NIO)","Fondo Inicial (USD)","Esperado (NIO)","Esperado (USD)","Contado (NIO)","Contado (USD)","Diferencia (NIO)","Diferencia (USD)","Estado"',
      );
      expect(csvResult.content).toContain(
        '"shift-1","2026-08-26T08:00:00.000Z","2026-08-26T17:00:00.000Z","POS-01",14,"Carlos Cajero",1000.00,50.00,6500.00,120.00,6500.00,120.00,0.00,0.00,"CLOSED"',
      );
    });

    it('should generate valid XLSX binary buffer for Z-cuts', async () => {
      mockShiftRepo.find.mockResolvedValue(mockShifts);

      const xlsxResult = await service.exportZReports(tenantId, {
        format: 'xlsx',
      });

      expect(xlsxResult.format).toBe('xlsx');
      expect(xlsxResult.filename).toContain('resumen-cortes-z-');
      expect(xlsxResult.contentType).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(xlsxResult.buffer).toBeDefined();
      expect(xlsxResult.buffer.length).toBeGreaterThan(100);
    });

    it('should generate valid PDF binary buffer for Z-cuts', async () => {
      mockShiftRepo.find.mockResolvedValue(mockShifts);

      const pdfResult = await service.exportZReports(tenantId, {
        format: 'pdf',
      });

      expect(pdfResult.format).toBe('pdf');
      expect(pdfResult.filename).toContain('resumen-cortes-z-');
      expect(pdfResult.contentType).toBe('application/pdf');
      expect(pdfResult.buffer).toBeDefined();
      expect(pdfResult.buffer.length).toBeGreaterThan(100);
    });
  });

  // Issue #512 slice 5: the cash_shift_sessions table is now tenant-RLS
  // protected, so the Z-report export read must run inside a tenant-bound
  // transaction. RUNTIME teeth: the pooled shift repository stands as a
  // tripwire; a reverted access lands on it and fails the "never called"
  // assertion at runtime, not at compile time.
  describe('tenant transaction binding', () => {
    it('binds the cash shift export read through the tenant transaction (issue #512 slice 5)', async () => {
      const pooledShift = { find: jest.fn() };
      const boundShift = {
        find: jest.fn().mockResolvedValue([
          {
            id: 'shift-1',
            tenant_id: tenantId,
            terminal_id: 'POS-01',
            cashier_name: 'Carlos Cajero',
            opened_at: new Date('2026-08-26T08:00:00.000Z'),
            closed_at: new Date('2026-08-26T17:00:00.000Z'),
            status: CashShiftStatus.CLOSED,
            initial_float_nio: 1000,
            initial_float_usd: 50,
            expected_cash_nio: 6500,
            expected_cash_usd: 120,
            final_counted_nio: 6500,
            final_counted_usd: 120,
            difference_nio: 0,
            difference_usd: 0,
            z_report_sequence: 14,
          },
        ]),
      };

      const setConfigCalls: Array<[string, string[]]> = [];
      const boundManager = {
        query: jest.fn(async (sql: string, params: string[]) => {
          setConfigCalls.push([sql, params]);
          return [];
        }),
        getRepository: jest.fn((entity: unknown) =>
          entity === CashShiftSession ? boundShift : { find: jest.fn() },
        ),
      };
      const boundDataSource = {
        transaction: jest.fn(
          async (work: (manager: unknown) => Promise<unknown>) =>
            work(boundManager),
        ),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SalesExportService,
          {
            provide: getRepositoryToken(Invoice),
            useValue: { find: jest.fn().mockResolvedValue([]) },
          },
          {
            provide: getRepositoryToken(CashShiftSession),
            useValue: pooledShift,
          },
          { provide: DataSource, useValue: boundDataSource },
          {
            provide: FiscalSetupService,
            useValue: mockFiscalSetup,
          },
        ],
      }).compile();
      const bound = module.get<SalesExportService>(SalesExportService);

      const result = await bound.exportZReports(tenantId, {
        startDate: '2026-08-26',
        endDate: '2026-08-26',
        format: 'json',
      });

      expect(result.data.totalRecords).toBe(1);

      // ONE logical read unit, ONE transaction, bound exactly once with the
      // production set_config SQL carrying the tenant id as a parameter.
      expect(boundDataSource.transaction).toHaveBeenCalledTimes(1);
      expect(setConfigCalls).toEqual([
        [TENANT_CONTEXT_SET_CONFIG_SQL, [tenantId]],
      ]);

      // The read went through the bound manager's repository, and the
      // explicit tenant_id filter survived the binding (additive, never a
      // replacement).
      expect(boundShift.find).toHaveBeenCalledTimes(1);
      const findArgs = boundShift.find.mock.calls[0][0];
      expect(findArgs.where).toEqual({
        tenant_id: tenantId,
        opened_at: expect.anything(),
      });

      // RUNTIME TEETH: the pooled tripwire stayed silent. A reverted access
      // lands here and fails this assertion — no compile error involved.
      expect(pooledShift.find).not.toHaveBeenCalled();
    });

    // Issue #581 WU1: invoices is a direct:SIUD RLS-forced table — the
    // pooled exportSalesBook find silently returned zero rows under the
    // production NOBYPASSRLS role. RUNTIME teeth: same isolated-fake
    // pattern as the slice-5 guard above, with a pooled invoice tripwire.
    it('binds the exportSalesBook invoice read through the tenant transaction (issue #581 WU1)', async () => {
      const pooledInvoice = { find: jest.fn() };
      const boundInvoice = {
        find: jest.fn().mockResolvedValue([
          {
            id: 'inv-1',
            tenant_id: tenantId,
            number: '001-001-01-00000001',
            type: 'regular',
            subtotal: 1000,
            totalTax: 150,
            total: 1150,
            totalUsd: 31.51,
            isCanceled: false,
            customerId: 'J0310000000000',
            created_at: new Date('2026-08-26T10:00:00.000Z'),
            items: [
              {
                id: 'item-1',
                productId: 'p-1',
                productName: 'Comida',
                quantity: 1,
                unitPrice: 1000,
                discount: 0,
                originalTaxRate: 0.15,
                appliedTaxRate: 0.15,
                taxAmount: 150,
                total: 1150,
              } as InvoiceItem,
            ],
          },
          {
            id: 'inv-2',
            tenant_id: tenantId,
            number: '001-001-01-00000002',
            type: 'regular',
            subtotal: 300,
            totalTax: 45,
            total: 345,
            totalUsd: 9.45,
            isCanceled: true,
            created_at: new Date('2026-08-26T11:00:00.000Z'),
            items: [],
          },
        ]),
      };

      const setConfigCalls: Array<[string, string[]]> = [];
      const boundManager = {
        query: jest.fn(async (sql: string, params: string[]) => {
          setConfigCalls.push([sql, params]);
          return [];
        }),
        getRepository: jest.fn((entity: unknown) =>
          entity === Invoice
            ? boundInvoice
            : { find: jest.fn().mockResolvedValue([]) },
        ),
      };
      const boundDataSource = {
        transaction: jest.fn(
          async (work: (manager: unknown) => Promise<unknown>) =>
            work(boundManager),
        ),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SalesExportService,
          {
            provide: getRepositoryToken(Invoice),
            useValue: pooledInvoice,
          },
          {
            provide: getRepositoryToken(CashShiftSession),
            useValue: { find: jest.fn().mockResolvedValue([]) },
          },
          { provide: DataSource, useValue: boundDataSource },
          {
            provide: FiscalSetupService,
            useValue: mockFiscalSetup,
          },
        ],
      }).compile();
      const bound = module.get<SalesExportService>(SalesExportService);

      const result = await bound.exportSalesBook(tenantId, {
        startDate: '2026-08-26',
        endDate: '2026-08-26',
        format: 'json',
      });

      expect(result.data.totalRecords).toBe(2);

      // ONE logical read unit, ONE transaction, bound exactly once with the
      // production set_config SQL carrying the tenant id as a parameter.
      expect(boundDataSource.transaction).toHaveBeenCalledTimes(1);
      expect(setConfigCalls).toEqual([
        [TENANT_CONTEXT_SET_CONFIG_SQL, [tenantId]],
      ]);

      // Identical query semantics: same where, relations, and ordering.
      expect(boundInvoice.find).toHaveBeenCalledTimes(1);
      const findArgs = boundInvoice.find.mock.calls[0][0];
      expect(findArgs.where).toEqual({
        tenant_id: tenantId,
        created_at: expect.anything(),
      });
      expect(findArgs.relations).toEqual(['items']);
      expect(findArgs.order).toEqual({ created_at: 'ASC' });

      // RUNTIME TEETH: the pooled tripwire stayed silent.
      expect(pooledInvoice.find).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------
  // G1 (issue #522 Finding 1): real fiscal X and Z reports.
  //
  // RULINGS implemented here (sales_cash_roadmap.md D3 :16, AC4 :102,
  // AC5 :103, D4/DEC-04 :17/:28):
  //   1. Aggregation is keyed on the SHIFT, never on a fiscal day (P8).
  //   2. X = partial reading of an OPEN shift, closesShift: false, never
  //      closes anything (close-flow lives in CashShiftService).
  //   3. Z = definitive close view for CLOSED shifts; the DEC-04
  //      reconciliation blocker is reported as a signal, never hard-failed.
  //   4. DEC-03's manager-PIN-on-variance is a CLOSE-flow concern, not G1.
  //   5. exportZReports and getZReport share ONE aggregation path
  //      (getZReportRows) — asserted by behavioral equality below.
  // ---------------------------------------------------------------------
  describe('getZReportRows (G1: single Corte Z aggregation path)', () => {
    const zShifts: Partial<CashShiftSession>[] = [
      {
        id: 'shift-z-1',
        tenant_id: tenantId,
        terminal_id: 'POS-01',
        cashier_id: 'user-c1',
        cashier_name: 'Carlos Cajero',
        opened_at: new Date('2026-08-26T08:00:00.000Z'),
        closed_at: new Date('2026-08-26T17:00:00.000Z'),
        status: CashShiftStatus.CLOSED,
        initial_float_nio: 1000,
        initial_float_usd: 50,
        expected_cash_nio: 6500,
        expected_cash_usd: 120,
        final_counted_nio: 6500,
        final_counted_usd: 120,
        difference_nio: 0,
        difference_usd: 0,
        z_report_sequence: 14,
      },
    ];

    it('returns the existing Z row shape plus the underlying shift entities', async () => {
      mockShiftRepo.find.mockResolvedValue(zShifts);

      const result = await service.getZReportRows(tenantId, {
        start: new Date('2026-08-26T00:00:00.000-06:00'),
        end: new Date('2026-08-26T23:59:59.999-06:00'),
      });

      expect(result.records).toHaveLength(1);
      expect(result.records[0].shiftId).toBe('shift-z-1');
      expect(result.records[0].terminalId).toBe('POS-01');
      expect(result.records[0].zSequence).toBe(14);
      expect(result.records[0].expectedCashNio).toBe(6500);
      expect(result.shifts).toHaveLength(1);
      expect(result.shifts[0].status).toBe(CashShiftStatus.CLOSED);
    });

    it('keeps exportZReports and getZReportRows on one aggregation path (G1 ruling 5)', async () => {
      mockShiftRepo.find.mockResolvedValue(zShifts);

      const rows = await service.getZReportRows(tenantId, {
        start: new Date('2026-08-26T00:00:00.000-06:00'),
        end: new Date('2026-08-26T23:59:59.999-06:00'),
      });
      const exported = await service.exportZReports(tenantId, {
        startDate: '2026-08-26',
        endDate: '2026-08-26',
        format: 'json',
      });

      expect(exported.data.records).toEqual(rows.records);
      expect(mockShiftRepo.find).toHaveBeenCalledTimes(2);
      // Identical aggregation semantics: same where, same ordering.
      expect(mockShiftRepo.find.mock.calls[0][0].where).toEqual(
        mockShiftRepo.find.mock.calls[1][0].where,
      );
      expect(mockShiftRepo.find.mock.calls[0][0].order).toEqual(
        mockShiftRepo.find.mock.calls[1][0].order,
      );
    });

    it('narrows to one shift when bounds.shiftId is set', async () => {
      mockShiftRepo.find.mockResolvedValue(zShifts);

      await service.getZReportRows(tenantId, { shiftId: 'shift-z-1' });

      expect(mockShiftRepo.find).toHaveBeenCalledTimes(1);
      expect(mockShiftRepo.find.mock.calls[0][0].where).toMatchObject({
        tenant_id: tenantId,
        id: 'shift-z-1',
      });
    });

    it('binds the read through the tenant transaction; pooled repos stay silent', async () => {
      const pooledShift = { find: jest.fn() };
      const pooledMovement = { find: jest.fn() };
      const pooledInvoice = { find: jest.fn() };
      const boundShift = { find: jest.fn().mockResolvedValue(zShifts) };

      const setConfigCalls: Array<[string, string[]]> = [];
      const boundManager = {
        query: jest.fn(async (sql: string, params: string[]) => {
          setConfigCalls.push([sql, params]);
          return [];
        }),
        getRepository: jest.fn((entity: unknown) =>
          entity === CashShiftSession
            ? boundShift
            : { find: jest.fn().mockResolvedValue([]) },
        ),
      };
      const boundDataSource = {
        transaction: jest.fn(
          async (work: (manager: unknown) => Promise<unknown>) =>
            work(boundManager),
        ),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SalesExportService,
          {
            provide: getRepositoryToken(Invoice),
            useValue: pooledInvoice,
          },
          {
            provide: getRepositoryToken(CashShiftSession),
            useValue: pooledShift,
          },
          {
            provide: getRepositoryToken(CashMovement),
            useValue: pooledMovement,
          },
          { provide: DataSource, useValue: boundDataSource },
          { provide: FiscalSetupService, useValue: mockFiscalSetup },
        ],
      }).compile();
      const bound = module.get<SalesExportService>(SalesExportService);

      const result = await bound.getZReportRows(tenantId, {
        start: new Date('2026-08-26T00:00:00.000-06:00'),
        end: new Date('2026-08-26T23:59:59.999-06:00'),
      });

      expect(result.records).toHaveLength(1);
      expect(boundDataSource.transaction).toHaveBeenCalledTimes(1);
      expect(setConfigCalls).toEqual([
        [TENANT_CONTEXT_SET_CONFIG_SQL, [tenantId]],
      ]);
      // RUNTIME TEETH: pooled tripwires stayed silent.
      expect(pooledShift.find).not.toHaveBeenCalled();
      expect(pooledMovement.find).not.toHaveBeenCalled();
      expect(pooledInvoice.find).not.toHaveBeenCalled();
    });
  });

  describe('getXReport (G1: Corte X, partial reading of an open shift)', () => {
    const openShift: Partial<CashShiftSession> = {
      id: 'shift-x-1',
      tenant_id: tenantId,
      terminal_id: 'POS-01',
      cashier_id: 'user-c1',
      cashier_name: 'Carlos Cajero',
      opened_at: new Date('2026-08-26T08:00:00.000Z'),
      closed_at: null,
      status: CashShiftStatus.OPEN,
      initial_float_nio: 1000,
      initial_float_usd: 50,
      expected_cash_nio: 800,
      expected_cash_usd: 30,
    };
    const foreignOpenShift: Partial<CashShiftSession> = {
      ...openShift,
      id: 'shift-x-other-tenant',
      tenant_id: 'tenant-someone-else',
    };
    const movements: Partial<CashMovement>[] = [
      {
        tenant_id: tenantId,
        shift_id: 'shift-x-1',
        terminal_id: 'POS-01',
        type: CashMovementType.CASH_IN,
        amount_nio: 500,
        amount_usd: 0,
        reason: 'Cambio',
      },
      {
        tenant_id: tenantId,
        shift_id: 'shift-x-1',
        terminal_id: 'POS-01',
        type: CashMovementType.CASH_OUT,
        amount_nio: 50,
        amount_usd: 0,
        reason: 'Gasto operativo',
      },
      {
        tenant_id: tenantId,
        shift_id: 'shift-x-1',
        terminal_id: 'POS-01',
        type: CashMovementType.PETTY_CASH,
        amount_nio: 100,
        amount_usd: 2,
        reason: 'Fondo caja chica',
      },
      {
        tenant_id: tenantId,
        shift_id: 'shift-x-1',
        terminal_id: 'POS-01',
        type: CashMovementType.SAFE_DROP,
        amount_nio: 200,
        amount_usd: 5,
        reason: 'Salva',
      },
    ];
    const shiftInvoices: Partial<Invoice>[] = [
      {
        id: 'inv-x-1',
        tenant_id: tenantId,
        shiftId: 'shift-x-1',
        number: '001-001-01-00000001',
        type: 'regular',
        subtotal: 1000,
        totalTax: 150,
        total: 1150,
        isCanceled: false,
        created_at: new Date('2026-08-26T09:00:00.000Z'),
        items: [
          {
            id: 'item-x-1',
            quantity: 1,
            unitPrice: 1000,
            discount: 0,
            originalTaxRate: 0.15,
            appliedTaxRate: 0.15,
            taxAmount: 150,
            total: 1150,
          } as InvoiceItem,
        ],
        payments: [
          {
            id: 'pay-x-1',
            method: 'CASH',
            amountNio: 1250,
            changeGiven: 100,
            currency: 'NIO',
          },
          {
            id: 'pay-x-2',
            method: 'QR',
            amountNio: 200,
            changeGiven: 0,
            currency: 'NIO',
          },
        ] as never,
      },
      {
        id: 'inv-x-2',
        tenant_id: tenantId,
        shiftId: 'shift-x-1',
        number: '001-001-01-00000002',
        type: 'regular',
        subtotal: 300,
        totalTax: 0,
        total: 300,
        isCanceled: false,
        created_at: new Date('2026-08-26T10:00:00.000Z'),
        items: [],
        payments: [
          {
            id: 'pay-x-3',
            method: 'CARD',
            amountNio: 300,
            changeGiven: 0,
            currency: 'NIO',
          },
        ] as never,
      },
      {
        id: 'inv-x-voided',
        tenant_id: tenantId,
        shiftId: 'shift-x-1',
        number: '001-001-01-00000003',
        type: 'regular',
        subtotal: 999,
        totalTax: 0,
        total: 999,
        isCanceled: true,
        created_at: new Date('2026-08-26T11:00:00.000Z'),
        items: [],
        payments: [
          {
            id: 'pay-x-4',
            method: 'CASH',
            amountNio: 999,
            changeGiven: 0,
            currency: 'NIO',
          },
        ] as never,
      },
    ];

    const filterByWhere =
      <T extends { id?: string; tenant_id?: string; status?: string }>(
        rows: Partial<T>[],
      ) =>
      (opts?: { where?: Record<string, unknown> }): Promise<Partial<T>[]> => {
        let result = rows;
        const where = opts?.where ?? {};
        if (where.tenant_id !== undefined) {
          result = result.filter((r) => r.tenant_id === where.tenant_id);
        }
        if (where.id !== undefined) {
          result = result.filter((r) => r.id === where.id);
        }
        if (where.status !== undefined) {
          result = result.filter((r) => r.status === where.status);
        }
        return Promise.resolve(result);
      };

    it('aggregates movements, sales by method, and expected cash without closing the shift', async () => {
      mockShiftRepo.find.mockImplementation(filterByWhere([openShift]));
      mockMovementRepo.find.mockResolvedValue(movements);
      mockInvoiceRepo.find.mockResolvedValue(shiftInvoices);

      const result = await service.getXReport(tenantId, {});

      expect(result.closesShift).toBe(false);
      expect(result.shifts).toHaveLength(1);
      const shift = result.shifts[0];
      expect(shift.shiftId).toBe('shift-x-1');
      expect(shift.terminalId).toBe('POS-01');
      expect(shift.cashier).toBe('Carlos Cajero');
      expect(shift.status).toBe(CashShiftStatus.OPEN);
      expect(shift.closesShift).toBe(false);
      expect(shift.initialFloatNio).toBe(1000);
      expect(shift.initialFloatUsd).toBe(50);
      expect(shift.expectedCashNio).toBe(800);
      expect(shift.expectedCashUsd).toBe(30);
      expect(shift.cashMovements.CASH_IN).toEqual({
        nio: 500,
        usd: 0,
        count: 1,
      });
      expect(shift.cashMovements.CASH_OUT).toEqual({
        nio: 50,
        usd: 0,
        count: 1,
      });
      expect(shift.cashMovements.PETTY_CASH).toEqual({
        nio: 100,
        usd: 2,
        count: 1,
      });
      expect(shift.cashMovements.SAFE_DROP).toEqual({
        nio: 200,
        usd: 5,
        count: 1,
      });
      // CASH 1250 tendered - 100 change = 1150 net; canceled invoice's 999
      // must NOT leak into any method bucket.
      expect(shift.salesByMethod.cashNio).toBe(1150);
      expect(shift.salesByMethod.cardNio).toBe(300);
      expect(shift.salesByMethod.qrNio).toBe(200);
      expect(shift.salesByMethod.pointsNio).toBe(0);
      expect(shift.salesByMethod.otherNio).toBe(0);
    });

    it('returns an empty shift list (still closesShift:false) when no shift is open', async () => {
      mockShiftRepo.find.mockResolvedValue([]);

      const result = await service.getXReport(tenantId, {});

      expect(result.closesShift).toBe(false);
      expect(result.shifts).toEqual([]);
      // No sales/movements were ever read: the early exit stays honest.
      expect(mockMovementRepo.find).not.toHaveBeenCalled();
      expect(mockInvoiceRepo.find).not.toHaveBeenCalled();
    });

    it('never leaks another tenant’s open shift', async () => {
      mockShiftRepo.find.mockImplementation(
        filterByWhere([openShift, foreignOpenShift]),
      );
      mockMovementRepo.find.mockResolvedValue([]);
      mockInvoiceRepo.find.mockResolvedValue([]);

      const result = await service.getXReport(tenantId, {});

      expect(result.shifts).toHaveLength(1);
      expect(result.shifts[0].shiftId).toBe('shift-x-1');
      const where = mockShiftRepo.find.mock.calls[0][0].where;
      expect(where.tenant_id).toBe(tenantId);
      expect(where.status).toBe(CashShiftStatus.OPEN);
    });

    it('denies a shiftId that is not the tenant’s (deny/empty, never leak)', async () => {
      mockShiftRepo.find.mockImplementation(
        filterByWhere([openShift, foreignOpenShift]),
      );

      const result = await service.getXReport(tenantId, {
        shiftId: 'shift-x-other-tenant',
      });

      expect(result.closesShift).toBe(false);
      expect(result.shifts).toEqual([]);
    });

    it('binds every read through the tenant transaction; pooled repos stay silent', async () => {
      const pooledShift = { find: jest.fn() };
      const pooledMovement = { find: jest.fn() };
      const pooledInvoice = { find: jest.fn() };
      const boundShift = {
        find: jest.fn().mockResolvedValue([openShift]),
      };
      const boundMovement = {
        find: jest.fn().mockResolvedValue(movements),
      };
      const boundInvoice = {
        find: jest.fn().mockResolvedValue(shiftInvoices),
      };

      const setConfigCalls: Array<[string, string[]]> = [];
      const boundManager = {
        query: jest.fn(async (sql: string, params: string[]) => {
          setConfigCalls.push([sql, params]);
          return [];
        }),
        getRepository: jest.fn((entity: unknown) =>
          entity === CashShiftSession
            ? boundShift
            : entity === CashMovement
              ? boundMovement
              : boundInvoice,
        ),
      };
      const boundDataSource = {
        transaction: jest.fn(
          async (work: (manager: unknown) => Promise<unknown>) =>
            work(boundManager),
        ),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SalesExportService,
          {
            provide: getRepositoryToken(Invoice),
            useValue: pooledInvoice,
          },
          {
            provide: getRepositoryToken(CashShiftSession),
            useValue: pooledShift,
          },
          {
            provide: getRepositoryToken(CashMovement),
            useValue: pooledMovement,
          },
          { provide: DataSource, useValue: boundDataSource },
          { provide: FiscalSetupService, useValue: mockFiscalSetup },
        ],
      }).compile();
      const bound = module.get<SalesExportService>(SalesExportService);

      const result = await bound.getXReport(tenantId, {});

      expect(result.shifts).toHaveLength(1);
      expect(boundDataSource.transaction).toHaveBeenCalledTimes(1);
      expect(setConfigCalls).toEqual([
        [TENANT_CONTEXT_SET_CONFIG_SQL, [tenantId]],
      ]);
      expect(boundShift.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenant_id: tenantId }),
        }),
      );
      // RUNTIME TEETH: pooled tripwires stayed silent.
      expect(pooledShift.find).not.toHaveBeenCalled();
      expect(pooledMovement.find).not.toHaveBeenCalled();
      expect(pooledInvoice.find).not.toHaveBeenCalled();
    });

    // SF2 (verification gap): with no shiftId, /x returns every OPEN shift
    // of the tenant — optionally narrowed by terminalId. Two OPEN shifts on
    // different terminals under the SAME tenant must be separable, and
    // omitting terminalId must return both. Regression teeth: disabling the
    // terminalId narrowing (whereClause.terminal_id) fails the first block.
    it('narrows open shifts by terminalId and returns all of them when omitted', async () => {
      const shiftA: Partial<CashShiftSession> = {
        ...openShift,
        id: 'shift-x-pos1',
        terminal_id: 'POS-01',
      };
      const shiftB: Partial<CashShiftSession> = {
        ...openShift,
        id: 'shift-x-pos2',
        terminal_id: 'POS-02',
      };
      const terminalFilter =
        (rows: Partial<CashShiftSession>[]) =>
        (opts?: {
          where?: Record<string, unknown>;
        }): Promise<Partial<CashShiftSession>[]> => {
          let result = rows;
          const where = opts?.where ?? {};
          if (where.tenant_id !== undefined) {
            result = result.filter((r) => r.tenant_id === where.tenant_id);
          }
          if (where.status !== undefined) {
            result = result.filter((r) => r.status === where.status);
          }
          if (where.terminal_id !== undefined) {
            result = result.filter((r) => r.terminal_id === where.terminal_id);
          }
          return Promise.resolve(result);
        };

      mockShiftRepo.find.mockImplementation(terminalFilter([shiftA, shiftB]));
      mockMovementRepo.find.mockResolvedValue([]);
      mockInvoiceRepo.find.mockResolvedValue([]);

      const narrowed = await service.getXReport(tenantId, {
        terminalId: 'POS-01',
      });
      expect(narrowed.shifts).toHaveLength(1);
      expect(narrowed.shifts[0].shiftId).toBe('shift-x-pos1');
      expect(narrowed.shifts[0].terminalId).toBe('POS-01');

      // Omitting terminalId returns every OPEN shift of the tenant.
      const all = await service.getXReport(tenantId, {});
      expect(all.shifts).toHaveLength(2);

      // The narrowing predicate reached the bound read as a where clause
      // (tenant scoping stays additive alongside it).
      const narrowedWhere = mockShiftRepo.find.mock.calls[0][0].where;
      expect(narrowedWhere.terminal_id).toBe('POS-01');
      expect(narrowedWhere.tenant_id).toBe(tenantId);
      expect(narrowedWhere.status).toBe(CashShiftStatus.OPEN);
    });

    // SF1 (verification gap): credit notes are refund documents with
    // negative totals (persisted that way — see invoices.service.ts:363-380)
    // and are exactly what nets the sales-by-method aggregates. Skipping
    // credit-note invoices in the X aggregation must fail this test.
    it('nets credit-note payments into the salesByMethod totals', async () => {
      const nettedInvoices: Partial<Invoice>[] = [
        {
          id: 'inv-x-net-regular',
          tenant_id: tenantId,
          shiftId: 'shift-x-1',
          number: '001-001-01-00000010',
          type: 'regular',
          subtotal: 1000,
          totalTax: 150,
          total: 1150,
          isCanceled: false,
          created_at: new Date('2026-08-26T09:00:00.000Z'),
          items: [],
          payments: [
            {
              id: 'pay-x-net-regular',
              method: 'CASH',
              amountNio: 1150,
              changeGiven: 0,
              currency: 'NIO',
            } as never,
          ],
        },
        {
          // Persisted credit note: negative fiscal totals and a negative
          // refund payment (the sync path upserts the credit note's
          // payments onto the document).
          id: 'inv-x-net-credit',
          tenant_id: tenantId,
          shiftId: 'shift-x-1',
          number: '001-001-NC-00000001',
          type: 'creditNote',
          subtotal: -400,
          totalTax: -60,
          total: -460,
          isCanceled: false,
          created_at: new Date('2026-08-26T10:00:00.000Z'),
          items: [],
          payments: [
            {
              id: 'pay-x-net-credit',
              method: 'CASH',
              amountNio: -460,
              changeGiven: 0,
              currency: 'NIO',
            } as never,
          ],
        },
      ];
      mockShiftRepo.find.mockImplementation(filterByWhere([openShift]));
      mockMovementRepo.find.mockResolvedValue([]);
      mockInvoiceRepo.find.mockResolvedValue(nettedInvoices);

      const result = await service.getXReport(tenantId, {});

      expect(result.shifts).toHaveLength(1);
      // Netted: 1150 regular sale - 460 refunded = 690 — NOT the 1150 gross.
      expect(result.shifts[0].salesByMethod.cashNio).toBe(690);
    });

    // SF3 (latent numeric bug): the X sales-by-method net must match the
    // AG-08 reporting net it cites (sales-reports.service.ts:145-159):
    // change given in USD is converted with the payment's exchangeRate
    // BEFORE subtracting. The naive `amountNio - changeGiven` subtraction
    // overstates the net cash here (135 vs the correct 105).
    it('nets USD change like the AG-08 reporting net (exchangeRate conversion)', async () => {
      const usdChangeInvoices: Partial<Invoice>[] = [
        {
          id: 'inv-usd-change',
          tenant_id: tenantId,
          shiftId: 'shift-x-1',
          number: '001-001-01-00000004',
          type: 'regular',
          subtotal: 140,
          totalTax: 0,
          total: 140,
          isCanceled: false,
          created_at: new Date('2026-08-26T09:30:00.000Z'),
          items: [],
          payments: [
            {
              id: 'pay-usd-change',
              method: 'CASH',
              currency: 'NIO',
              amountNio: 140,
              exchangeRate: 7,
              changeGiven: 5,
              changeCurrency: 'USD',
            } as never,
          ],
        },
      ];
      mockShiftRepo.find.mockImplementation(filterByWhere([openShift]));
      mockMovementRepo.find.mockResolvedValue([]);
      mockInvoiceRepo.find.mockResolvedValue(usdChangeInvoices);

      const result = await service.getXReport(tenantId, {});

      expect(result.shifts).toHaveLength(1);
      // AG-08 net: 140 - (5 USD × 7) = 105 NIO — never the naive 140 - 5.
      expect(result.shifts[0].salesByMethod.cashNio).toBe(105);
    });
  });

  describe('getZReport (G1: Corte Z, definitive close view for closed shifts)', () => {
    const closedShift: Partial<CashShiftSession> = {
      id: 'shift-z-1',
      tenant_id: tenantId,
      terminal_id: 'POS-01',
      cashier_id: 'user-c1',
      cashier_name: 'Carlos Cajero',
      opened_at: new Date('2026-08-26T08:00:00.000Z'),
      closed_at: new Date('2026-08-26T17:00:00.000Z'),
      status: CashShiftStatus.CLOSED,
      initial_float_nio: 1000,
      initial_float_usd: 50,
      expected_cash_nio: 6500,
      expected_cash_usd: 120,
      final_counted_nio: 6500,
      final_counted_usd: 120,
      difference_nio: 0,
      difference_usd: 0,
      z_report_sequence: 14,
      supervisor_id: 'sup-1',
    };
    const openShift: Partial<CashShiftSession> = {
      ...closedShift,
      id: 'shift-z-open',
      closed_at: null,
      status: CashShiftStatus.OPEN,
      z_report_sequence: null,
      supervisor_id: null,
    };

    const makeRows = () => [
      {
        shiftId: 'shift-z-1',
        closedAt: '2026-08-26T17:00:00.000Z',
        openedAt: '2026-08-26T08:00:00.000Z',
        terminalId: 'POS-01',
        zSequence: 14,
        cashierName: 'Carlos Cajero',
        initialFloatNio: 1000,
        initialFloatUsd: 50,
        expectedCashNio: 6500,
        expectedCashUsd: 120,
        finalCountedNio: 6500,
        finalCountedUsd: 120,
        differenceNio: 0,
        differenceUsd: 0,
        status: CashShiftStatus.CLOSED,
        notes: null,
      },
      {
        shiftId: 'shift-z-open',
        closedAt: 'ABIERTO',
        openedAt: '2026-08-27T08:00:00.000Z',
        terminalId: 'POS-01',
        zSequence: null,
        cashierName: 'Carlos Cajero',
        initialFloatNio: 1000,
        initialFloatUsd: 50,
        expectedCashNio: 0,
        expectedCashUsd: 0,
        finalCountedNio: null,
        finalCountedUsd: null,
        differenceNio: null,
        differenceUsd: null,
        status: CashShiftStatus.OPEN,
        notes: null,
      },
    ];

    const shiftInvoices: Partial<Invoice>[] = [
      {
        id: 'inv-z-1',
        tenant_id: tenantId,
        shiftId: 'shift-z-1',
        number: '001-001-01-00000001',
        type: 'regular',
        subtotal: 1000,
        totalTax: 150,
        total: 1150,
        isCanceled: false,
        created_at: new Date('2026-08-26T09:00:00.000Z'),
        items: [
          {
            id: 'item-z-1',
            quantity: 1,
            unitPrice: 1000,
            discount: 0,
            originalTaxRate: 0.15,
            appliedTaxRate: 0.15,
            taxAmount: 150,
            total: 1150,
          } as InvoiceItem,
        ],
        payments: [
          {
            id: 'pay-z-1',
            method: 'CARD',
            amountNio: 1150,
            changeGiven: 0,
            reconciliationStatus: 'PENDIENTE',
          } as never,
        ],
      },
      {
        id: 'inv-z-2',
        tenant_id: tenantId,
        shiftId: 'shift-z-1',
        number: '001-001-01-00000002',
        type: 'regular',
        subtotal: 500,
        totalTax: 0,
        total: 500,
        isCanceled: false,
        created_at: new Date('2026-08-26T10:00:00.000Z'),
        items: [],
        payments: [],
      },
      {
        // Canceled invoice: must be excluded from the shift's fiscal totals
        // AND its stale PENDING card payment must not raise the blocker.
        id: 'inv-z-voided',
        tenant_id: tenantId,
        shiftId: 'shift-z-1',
        number: '001-001-01-00000003',
        type: 'regular',
        subtotal: 230,
        totalTax: 30,
        total: 230,
        isCanceled: true,
        created_at: new Date('2026-08-26T11:00:00.000Z'),
        items: [],
        payments: [
          {
            id: 'pay-z-voided',
            method: 'CARD',
            amountNio: 230,
            changeGiven: 0,
            reconciliationStatus: 'PENDIENTE',
          } as never,
        ],
      },
    ];

    it('returns closed shifts in range with fiscal totals and the blocker signal', async () => {
      jest.spyOn(service, 'getZReportRows').mockResolvedValue({
        records: makeRows(),
        shifts: [closedShift, openShift] as CashShiftSession[],
      });
      mockInvoiceRepo.find.mockResolvedValue(shiftInvoices);

      const result = await service.getZReport(tenantId, {
        startDate: '2026-08-26',
        endDate: '2026-08-26',
      });

      // The single aggregation path fed the report (G1 ruling 5).
      expect(service.getZReportRows).toHaveBeenCalledWith(tenantId, {
        start: new Date('2026-08-26T00:00:00.000-06:00'),
        end: new Date('2026-08-26T23:59:59.999-06:00'),
        shiftId: undefined,
      });

      // OPEN shifts are not Z material: definitive close view only.
      expect(result.totalRecords).toBe(1);
      expect(result.records[0].shiftId).toBe('shift-z-1');
      expect(result.records[0].zSequence).toBe(14);
      expect(result.records[0].supervisorId).toBe('sup-1');

      // Canceled 230/30 excluded — gross is 1150+500, IVA 150, taxable 1000,
      // exempt 500 (the no-item invoice falls back to subtotal by its tax).
      expect(result.records[0].fiscalTotals).toEqual({
        totalGrossNio: 1650,
        totalTaxableNio: 1000,
        totalExemptNio: 500,
        totalTaxNio: 150,
      });

      // DEC-04 blocker signal: reported, not thrown (reporting ≠ closing).
      expect(result.records[0].blockedByUnreconciledPayments).toBe(true);
      expect(result.records[0].unreconciledPaymentCount).toBe(1);
      expect(result.records[0].status).toBe(CashShiftStatus.CLOSED);
    });

    it('does not flag reconciled or non-card payments (triangulation)', async () => {
      jest.spyOn(service, 'getZReportRows').mockResolvedValue({
        records: makeRows(),
        shifts: [closedShift] as CashShiftSession[],
      });
      mockInvoiceRepo.find.mockResolvedValue([
        {
          ...shiftInvoices[0],
          payments: [
            {
              id: 'pay-reconciled',
              method: 'CARD',
              amountNio: 1150,
              reconciliationStatus: 'CONCILIADO',
            } as never,
            {
              id: 'pay-cash-pending',
              method: 'CASH',
              amountNio: 100,
              reconciliationStatus: 'PENDIENTE',
            } as never,
          ],
        },
        shiftInvoices[1],
      ]);

      const result = await service.getZReport(tenantId, {});

      expect(result.records[0].blockedByUnreconciledPayments).toBe(false);
      expect(result.records[0].unreconciledPaymentCount).toBe(0);
    });

    it('narrows to one shift when shiftId is provided', async () => {
      jest.spyOn(service, 'getZReportRows').mockResolvedValue({
        records: makeRows().slice(0, 1),
        shifts: [closedShift] as CashShiftSession[],
      });
      mockInvoiceRepo.find.mockResolvedValue([]);

      await service.getZReport(tenantId, { shiftId: 'shift-z-1' });

      expect(service.getZReportRows).toHaveBeenCalledWith(tenantId, {
        start: undefined,
        end: undefined,
        shiftId: 'shift-z-1',
      });
    });

    // SF1 (verification gap): credit notes carry negative fiscal totals
    // (DGI DT 09-2007 corrections, persisted with negative items — see
    // invoices.service.ts:363-380) and are exactly what nets the shift's
    // fiscalTotals. Skipping credit-note invoices in the Z aggregation
    // must fail this test.
    it('nets credit notes into the shift fiscalTotals', async () => {
      jest.spyOn(service, 'getZReportRows').mockResolvedValue({
        records: makeRows().slice(0, 1),
        shifts: [closedShift] as CashShiftSession[],
      });
      mockInvoiceRepo.find.mockResolvedValue([
        {
          id: 'inv-z-net-regular',
          tenant_id: tenantId,
          shiftId: 'shift-z-1',
          number: '001-001-01-00000010',
          type: 'regular',
          subtotal: 1000,
          totalTax: 150,
          total: 1150,
          isCanceled: false,
          created_at: new Date('2026-08-26T09:00:00.000Z'),
          items: [
            {
              id: 'item-z-net-regular',
              quantity: 1,
              unitPrice: 1000,
              discount: 0,
              originalTaxRate: 0.15,
              appliedTaxRate: 0.15,
              taxAmount: 150,
              total: 1150,
            } as InvoiceItem,
          ],
          payments: [],
        },
        {
          id: 'inv-z-net-credit',
          tenant_id: tenantId,
          shiftId: 'shift-z-1',
          number: '001-001-NC-00000001',
          type: 'creditNote',
          subtotal: -400,
          totalTax: -60,
          total: -460,
          isCanceled: false,
          created_at: new Date('2026-08-26T10:00:00.000Z'),
          items: [
            {
              id: 'item-z-net-credit',
              quantity: -1,
              unitPrice: 400,
              discount: 0,
              originalTaxRate: 0.15,
              appliedTaxRate: 0.15,
              taxAmount: -60,
              total: -460,
            } as InvoiceItem,
          ],
          payments: [],
        },
      ]);

      const result = await service.getZReport(tenantId, {});

      expect(result.records).toHaveLength(1);
      // Netted: gross 1150 - 460 = 690, taxable 1000 - 400 = 600,
      // IVA 150 - 60 = 90, exempt 0 — NOT the 1150/1000/150 gross.
      expect(result.records[0].fiscalTotals).toEqual({
        totalGrossNio: 690,
        totalTaxableNio: 600,
        totalExemptNio: 0,
        totalTaxNio: 90,
      });
    });
  });
});
