import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FiscalReportsService } from './fiscal-reports.service';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceItem } from '../entities/invoice-item.entity';
import { User, UserRole } from '../../identity/entities/user.entity';

describe('FiscalReportsService', () => {
  let service: FiscalReportsService;
  let mockInvoiceRepo: {
    find: jest.Mock;
  };
  let mockUserRepo: {
    find: jest.Mock;
  };

  const tenantId = 'tenant-dgi-01';

  beforeEach(async () => {
    mockInvoiceRepo = {
      find: jest.fn(),
    };
    mockUserRepo = {
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FiscalReportsService,
        {
          provide: getRepositoryToken(Invoice),
          useValue: mockInvoiceRepo,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepo,
        },
      ],
    }).compile();

    service = module.get<FiscalReportsService>(FiscalReportsService);
  });

  describe('getMonthlySummary', () => {
    it('should compute DGI taxable base, exempt sales, IVA collected, and net after credit notes', async () => {
      const mockInvoices: Partial<Invoice>[] = [
        {
          id: 'inv-1',
          tenant_id: tenantId,
          number: '001-001-01-00000001',
          type: 'regular',
          subtotal: 1000,
          totalTax: 150,
          total: 1150,
          isCanceled: false,
          created_at: new Date('2026-08-10T10:00:00.000Z'),
          items: [
            {
              id: 'item-1',
              productId: 'p-1',
              productName: 'Gravado (15%)',
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
          subtotal: 500,
          totalTax: 0,
          total: 500,
          isCanceled: false,
          created_at: new Date('2026-08-15T12:00:00.000Z'),
          items: [
            {
              id: 'item-2',
              productId: 'p-2',
              productName: 'Exento (0%)',
              quantity: 1,
              unitPrice: 500,
              discount: 0,
              originalTaxRate: 0,
              appliedTaxRate: 0,
              taxAmount: 0,
              total: 500,
            } as InvoiceItem,
          ],
        },
        {
          id: 'inv-3',
          tenant_id: tenantId,
          number: '001-001-01-00000003',
          type: 'creditNote',
          subtotal: 200,
          totalTax: 30,
          total: 230,
          isCanceled: false,
          created_at: new Date('2026-08-20T14:00:00.000Z'),
          items: [],
        },
      ];

      mockInvoiceRepo.find.mockResolvedValue(mockInvoices);

      const result = await service.getMonthlySummary(tenantId, {
        year: 2026,
        month: 8,
      });

      expect(result.year).toBe(2026);
      expect(result.month).toBe(8);
      expect(result.totalGrossSales).toBe(1650);
      expect(result.totalTaxableSales).toBe(1000);
      expect(result.totalExemptSales).toBe(500);
      expect(result.totalTaxCollected).toBe(150);
      expect(result.totalCreditNotes).toBe(230);
      expect(result.totalCreditNotesTax).toBe(30);

      // Net taxable: 1000 - 200 = 800
      expect(result.netTaxableSales).toBe(800);
      // Net tax: 150 - 30 = 120
      expect(result.netTaxPayable).toBe(120);

      expect(result.invoiceCount).toBe(2);
      expect(result.creditNoteCount).toBe(1);
    });

    it('should return zeroes when month has no records', async () => {
      mockInvoiceRepo.find.mockResolvedValue([]);

      const result = await service.getMonthlySummary(tenantId, {
        year: 2026,
        month: 1,
      });

      expect(result.totalGrossSales).toBe(0);
      expect(result.totalTaxableSales).toBe(0);
      expect(result.totalExemptSales).toBe(0);
      expect(result.totalTaxCollected).toBe(0);
      expect(result.netTaxableSales).toBe(0);
      expect(result.netTaxPayable).toBe(0);
      expect(result.invoiceCount).toBe(0);
      expect(result.creditNoteCount).toBe(0);
    });
  });

  describe('getVoidedInvoices', () => {
    it('should list canceled invoices with cancellation reason and cashier identity', async () => {
      const mockInvoices: Partial<Invoice>[] = [
        {
          id: 'inv-v1',
          tenant_id: tenantId,
          number: '001-001-01-00000005',
          subtotal: 400,
          totalTax: 60,
          total: 460,
          isCanceled: true,
          voidReason: 'Error de digitación en forma de pago',
          userId: 'user-c1',
          created_at: new Date('2026-08-26T10:00:00.000Z'),
          updated_at: new Date('2026-08-26T10:05:00.000Z'),
        },
      ];

      const mockUsers: Partial<User>[] = [
        {
          id: 'user-c1',
          name: 'Ana Cajera',
          role: UserRole.CASHIER,
          tenant_id: tenantId,
        },
      ];

      mockInvoiceRepo.find.mockResolvedValue(mockInvoices);
      mockUserRepo.find.mockResolvedValue(mockUsers);

      const result = await service.getVoidedInvoices(tenantId, {
        startDate: '2026-08-01',
        endDate: '2026-08-26',
      });

      expect(result.totalVoidedCount).toBe(1);
      expect(result.totalVoidedAmount).toBe(460);
      expect(result.invoices.length).toBe(1);
      expect(result.invoices[0].number).toBe('001-001-01-00000005');
      expect(result.invoices[0].voidReason).toBe(
        'Error de digitación en forma de pago',
      );
      expect(result.invoices[0].cashierName).toBe('Ana Cajera');
    });
  });

  describe('getSequenceAudit', () => {
    it('should detect missing gaps in invoice sequence', async () => {
      const mockInvoices: Partial<Invoice>[] = [
        {
          number: '001-001-01-00000001',
          created_at: new Date('2026-08-26T08:00:00Z'),
        },
        {
          number: '001-001-01-00000002',
          created_at: new Date('2026-08-26T08:30:00Z'),
        },
        {
          number: '001-001-01-00000004',
          created_at: new Date('2026-08-26T09:00:00Z'),
        },
        {
          number: '001-001-01-00000005',
          created_at: new Date('2026-08-26T09:30:00Z'),
        },
        {
          number: '001-001-01-00000008',
          created_at: new Date('2026-08-26T10:00:00Z'),
        },
      ];

      mockInvoiceRepo.find.mockResolvedValue(mockInvoices);

      const result = await service.getSequenceAudit(tenantId);

      expect(result.startSequence).toBe(1);
      expect(result.endSequence).toBe(8);
      expect(result.expectedCount).toBe(8);
      expect(result.actualCount).toBe(5);
      expect(result.hasGaps).toBe(true);
      expect(result.missingSequences).toEqual([3, 6, 7]);
      expect(result.duplicateSequences).toEqual([]);
    });

    it('should report no gaps when consecutive numbering is intact', async () => {
      const mockInvoices: Partial<Invoice>[] = [
        {
          number: '001-001-01-00000001',
          created_at: new Date('2026-08-26T08:00:00Z'),
        },
        {
          number: '001-001-01-00000002',
          created_at: new Date('2026-08-26T08:30:00Z'),
        },
        {
          number: '001-001-01-00000003',
          created_at: new Date('2026-08-26T09:00:00Z'),
        },
      ];

      mockInvoiceRepo.find.mockResolvedValue(mockInvoices);

      const result = await service.getSequenceAudit(tenantId);

      expect(result.startSequence).toBe(1);
      expect(result.endSequence).toBe(3);
      expect(result.expectedCount).toBe(3);
      expect(result.actualCount).toBe(3);
      expect(result.hasGaps).toBe(false);
      expect(result.missingSequences).toEqual([]);
    });
  });
});
