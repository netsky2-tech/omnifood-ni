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
import { InvoiceItem } from '../entities/invoice-item.entity';

describe('SalesExportService', () => {
  let service: SalesExportService;
  let mockInvoiceRepo: {
    find: jest.Mock;
  };
  let mockShiftRepo: {
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
        entity === Invoice ? mockInvoiceRepo : mockShiftRepo,
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
  });
});
