import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SalesReportsService } from './sales-reports.service';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceItem } from '../entities/invoice-item.entity';
import { Payment } from '../entities/payment.entity';
import { User, UserRole } from '../../identity/entities/user.entity';

describe('SalesReportsService', () => {
  let service: SalesReportsService;
  let mockInvoiceRepo: {
    find: jest.Mock;
  };
  let mockItemRepo: {
    find: jest.Mock;
  };
  let mockPaymentRepo: {
    find: jest.Mock;
  };
  let mockUserRepo: {
    find: jest.Mock;
  };

  const tenantId = 'tenant-test-123';

  beforeEach(async () => {
    mockInvoiceRepo = {
      find: jest.fn(),
    };
    mockItemRepo = {
      find: jest.fn(),
    };
    mockPaymentRepo = {
      find: jest.fn(),
    };
    mockUserRepo = {
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesReportsService,
        {
          provide: getRepositoryToken(Invoice),
          useValue: mockInvoiceRepo,
        },
        {
          provide: getRepositoryToken(InvoiceItem),
          useValue: mockItemRepo,
        },
        {
          provide: getRepositoryToken(Payment),
          useValue: mockPaymentRepo,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepo,
        },
      ],
    }).compile();

    service = module.get<SalesReportsService>(SalesReportsService);
  });

  describe('getDashboard', () => {
    it('should aggregate gross sales, taxes, discounts, and payment methods properly', async () => {
      const mockInvoices: Partial<Invoice>[] = [
        {
          id: 'inv-1',
          tenant_id: tenantId,
          number: '001-001-01-00000001',
          subtotal: 1000,
          totalTax: 150,
          total: 1150,
          isCanceled: false,
          created_at: new Date('2026-08-26T10:00:00.000Z'),
          items: [
            {
              id: 'item-1',
              tenant_id: tenantId,
              invoiceId: 'inv-1',
              productId: 'prod-1',
              productName: 'Café Espresso',
              quantity: 2,
              unitPrice: 500,
              discount: 50,
              originalTaxRate: 0.15,
              appliedTaxRate: 0.15,
              taxAmount: 150,
              total: 1150,
              variantId: 'var-1',
              notes: '',
              recipeVersionId: 'rec-1',
              originInvoiceItemId: '',
              invoice: {} as Invoice,
              modifiers: [],
            },
          ],
          payments: [
            {
              id: 'pay-1',
              invoiceId: 'inv-1',
              method: 'CASH',
              amount: 1150,
              currency: 'NIO',
              exchangeRate: 1.0,
              amountNio: 1150,
              changeGiven: 0,
              changeCurrency: 'NIO',
              createdAt: new Date(),
              invoice: {} as Invoice,
            },
          ],
        },
        {
          id: 'inv-2',
          tenant_id: tenantId,
          number: '001-001-01-00000002',
          subtotal: 2000,
          totalTax: 300,
          total: 2300,
          isCanceled: false,
          created_at: new Date('2026-08-26T12:00:00.000Z'),
          items: [
            {
              id: 'item-2',
              tenant_id: tenantId,
              invoiceId: 'inv-2',
              productId: 'prod-2',
              productName: 'Sandwich Gourmet',
              quantity: 4,
              unitPrice: 500,
              discount: 100,
              originalTaxRate: 0.15,
              appliedTaxRate: 0.15,
              taxAmount: 300,
              total: 2300,
              variantId: 'var-2',
              notes: '',
              recipeVersionId: 'rec-2',
              originInvoiceItemId: '',
              invoice: {} as Invoice,
              modifiers: [],
            },
          ],
          payments: [
            {
              id: 'pay-2',
              invoiceId: 'inv-2',
              method: 'CARD',
              amount: 2300,
              currency: 'NIO',
              exchangeRate: 1.0,
              amountNio: 2300,
              changeGiven: 0,
              changeCurrency: 'NIO',
              createdAt: new Date(),
              invoice: {} as Invoice,
            },
          ],
        },
        {
          id: 'inv-3',
          tenant_id: tenantId,
          number: '001-001-01-00000003',
          subtotal: 730,
          totalTax: 109.5,
          total: 839.5,
          isCanceled: false,
          created_at: new Date('2026-08-26T14:00:00.000Z'),
          items: [],
          payments: [
            {
              id: 'pay-3',
              invoiceId: 'inv-3',
              method: 'CASH',
              amount: 23,
              currency: 'USD',
              exchangeRate: 36.5,
              amountNio: 839.5,
              changeGiven: 0,
              changeCurrency: 'NIO',
              createdAt: new Date(),
              invoice: {} as Invoice,
            },
          ],
        },
      ];

      mockInvoiceRepo.find.mockResolvedValue(mockInvoices);

      const result = await service.getDashboard(tenantId, {
        startDate: '2026-08-26',
        endDate: '2026-08-26',
      });

      expect(result.grossSales).toBe(4289.5);
      expect(result.netTaxableSales).toBe(3730);
      expect(result.totalTax).toBe(559.5);
      expect(result.totalDiscounts).toBe(150);
      expect(result.invoiceCount).toBe(3);
      expect(result.ticketAverage).toBe(1429.83);

      expect(result.paymentMethodsBreakdown.cashNio).toBe(1150);
      expect(result.paymentMethodsBreakdown.cashUsd).toBe(23);
      expect(result.paymentMethodsBreakdown.cardNio).toBe(2300);
      expect(result.paymentMethodsBreakdown.cardUsd).toBe(0);
      expect(result.paymentMethodsBreakdown.totalNio).toBe(4289.5);

      expect(mockInvoiceRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: tenantId,
            isCanceled: false,
          }) as unknown,
        }),
      );
    });

    it('should return zeroes when no invoices match', async () => {
      mockInvoiceRepo.find.mockResolvedValue([]);

      const result = await service.getDashboard(tenantId);

      expect(result.grossSales).toBe(0);
      expect(result.netTaxableSales).toBe(0);
      expect(result.totalTax).toBe(0);
      expect(result.totalDiscounts).toBe(0);
      expect(result.invoiceCount).toBe(0);
      expect(result.ticketAverage).toBe(0);
      expect(result.paymentMethodsBreakdown.totalNio).toBe(0);
    });
  });

  describe('getHourlySales', () => {
    it('should calculate 24 hourly buckets correctly', async () => {
      const mockInvoices: Partial<Invoice>[] = [
        {
          id: 'inv-1',
          tenant_id: tenantId,
          total: 500,
          created_at: new Date('2026-08-26T08:15:00.000Z'),
          isCanceled: false,
        },
        {
          id: 'inv-2',
          tenant_id: tenantId,
          total: 350,
          created_at: new Date('2026-08-26T08:45:00.000Z'),
          isCanceled: false,
        },
        {
          id: 'inv-3',
          tenant_id: tenantId,
          total: 1200,
          created_at: new Date('2026-08-26T13:30:00.000Z'),
          isCanceled: false,
        },
      ];

      mockInvoiceRepo.find.mockResolvedValue(mockInvoices);

      const result = await service.getHourlySales(tenantId, {
        date: '2026-08-26',
      });

      expect(result.date).toBe('2026-08-26');
      expect(result.totalSales).toBe(2050);
      expect(result.totalInvoices).toBe(3);
      expect(result.hourly.length).toBe(24);

      const hour8 = result.hourly.find((h) => h.hour === 8);
      expect(hour8?.invoiceCount).toBe(2);
      expect(hour8?.totalSales).toBe(850);

      const hour13 = result.hourly.find((h) => h.hour === 13);
      expect(hour13?.invoiceCount).toBe(1);
      expect(hour13?.totalSales).toBe(1200);

      const hour0 = result.hourly.find((h) => h.hour === 0);
      expect(hour0?.invoiceCount).toBe(0);
      expect(hour0?.totalSales).toBe(0);
    });
  });

  describe('getTopProducts', () => {
    it('should aggregate product quantities and revenues and sort descending', async () => {
      const mockInvoices: Partial<Invoice>[] = [
        {
          id: 'inv-1',
          tenant_id: tenantId,
          isCanceled: false,
          items: [
            {
              id: 'it-1',
              productId: 'prod-1',
              productName: 'Café Americano',
              quantity: 5,
              total: 500,
            } as InvoiceItem,
            {
              id: 'it-2',
              productId: 'prod-2',
              productName: 'Croissant',
              quantity: 2,
              total: 300,
            } as InvoiceItem,
          ],
        },
        {
          id: 'inv-2',
          tenant_id: tenantId,
          isCanceled: false,
          items: [
            {
              id: 'it-3',
              productId: 'prod-1',
              productName: 'Café Americano',
              quantity: 3,
              total: 300,
            } as InvoiceItem,
            {
              id: 'it-4',
              productId: 'prod-3',
              productName: 'Panini Jamón Serrano',
              quantity: 1,
              total: 450,
            } as InvoiceItem,
          ],
        },
      ];

      mockInvoiceRepo.find.mockResolvedValue(mockInvoices);

      const result = await service.getTopProducts(tenantId, { limit: 2 });

      expect(result.products.length).toBe(2);
      expect(result.products[0].productId).toBe('prod-1');
      expect(result.products[0].productName).toBe('Café Americano');
      expect(result.products[0].totalQuantity).toBe(8);
      expect(result.products[0].totalRevenue).toBe(800);

      expect(result.products[1].productId).toBe('prod-2');
      expect(result.products[1].totalQuantity).toBe(2);
      expect(result.products[1].totalRevenue).toBe(300);
    });
  });

  describe('getCashierPerformance', () => {
    it('should aggregate sales by cashier and resolve cashier names', async () => {
      const mockInvoices: Partial<Invoice>[] = [
        {
          id: 'inv-1',
          tenant_id: tenantId,
          userId: 'user-c1',
          total: 1000,
          isCanceled: false,
        },
        {
          id: 'inv-2',
          tenant_id: tenantId,
          userId: 'user-c1',
          total: 1500,
          isCanceled: false,
        },
        {
          id: 'inv-3',
          tenant_id: tenantId,
          userId: 'user-c2',
          total: 800,
          isCanceled: false,
        },
      ];

      const mockUsers: Partial<User>[] = [
        {
          id: 'user-c1',
          name: 'María Cajera',
          role: UserRole.CASHIER,
          tenant_id: tenantId,
        },
        {
          id: 'user-c2',
          name: 'Carlos Cajero',
          role: UserRole.CASHIER,
          tenant_id: tenantId,
        },
      ];

      mockInvoiceRepo.find.mockResolvedValue(mockInvoices);
      mockUserRepo.find.mockResolvedValue(mockUsers);

      const result = await service.getCashierPerformance(tenantId);

      expect(result.cashiers.length).toBe(2);

      const maria = result.cashiers.find((c) => c.userId === 'user-c1');
      expect(maria).toBeDefined();
      expect(maria?.cashierName).toBe('María Cajera');
      expect(maria?.invoiceCount).toBe(2);
      expect(maria?.totalSales).toBe(2500);
      expect(maria?.ticketAverage).toBe(1250);

      const carlos = result.cashiers.find((c) => c.userId === 'user-c2');
      expect(carlos).toBeDefined();
      expect(carlos?.cashierName).toBe('Carlos Cajero');
      expect(carlos?.invoiceCount).toBe(1);
      expect(carlos?.totalSales).toBe(800);
      expect(carlos?.ticketAverage).toBe(800);
    });
  });
});
