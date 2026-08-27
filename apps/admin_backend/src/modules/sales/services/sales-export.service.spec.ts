import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SalesExportService } from './sales-export.service';
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

  const tenantId = 'tenant-export-101';

  beforeEach(async () => {
    mockInvoiceRepo = {
      find: jest.fn(),
    };
    mockShiftRepo = {
      find: jest.fn(),
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

      expect(csvResult.content).toContain(
        '"Fecha","Numero Factura","Tipo Documento","Cliente","Subtotal Exento (NIO)","Subtotal Gravado (NIO)","IVA 15% (NIO)","Descuento (NIO)","Total (NIO)","Total (USD)","Estado"',
      );
      expect(csvResult.content).toContain(
        '"2026-08-26","001-001-01-00000001","FACTURA","J0310000000000",0.00,1000.00,150.00,0.00,1150.00,31.51,"VALIDA"',
      );
      expect(csvResult.content).toContain(
        '"2026-08-26","001-001-01-00000002","ANULADA","CONSUMIDOR FINAL",0.00,300.00,45.00,0.00,345.00,9.45,"ANULADA"',
      );
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
});
