import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../../core/database/tenant-transaction';
import { SalesReportsService } from './sales-reports.service';
import { DailySeriesQueryDto } from '../dto/sales-reports.dto';
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
  // Issue #556 stage 12d F1: the users read runs through the tenant-bound
  // transaction manager; the pooled injection stays only as a RUNTIME TEETH
  // tripwire — any call here means a users read escaped the bound
  // transaction and would silently return zero rows under FORCE RLS.
  let pooledUserRepo: {
    find: jest.Mock;
  };
  let boundUserRepo: {
    find: jest.Mock;
  };
  let setConfigQueries: Array<{ sql: string; parameters?: unknown[] }>;
  let mockDataSource: {
    transaction: jest.Mock;
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
    pooledUserRepo = {
      find: jest.fn(),
    };
    boundUserRepo = {
      find: jest.fn(),
    };
    setConfigQueries = [];
    mockDataSource = {
      transaction: jest.fn(
        (
          operation: (manager: {
            query: jest.Mock;
            getRepository: jest.Mock;
          }) => Promise<unknown>,
        ) =>
          operation({
            query: jest.fn((sql: string, parameters?: unknown[]) => {
              setConfigQueries.push({ sql, parameters });
              return Promise.resolve([]);
            }),
            getRepository: jest.fn().mockImplementation((entity: unknown) => {
              // Issue #581 WU1: invoice reads also run inside the bound
              // transaction now; the manager hands back the same repo mock
              // the pooled token provides, so the behavior assertions below
              // keep their original target.
              if (entity === Invoice) return mockInvoiceRepo;
              if (entity === User) return boundUserRepo;
              const entityName =
                typeof entity === 'function' && 'name' in entity
                  ? (entity as { name: string }).name
                  : 'unknown entity';
              throw new Error(`Unexpected repository request: ${entityName}`);
            }),
          }),
      ),
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
          useValue: pooledUserRepo,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
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

      // V2 additive fields on the empty period (spec §7.2)
      expect(result.netSalesNio).toBe(0);
      expect(result.preDiscountSalesNio).toBe(0);
      expect(result.completedTicketCount).toBe(0);
      expect(result.averageTicketNetNio).toBeNull();
      expect(result.totalTaxNio).toBe(0);
      expect(result.totalDiscountsNio).toBe(0);
    });

    it('exposes the V2 additive semantics fields without redefining legacy fields (spec §7.2)', async () => {
      // Same fixture shape as the legacy aggregation test: the legacy fields
      // must keep their exact values while the V2 fields are added alongside.
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
              discount: 50,
            } as InvoiceItem,
          ],
          payments: [],
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
              discount: 100,
            } as InvoiceItem,
          ],
          payments: [],
        },
      ];

      mockInvoiceRepo.find.mockResolvedValue(mockInvoices);

      const result = await service.getDashboard(tenantId, {
        startDate: '2026-08-26',
        endDate: '2026-08-27',
      });

      // Legacy fields keep their historical values
      expect(result.grossSales).toBe(3450);
      expect(result.netTaxableSales).toBe(3000);
      expect(result.totalTax).toBe(450);
      expect(result.totalDiscounts).toBe(150);
      expect(result.invoiceCount).toBe(2);
      expect(result.ticketAverage).toBe(1725);

      // V2 explicit semantics (PRD §7.2/§7.3/§7.5: Net Sales = Σ subtotal,
      // Pre-discount = Net Sales + Discounts, Average = Net / Tickets)
      expect(result.netSalesNio).toBe(3000);
      expect(result.preDiscountSalesNio).toBe(3150);
      expect(result.completedTicketCount).toBe(2);
      expect(result.averageTicketNetNio).toBe(1500);
      expect(result.totalTaxNio).toBe(450);
      expect(result.totalDiscountsNio).toBe(150);

      // Reporting period metadata (America/Managua, inclusive end date)
      expect(result.reportingPeriod).toEqual({
        timezone: 'America/Managua',
        localStartDate: '2026-08-26',
        localEndDate: '2026-08-27',
      });
    });

    it('aggregates the tips summary over the same completed rows without touching sales totals (PRD §21, Batch 7)', async () => {
      const mockInvoices: Partial<Invoice>[] = [
        {
          id: 'inv-tip-1',
          tenant_id: tenantId,
          subtotal: 500,
          totalTax: 75,
          total: 575,
          isCanceled: false,
          created_at: new Date('2026-08-26T10:00:00.000Z'),
          items: [],
          payments: [],
          tipAmountNio: 50,
          tipEligibleBaseNio: 500,
        },
        {
          id: 'inv-tip-2',
          tenant_id: tenantId,
          subtotal: 800,
          totalTax: 120,
          total: 920,
          isCanceled: false,
          created_at: new Date('2026-08-26T12:00:00.000Z'),
          items: [],
          payments: [],
          tipAmountNio: 0,
          tipEligibleBaseNio: 800,
        },
        {
          id: 'inv-legacy',
          tenant_id: tenantId,
          subtotal: 300,
          totalTax: 45,
          total: 345,
          isCanceled: false,
          created_at: new Date('2026-08-26T13:00:00.000Z'),
          items: [],
          payments: [],
          tipAmountNio: null,
          tipEligibleBaseNio: null,
        },
      ] as Partial<Invoice>[];

      mockInvoiceRepo.find.mockResolvedValue(mockInvoices);

      const result = await service.getDashboard(tenantId, {
        startDate: '2026-08-26',
        endDate: '2026-08-26',
      });

      // Tips stay strictly separate from Net Sales / gross sales (PRD §21.3).
      expect(result.netSalesNio).toBe(1600);
      expect(result.grossSales).toBe(1840);
      expect(result.tipsSummary).toEqual({
        totalTipsNio: 50,
        tippedTicketCount: 1,
        averageTipNio: 50,
        tipRate: 3.85,
        tipCoverage: {
          recordedInvoicesCount: 2,
          totalInvoicesCount: 3,
        },
      });
    });

    it('preserves null tip totals on all-legacy NULL rows and reports the coverage gap (AD-10)', async () => {
      const mockInvoices: Partial<Invoice>[] = [
        {
          id: 'inv-legacy-1',
          tenant_id: tenantId,
          subtotal: 500,
          totalTax: 75,
          total: 575,
          isCanceled: false,
          created_at: new Date('2026-08-26T10:00:00.000Z'),
          items: [],
          payments: [],
          tipAmountNio: null,
          tipEligibleBaseNio: null,
        },
      ] as Partial<Invoice>[];

      mockInvoiceRepo.find.mockResolvedValue(mockInvoices);

      const result = await service.getDashboard(tenantId);

      expect(result.tipsSummary).toEqual({
        totalTipsNio: null,
        tippedTicketCount: 0,
        averageTipNio: null,
        tipRate: null,
        tipCoverage: {
          recordedInvoicesCount: 0,
          totalInvoicesCount: 1,
        },
      });
      // Legacy NULL tips must not distort sales totals either.
      expect(result.netSalesNio).toBe(500);
    });

    it('returns null local period bounds when no range was supplied', async () => {
      mockInvoiceRepo.find.mockResolvedValue([]);

      const result = await service.getDashboard(tenantId);

      expect(result.reportingPeriod).toEqual({
        timezone: 'America/Managua',
        localStartDate: null,
        localEndDate: null,
      });
    });

    it('nets changeGiven out of over-tendered cash in the payment breakdown (AG-08)', async () => {
      const mockInvoices: Partial<Invoice>[] = [
        {
          id: 'inv-cash',
          tenant_id: tenantId,
          number: '001-001-01-00000010',
          subtotal: 137,
          totalTax: 0,
          total: 137,
          isCanceled: false,
          created_at: new Date('2026-08-26T10:00:00.000Z'),
          items: [],
          payments: [
            {
              id: 'pay-cash',
              invoiceId: 'inv-cash',
              method: 'CASH',
              amount: 200,
              currency: 'NIO',
              exchangeRate: 1.0,
              amountNio: 200,
              changeGiven: 63,
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

      // Over-tendered cash (amount 200, change 63) contributes 137.
      expect(result.paymentMethodsBreakdown.cashNio).toBe(137);
      expect(result.paymentMethodsBreakdown.totalNio).toBe(137);
    });

    it('reports the owner literal over-tender fixture: C$200 sale paid with C$500 cash and C$300 change (AG-08)', async () => {
      const mockInvoices: Partial<Invoice>[] = [
        {
          id: 'inv-overtender-owner',
          tenant_id: tenantId,
          number: '001-001-01-00000012',
          subtotal: 200,
          totalTax: 0,
          total: 200,
          isCanceled: false,
          created_at: new Date('2026-08-26T10:00:00.000Z'),
          items: [],
          payments: [
            {
              id: 'pay-overtender-owner',
              invoiceId: 'inv-overtender-owner',
              method: 'CASH',
              amount: 500,
              currency: 'NIO',
              exchangeRate: 1.0,
              amountNio: 500,
              changeGiven: 300,
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

      // Owner acceptance scenario verbatim: a C$200 sale tendered with C$500
      // cash and C$300 handed back as change collects exactly C$200. The
      // negative assertions make a future refactor that drops the
      // changeGiven netting fail loudly instead of silently doubling the
      // reported takings.
      expect(result.paymentMethodsBreakdown.cashNio).toBe(200);
      expect(result.paymentMethodsBreakdown.totalNio).toBe(200);
      expect(result.paymentMethodsBreakdown.cashNio).not.toBe(500);
      expect(result.paymentMethodsBreakdown.totalNio).not.toBe(500);
    });

    it('nets over-tendered USD cash in its own currency slot without leaking the tendered amount (AG-08)', async () => {
      // USD analogue of the owner scenario: C$500-equivalent tendered in USD
      // (20 × 25) with a C$300-equivalent change returned in USD (12 × 25).
      // cashUsd is derived from effectiveUsd (amount − change in the payment
      // currency) while totalNio nets the NIO equivalent
      // (amountNio − changeNio); pin both so neither slot can regress to the
      // tendered figure.
      const mockInvoices: Partial<Invoice>[] = [
        {
          id: 'inv-overtender-usd',
          tenant_id: tenantId,
          number: '001-001-01-00000013',
          subtotal: 200,
          totalTax: 0,
          total: 200,
          isCanceled: false,
          created_at: new Date('2026-08-26T10:00:00.000Z'),
          items: [],
          payments: [
            {
              id: 'pay-overtender-usd',
              invoiceId: 'inv-overtender-usd',
              method: 'CASH',
              amount: 20,
              currency: 'USD',
              exchangeRate: 25,
              amountNio: 500,
              changeGiven: 12,
              changeCurrency: 'USD',
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

      // Original-currency netting: 20 USD tendered − 12 USD change = 8 USD.
      expect(result.paymentMethodsBreakdown.cashUsd).toBe(8);
      expect(result.paymentMethodsBreakdown.cashUsd).not.toBe(20);
      // A USD payment never enters the NIO cash slot.
      expect(result.paymentMethodsBreakdown.cashNio).toBe(0);
      // NIO-equivalent netting: 500 − (12 × 25) = 200.
      expect(result.paymentMethodsBreakdown.totalNio).toBe(200);
      expect(result.paymentMethodsBreakdown.totalNio).not.toBe(500);
    });

    it('treats missing changeGiven on legacy payment rows as zero', async () => {
      const mockInvoices: Partial<Invoice>[] = [
        {
          id: 'inv-legacy',
          tenant_id: tenantId,
          number: '001-001-01-00000011',
          subtotal: 500,
          totalTax: 0,
          total: 500,
          isCanceled: false,
          created_at: new Date('2026-08-26T10:00:00.000Z'),
          items: [],
          payments: [
            {
              id: 'pay-legacy',
              invoiceId: 'inv-legacy',
              method: 'CASH',
              amount: 500,
              currency: 'NIO',
              exchangeRate: 1.0,
              amountNio: 500,
              changeCurrency: 'NIO',
              createdAt: new Date(),
              invoice: {} as Invoice,
            } as Payment,
          ],
        },
      ];

      mockInvoiceRepo.find.mockResolvedValue(mockInvoices);

      const result = await service.getDashboard(tenantId);

      expect(result.paymentMethodsBreakdown.cashNio).toBe(500);
      expect(result.paymentMethodsBreakdown.totalNio).toBe(500);
    });
  });

  describe('getDashboardDailySeries (Dashboard V2 Batch 5a)', () => {
    const baseQuery = { startDate: '2026-06-10', endDate: '2026-06-13' };

    it('builds a continuous ordered daily series with zero-sales gap days', async () => {
      mockInvoiceRepo.find.mockResolvedValue([
        {
          id: 'inv-a',
          tenant_id: tenantId,
          subtotal: 500,
          totalTax: 75,
          isCanceled: false,
          localIssueDate: '2026-06-10',
          created_at: new Date('2026-06-10T16:00:00.000Z'),
          items: [],
          payments: [],
        },
        {
          id: 'inv-b',
          tenant_id: tenantId,
          subtotal: 300,
          totalTax: 45,
          isCanceled: false,
          localIssueDate: '2026-06-13',
          created_at: new Date('2026-06-13T17:00:00.000Z'),
          items: [],
          payments: [],
        },
      ]);

      const result = await service.getDashboardDailySeries(tenantId, baseQuery);

      // Verbatim frozen-contract shape example.
      expect(result).toEqual({
        days: [
          {
            date: '2026-06-10',
            netSalesNio: 500,
            completedTicketCount: 1,
            averageTicketNetNio: 500,
          },
          {
            date: '2026-06-11',
            netSalesNio: 0,
            completedTicketCount: 0,
            averageTicketNetNio: null,
          },
          {
            date: '2026-06-12',
            netSalesNio: 0,
            completedTicketCount: 0,
            averageTicketNetNio: null,
          },
          {
            date: '2026-06-13',
            netSalesNio: 300,
            completedTicketCount: 1,
            averageTicketNetNio: 300,
          },
        ],
        reportingPeriod: {
          timezone: 'America/Managua',
          localStartDate: '2026-06-10',
          localEndDate: '2026-06-13',
        },
        generatedAt: expect.any(String) as unknown,
      });
      expect(result.days.map((d) => d.date)).toEqual([
        '2026-06-10',
        '2026-06-11',
        '2026-06-12',
        '2026-06-13',
      ]);
    });

    it.each([
      ['2026-08-26', '2026-08-26'],
      ['2026-06-01', '2026-07-31'],
    ])(
      'rejects the %s..%s range (1 and 61 days) with BadRequestException',
      async (startDate, endDate) => {
        await expect(
          service.getDashboardDailySeries(tenantId, { startDate, endDate }),
        ).rejects.toThrow(BadRequestException);
        // Fail fast: no database read is issued for an invalid range.
        expect(mockInvoiceRepo.find).not.toHaveBeenCalled();
      },
    );

    it('accepts the 2-day and 60-day range boundaries', async () => {
      mockInvoiceRepo.find.mockResolvedValue([]);

      const two = await service.getDashboardDailySeries(tenantId, {
        startDate: '2026-08-26',
        endDate: '2026-08-27',
      });
      expect(two.days).toHaveLength(2);
      expect(two.reportingPeriod).toEqual({
        timezone: 'America/Managua',
        localStartDate: '2026-08-26',
        localEndDate: '2026-08-27',
      });

      mockInvoiceRepo.find.mockResolvedValue([]);
      const sixty = await service.getDashboardDailySeries(tenantId, {
        startDate: '2026-06-01',
        endDate: '2026-07-30',
      });
      expect(sixty.days).toHaveLength(60);
    });

    it('requires both range bounds', async () => {
      // The DTO declares both bounds required (class-validator 400s at the
      // pipe); the service defends independently, so exercise it with
      // partials cast past the type checker.
      await expect(
        service.getDashboardDailySeries(tenantId, {
          startDate: '2026-08-26',
        } as DailySeriesQueryDto),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.getDashboardDailySeries(tenantId, {
          endDate: '2026-08-27',
        } as DailySeriesQueryDto),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.getDashboardDailySeries(tenantId, {
          startDate: '  ',
          endDate: '2026-08-27',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mockInvoiceRepo.find).not.toHaveBeenCalled();
    });

    it('buckets an 18:00Z Jun 10 invoice (12:00 Managua) into Jun 10 via the legacy fallback', async () => {
      mockInvoiceRepo.find.mockResolvedValue([
        {
          id: 'inv-utc-midday',
          tenant_id: tenantId,
          subtotal: 120,
          totalTax: 0,
          isCanceled: false,
          // Legacy row: no local_issue_date persisted.
          localIssueDate: null,
          created_at: new Date('2026-06-10T18:00:00.000Z'),
          items: [],
          payments: [],
        },
        {
          id: 'inv-late-night',
          tenant_id: tenantId,
          subtotal: 80,
          totalTax: 0,
          isCanceled: false,
          localIssueDate: null,
          // 2026-06-11T04:30Z == 2026-06-10 22:30 Managua.
          created_at: new Date('2026-06-11T04:30:00.000Z'),
          items: [],
          payments: [],
        },
      ]);

      const result = await service.getDashboardDailySeries(tenantId, {
        startDate: '2026-06-10',
        endDate: '2026-06-11',
      });

      expect(result.days[0]).toEqual({
        date: '2026-06-10',
        netSalesNio: 200,
        completedTicketCount: 2,
        averageTicketNetNio: 100,
      });
      expect(result.days[1]).toEqual({
        date: '2026-06-11',
        netSalesNio: 0,
        completedTicketCount: 0,
        averageTicketNetNio: null,
      });
    });

    it('prefers the persisted localIssueDate over the created_at instant', async () => {
      mockInvoiceRepo.find.mockResolvedValue([
        {
          id: 'inv-offline',
          tenant_id: tenantId,
          subtotal: 90,
          totalTax: 0,
          isCanceled: false,
          localIssueDate: '2026-06-09',
          created_at: new Date('2026-06-11T20:00:00.000Z'),
          items: [],
          payments: [],
        },
      ]);

      const result = await service.getDashboardDailySeries(tenantId, {
        startDate: '2026-06-09',
        endDate: '2026-06-10',
      });

      // The sale belongs to its on-device local issue day; a bucket outside
      // the range is clamped to the nearest boundary (parity invariant).
      expect(result.days[0]).toMatchObject({
        date: '2026-06-09',
        netSalesNio: 90,
        completedTicketCount: 1,
      });
      expect(result.days[1].netSalesNio).toBe(0);
    });

    it('keeps §7.2 parity: Σ days.netSalesNio == dashboard netSalesNio for the same invoice set', async () => {
      const invoiceSet: Partial<Invoice>[] = [
        {
          id: 'inv-1',
          tenant_id: tenantId,
          subtotal: 1000,
          totalTax: 150,
          isCanceled: false,
          localIssueDate: '2026-06-10',
          created_at: new Date('2026-06-10T16:00:00.000Z'),
          items: [],
          payments: [],
        },
        {
          id: 'inv-2',
          tenant_id: tenantId,
          subtotal: 250.5,
          totalTax: 37.58,
          isCanceled: false,
          localIssueDate: '2026-06-11',
          created_at: new Date('2026-06-11T17:00:00.000Z'),
          items: [],
          payments: [],
        },
        {
          id: 'inv-void',
          tenant_id: tenantId,
          subtotal: 999,
          totalTax: 0,
          isCanceled: true,
          localIssueDate: '2026-06-11',
          created_at: new Date('2026-06-11T18:00:00.000Z'),
          items: [],
          payments: [],
        },
        {
          id: 'inv-cn',
          tenant_id: tenantId,
          subtotal: -300,
          totalTax: -45,
          isCanceled: false,
          localIssueDate: '2026-06-13',
          created_at: new Date('2026-06-13T19:00:00.000Z'),
          items: [],
          payments: [],
        },
      ];
      mockInvoiceRepo.find.mockResolvedValue(invoiceSet);

      const [series, dashboard] = await Promise.all([
        service.getDashboardDailySeries(tenantId, baseQuery),
        service.getDashboard(tenantId, baseQuery),
      ]);

      const seriesNet = series.days.reduce((sum, d) => sum + d.netSalesNio, 0);
      expect(seriesNet).toBe(dashboard.netSalesNio);
      expect(seriesNet).toBe(950.5);
      // Credit notes net in as persisted; voided rows are excluded.
      expect(
        series.days.reduce((sum, d) => sum + d.completedTicketCount, 0),
      ).toBe(dashboard.completedTicketCount);
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

    it('reconciles periodNetSalesNio with getDashboard().netSalesNio over the same invoice set (FR-PRODUCT-01)', async () => {
      const mockInvoices: Partial<Invoice>[] = [
        {
          id: 'inv-1',
          tenant_id: tenantId,
          isCanceled: false,
          subtotal: 900.01,
          totalTax: 100,
          total: 1000.01,
          items: [
            {
              id: 'it-1',
              productId: 'prod-1',
              productName: 'Café Americano',
              quantity: 2,
              total: 600,
              taxAmount: 100,
              discount: 100,
            } as InvoiceItem,
            {
              id: 'it-2',
              productId: 'prod-2',
              productName: 'Croissant',
              quantity: 1,
              total: 400,
              taxAmount: 0,
              discount: 0,
            } as InvoiceItem,
          ],
        },
        {
          id: 'inv-2',
          tenant_id: tenantId,
          isCanceled: false,
          subtotal: 500,
          totalTax: 75,
          total: 575,
          items: [
            {
              id: 'it-3',
              productId: 'prod-3',
              productName: 'Panini Jamón Serrano',
              quantity: 1,
              total: 500,
              taxAmount: 75,
              discount: 0,
            } as InvoiceItem,
          ],
        },
      ];

      mockInvoiceRepo.find.mockResolvedValue(mockInvoices);

      const period = { startDate: '2026-09-01', endDate: '2026-09-30' };
      const topProducts = await service.getTopProducts(tenantId, {
        ...period,
        limit: 10,
      });
      const dashboard = await service.getDashboard(tenantId, period);

      // The denominator must be the period's Net Sales over the SAME invoice
      // set the aggregates were built from — exactly what the KPI reports.
      expect(topProducts.periodNetSalesNio).toBe(dashboard.netSalesNio);

      // Truncation-safe invariant: shares over the period denominator can
      // never exceed 100%, and without Top-N truncation here the listed rows
      // reconcile with the period total (largest-remainder allocation).
      const listedNet = topProducts.products.reduce(
        (sum, p) => sum + p.netRevenueNio,
        0,
      );
      expect(listedNet).toBeLessThanOrEqual(topProducts.periodNetSalesNio);
      expect(listedNet).toBeCloseTo(topProducts.periodNetSalesNio, 2);
    });

    it('computes netRevenueNio post-discount pre-tax and never derives the denominator from tax-inclusive totalRevenue', async () => {
      const mockInvoices: Partial<Invoice>[] = [
        {
          id: 'inv-1',
          tenant_id: tenantId,
          isCanceled: false,
          // Post-discount, pre-tax persisted subtotal; the +0.01 vs the raw
          // line nets (600-100 + 400-0 = 900) is the per-invoice rounding
          // residue the largest-remainder allocation must absorb.
          subtotal: 900.01,
          totalTax: 100,
          total: 1000,
          items: [
            {
              id: 'it-1',
              productId: 'prod-1',
              productName: 'Café Americano',
              quantity: 1,
              total: 600,
              taxAmount: 100,
              discount: 100,
            } as InvoiceItem,
            {
              id: 'it-2',
              productId: 'prod-2',
              productName: 'Croissant',
              quantity: 1,
              total: 400,
              taxAmount: 0,
              discount: 0,
            } as InvoiceItem,
          ],
        },
      ];

      mockInvoiceRepo.find.mockResolvedValue(mockInvoices);

      const result = await service.getTopProducts(tenantId, { limit: 10 });

      // Denominator is the period Net Sales (post-discount, pre-tax), NOT
      // the sum of the tax-inclusive item totals (C$1,000).
      expect(result.periodNetSalesNio).toBe(900.01);
      const taxInclusiveSum = result.products.reduce(
        (sum, p) => sum + p.totalRevenue,
        0,
      );
      expect(taxInclusiveSum).toBe(1000);
      expect(result.periodNetSalesNio).not.toBe(taxInclusiveSum);

      // Per-line nets are post-discount, pre-tax; the residue lands on the
      // largest-remainder line so Σ lines reconciles with the subtotal.
      expect(result.products[0].netRevenueNio).toBeCloseTo(500.01, 2);
      expect(result.products[1].netRevenueNio).toBeCloseTo(400, 2);
    });

    it('proves the query moved off item.total: discount + non-zero tax make per-product net and tax-inclusive totals differ by construction (FR-PRODUCT-01)', async () => {
      const mockInvoices: Partial<Invoice>[] = [
        {
          id: 'inv-mix',
          tenant_id: tenantId,
          isCanceled: false,
          // Persisted decomposition: subtotal = Σ(line.total − line.taxAmount)
          // = (510 − 60) + (410 − 60) = 800; both discounts and tax are
          // non-zero, so every tax-inclusive line total differs from its
          // post-discount, pre-tax net by construction.
          subtotal: 800,
          totalTax: 120,
          total: 920,
          items: [
            {
              id: 'it-1',
              productId: 'prod-1',
              productName: 'Café Americano',
              quantity: 2,
              // Tax-inclusive line total: net 450 + tax 60.
              total: 510,
              taxAmount: 60,
              discount: 50,
            } as InvoiceItem,
            {
              id: 'it-2',
              productId: 'prod-2',
              productName: 'Croissant',
              quantity: 1,
              // Tax-inclusive line total: net 350 + tax 60.
              total: 410,
              taxAmount: 60,
              discount: 0,
            } as InvoiceItem,
          ],
        },
      ];

      mockInvoiceRepo.find.mockResolvedValue(mockInvoices);

      const period = { startDate: '2026-09-01', endDate: '2026-09-30' };
      const result = await service.getTopProducts(tenantId, {
        ...period,
        limit: 10,
      });
      const dashboard = await service.getDashboard(tenantId, period);

      // Load-bearing: per-product netRevenueNio is post-discount, pre-tax
      // Net Sales (item.total − item.taxAmount), NOT the deprecated
      // tax-inclusive item.total the legacy totalRevenue still aggregates.
      const americano = result.products.find((p) => p.productId === 'prod-1');
      const croissant = result.products.find((p) => p.productId === 'prod-2');
      expect(americano).toBeDefined();
      expect(croissant).toBeDefined();
      expect(americano!.netRevenueNio).toBe(450);
      expect(americano!.totalRevenue).toBe(510);
      expect(americano!.netRevenueNio).not.toBe(americano!.totalRevenue);
      expect(croissant!.netRevenueNio).toBe(350);
      expect(croissant!.totalRevenue).toBe(410);
      expect(croissant!.netRevenueNio).not.toBe(croissant!.totalRevenue);

      // Untruncated period: the listed rows reconcile EXACTLY with the
      // period Net Sales denominator (largest-remainder allocation), and
      // that denominator is the shared-semantics Net Sales, not Σ item.total.
      const listedNet = result.products.reduce(
        (sum, p) => sum + p.netRevenueNio,
        0,
      );
      expect(result.periodNetSalesNio).toBe(800);
      expect(listedNet).toBe(result.periodNetSalesNio);
      expect(result.periodNetSalesNio).not.toBe(920);

      // Same fixture and window: identical shared semantics helper as the
      // dashboard KPI route.
      expect(result.periodNetSalesNio).toBe(dashboard.netSalesNio);
    });

    it('truncated period: Σ listed netRevenueNio stays strictly below the period Net Sales denominator (FR-PRODUCT-01)', async () => {
      const mockInvoices: Partial<Invoice>[] = [
        {
          id: 'inv-mix',
          tenant_id: tenantId,
          isCanceled: false,
          subtotal: 800,
          totalTax: 120,
          total: 920,
          items: [
            {
              id: 'it-1',
              productId: 'prod-1',
              productName: 'Café Americano',
              quantity: 2,
              total: 510,
              taxAmount: 60,
              discount: 50,
            } as InvoiceItem,
            {
              id: 'it-2',
              productId: 'prod-2',
              productName: 'Croissant',
              quantity: 1,
              total: 410,
              taxAmount: 60,
              discount: 0,
            } as InvoiceItem,
          ],
        },
      ];

      mockInvoiceRepo.find.mockResolvedValue(mockInvoices);

      const result = await service.getTopProducts(tenantId, {
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        limit: 1,
      });

      // Only the highest-quantity product survives the Top-N cut.
      expect(result.products).toHaveLength(1);
      expect(result.products[0].productId).toBe('prod-1');

      // The denominator is the PERIOD total (800), not the listed sum (450):
      // the truncated aggregate must stay bounded by the full-period Net Sales.
      const listedNet = result.products.reduce(
        (sum, p) => sum + p.netRevenueNio,
        0,
      );
      expect(listedNet).toBe(450);
      expect(result.periodNetSalesNio).toBe(800);
      expect(listedNet).toBeLessThanOrEqual(result.periodNetSalesNio);
      expect(listedNet).toBeLessThan(result.periodNetSalesNio);
    });

    it('returns a zero denominator on an empty period so the frontend can fail closed', async () => {
      mockInvoiceRepo.find.mockResolvedValue([]);

      const result = await service.getTopProducts(tenantId, {});

      expect(result.products).toEqual([]);
      expect(result.periodNetSalesNio).toBe(0);
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
      boundUserRepo.find.mockResolvedValue(mockUsers);

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

    // Issue #556 stage 12d F1 (adversarial verification): users is
    // FORCE-RLS-protected, so the pooled `userRepo.find` here silently
    // returned zero rows and every cashier name degraded to the raw id.
    // The read must run through the tenant-bound transaction manager.
    it('binds the users read through the tenant transaction; the pooled repository stays silent', async () => {
      mockInvoiceRepo.find.mockResolvedValue([
        {
          id: 'inv-1',
          tenant_id: tenantId,
          userId: 'user-c1',
          total: 1000,
          isCanceled: false,
        },
      ]);
      boundUserRepo.find.mockResolvedValue([
        { id: 'user-c1', name: 'María Cajera', tenant_id: tenantId },
      ]);

      await service.getCashierPerformance(tenantId);

      // Issue #581 WU1: the invoice read is now also bound, so the method
      // opens TWO transactions (invoices, users); every binding carries the
      // JWT tenant before its read.
      expect(mockDataSource.transaction).toHaveBeenCalledTimes(2);
      expect(setConfigQueries).toEqual([
        { sql: TENANT_CONTEXT_SET_CONFIG_SQL, parameters: [tenantId] },
        { sql: TENANT_CONTEXT_SET_CONFIG_SQL, parameters: [tenantId] },
      ]);
      // Same query semantics as before: identical WHERE, no ordering change.
      expect(boundUserRepo.find).toHaveBeenCalledWith({
        where: { tenant_id: tenantId },
      });
      const result = await service.getCashierPerformance(tenantId);

      expect(result.cashiers[0]?.cashierName).toBe('María Cajera');

      // RUNTIME TEETH: the pooled tripwire stayed silent.
      expect(pooledUserRepo.find).not.toHaveBeenCalled();
    });
  });

  // Issue #581 WU1: invoices is a direct:SIUD RLS-forced table — a pooled
  // find silently returns zero rows under the production NOBYPASSRLS role.
  // Every invoice read in this service must execute inside the tenant-bound
  // transaction manager. RUNTIME teeth: each guard uses isolated fakes with
  // a pooled tripwire; a reverted access lands on it and fails.
  describe('tenant transaction binding (issue #581 WU1)', () => {
    const buildBoundService = async (
      boundInvoiceFind: jest.Mock,
      boundUserFind?: jest.Mock,
    ) => {
      const pooledInvoiceRepo = { find: jest.fn() };
      const pooledUserRepo = { find: jest.fn() };
      const boundUserRepo = {
        find: boundUserFind ?? jest.fn().mockResolvedValue([]),
      };
      const setConfigQueries: Array<{
        sql: string;
        parameters?: unknown[];
      }> = [];
      const dataSource = {
        transaction: jest.fn((work: (manager: unknown) => Promise<unknown>) =>
          work({
            query: jest.fn((sql: string, parameters?: unknown[]) => {
              setConfigQueries.push({ sql, parameters });
              return Promise.resolve([]);
            }),
            getRepository: jest.fn((entity: unknown) => {
              if (entity === Invoice) return { find: boundInvoiceFind };
              if (entity === User) return boundUserRepo;
              throw new Error('Unexpected repository request');
            }),
          }),
        ),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SalesReportsService,
          {
            provide: getRepositoryToken(Invoice),
            useValue: pooledInvoiceRepo,
          },
          {
            provide: getRepositoryToken(InvoiceItem),
            useValue: { find: jest.fn() },
          },
          {
            provide: getRepositoryToken(Payment),
            useValue: { find: jest.fn() },
          },
          { provide: getRepositoryToken(User), useValue: pooledUserRepo },
          { provide: DataSource, useValue: dataSource },
        ],
      }).compile();

      return {
        service: module.get<SalesReportsService>(SalesReportsService),
        pooledInvoiceRepo,
        pooledUserRepo,
        boundUserRepo,
        setConfigQueries,
      };
    };

    it('binds the getDashboard invoice read through the tenant transaction; the pooled repository stays silent', async () => {
      const boundInvoiceFind = jest.fn().mockResolvedValue([]);
      const { service, pooledInvoiceRepo, setConfigQueries } =
        await buildBoundService(boundInvoiceFind);

      await service.getDashboard(tenantId, {
        startDate: '2026-08-26',
        endDate: '2026-08-26',
      });

      expect(setConfigQueries).toEqual([
        { sql: TENANT_CONTEXT_SET_CONFIG_SQL, parameters: [tenantId] },
      ]);
      // Identical query semantics: same where, relations, and ordering.
      expect(boundInvoiceFind).toHaveBeenCalledWith({
        where: {
          tenant_id: tenantId,
          isCanceled: false,
          created_at: expect.anything(),
        },
        relations: ['items', 'payments'],
        order: { created_at: 'DESC' },
      });
      expect(pooledInvoiceRepo.find).not.toHaveBeenCalled();
    });

    it('binds the getHourlySales invoice read through the tenant transaction; the pooled repository stays silent', async () => {
      const boundInvoiceFind = jest.fn().mockResolvedValue([]);
      const { service, pooledInvoiceRepo, setConfigQueries } =
        await buildBoundService(boundInvoiceFind);

      await service.getHourlySales(tenantId, { date: '2026-08-26' });

      expect(setConfigQueries).toEqual([
        { sql: TENANT_CONTEXT_SET_CONFIG_SQL, parameters: [tenantId] },
      ]);
      expect(boundInvoiceFind).toHaveBeenCalledWith({
        where: {
          tenant_id: tenantId,
          isCanceled: false,
          created_at: expect.anything(),
        },
        order: { created_at: 'ASC' },
      });
      expect(pooledInvoiceRepo.find).not.toHaveBeenCalled();
    });

    it('binds the getTopProducts invoice read through the tenant transaction; the pooled repository stays silent', async () => {
      const boundInvoiceFind = jest.fn().mockResolvedValue([]);
      const { service, pooledInvoiceRepo, setConfigQueries } =
        await buildBoundService(boundInvoiceFind);

      await service.getTopProducts(tenantId, { limit: 5 });

      expect(setConfigQueries).toEqual([
        { sql: TENANT_CONTEXT_SET_CONFIG_SQL, parameters: [tenantId] },
      ]);
      expect(boundInvoiceFind).toHaveBeenCalledWith({
        where: { tenant_id: tenantId, isCanceled: false },
        relations: ['items'],
      });
      expect(pooledInvoiceRepo.find).not.toHaveBeenCalled();
    });

    it('binds both getCashierPerformance reads (invoices + users) through the tenant transaction; the pooled repositories stay silent', async () => {
      const boundInvoiceFind = jest.fn().mockResolvedValue([]);
      const boundUserFind = jest.fn().mockResolvedValue([]);
      const { service, pooledInvoiceRepo, pooledUserRepo, setConfigQueries } =
        await buildBoundService(boundInvoiceFind, boundUserFind);

      await service.getCashierPerformance(tenantId);

      // Two logical read units (invoices, users), each in its own bound
      // transaction; every binding carries the JWT tenant as a parameter.
      expect(setConfigQueries).toEqual([
        { sql: TENANT_CONTEXT_SET_CONFIG_SQL, parameters: [tenantId] },
        { sql: TENANT_CONTEXT_SET_CONFIG_SQL, parameters: [tenantId] },
      ]);
      expect(boundInvoiceFind).toHaveBeenCalledWith({
        where: { tenant_id: tenantId, isCanceled: false },
      });
      expect(boundUserFind).toHaveBeenCalledWith({
        where: { tenant_id: tenantId },
      });
      expect(pooledInvoiceRepo.find).not.toHaveBeenCalled();
      expect(pooledUserRepo.find).not.toHaveBeenCalled();
    });

    it('binds the getDashboardDailySeries invoice read through the tenant transaction; the pooled repository stays silent (#592)', async () => {
      const boundInvoiceFind = jest.fn().mockResolvedValue([]);
      const { service, pooledInvoiceRepo, setConfigQueries } =
        await buildBoundService(boundInvoiceFind);

      await service.getDashboardDailySeries(tenantId, {
        startDate: '2026-06-10',
        endDate: '2026-06-11',
      });

      expect(setConfigQueries).toEqual([
        { sql: TENANT_CONTEXT_SET_CONFIG_SQL, parameters: [tenantId] },
      ]);
      // Identical query semantics to the dashboard KPI read: same tenant
      // predicate, same completed-sale filter, same inclusive created_at
      // bounds — one source of truth for the invoice set (spec §7.2 parity).
      expect(boundInvoiceFind).toHaveBeenCalledWith({
        where: {
          tenant_id: tenantId,
          isCanceled: false,
          created_at: expect.anything(),
        },
        order: { created_at: 'ASC' },
      });
      expect(pooledInvoiceRepo.find).not.toHaveBeenCalled();
    });

    it('binds the getHourlySales range-mode invoice read through the tenant transaction; the pooled repository stays silent (#592)', async () => {
      const boundInvoiceFind = jest.fn().mockResolvedValue([]);
      const { service, pooledInvoiceRepo, setConfigQueries } =
        await buildBoundService(boundInvoiceFind);

      await service.getHourlySales(tenantId, {
        startDate: '2026-08-25',
        endDate: '2026-08-26',
      });

      expect(setConfigQueries).toEqual([
        { sql: TENANT_CONTEXT_SET_CONFIG_SQL, parameters: [tenantId] },
      ]);
      // Identical query semantics to the dashboard KPI read over the same
      // window: same tenant predicate, same isCanceled filter, same
      // inclusive created_at bounds (FR-HOURLY-03 parity).
      expect(boundInvoiceFind).toHaveBeenCalledWith({
        where: {
          tenant_id: tenantId,
          isCanceled: false,
          created_at: expect.anything(),
        },
        order: { created_at: 'ASC' },
      });
      expect(pooledInvoiceRepo.find).not.toHaveBeenCalled();
    });
  });
});
