import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { ReportsController } from '../../src/modules/sales/controllers/reports.controller';
import { SalesReportsService } from '../../src/modules/sales/services/sales-reports.service';
import { FiscalReportsService } from '../../src/modules/sales/services/fiscal-reports.service';
import { SalesExportService } from '../../src/modules/sales/services/sales-export.service';
import { Invoice } from '../../src/modules/sales/entities/invoice.entity';
import { InvoiceItem } from '../../src/modules/sales/entities/invoice-item.entity';
import { Payment } from '../../src/modules/sales/entities/payment.entity';
import {
  CashShiftSession,
  CashShiftStatus,
} from '../../src/modules/sales/entities/cash-shift.entity';
import {
  User,
  UserRole,
} from '../../src/modules/identity/entities/user.entity';
import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { RolesGuard } from '../../src/modules/identity/guards/roles.guard';
import {
  SalesDashboardReportDto,
  HourlySalesReportDto,
  TopProductsReportDto,
  CashierPerformanceReportDto,
} from '../../src/modules/sales/dto/sales-reports.dto';
import {
  MonthlyFiscalSummaryReportDto,
  VoidedInvoicesReportDto,
  FiscalSequenceAuditReportDto,
} from '../../src/modules/sales/dto/fiscal-reports.dto';
import {
  SalesBookExportDto,
  ZReportsExportDto,
} from '../../src/modules/sales/dto/sales-export.dto';

describe('Sales & Fiscal Reports & Exports E2E Integration', () => {
  const jwtSecret = 'e2e-test-secret-key-that-is-at-least-32-characters-long';
  const tenantId = 'tenant-e2e-retail';

  let app: INestApplication<App>;
  let jwtService: JwtService;

  let mockInvoiceRepo: {
    find: jest.Mock;
  };
  let mockItemRepo: {
    find: jest.Mock;
  };
  let mockPaymentRepo: {
    find: jest.Mock;
  };
  let mockShiftRepo: {
    find: jest.Mock;
  };
  let mockUserRepo: {
    find: jest.Mock;
  };

  const sampleUsers: Partial<User>[] = [
    {
      id: 'user-cashier-1',
      tenant_id: tenantId,
      name: 'Elena Morales',
      role: UserRole.CASHIER,
      is_active: true,
    },
    {
      id: 'user-manager-1',
      tenant_id: tenantId,
      name: 'Mario Perez',
      role: UserRole.MANAGER,
      is_active: true,
    },
  ];

  const sampleInvoices: Partial<Invoice>[] = [
    {
      id: 'inv-e2e-1',
      tenant_id: tenantId,
      number: '001-001-01-00000001',
      type: 'regular',
      userId: 'user-cashier-1',
      customerId: 'J0310000123456',
      subtotal: 1000,
      totalTax: 150,
      total: 1150,
      totalUsd: 31.51,
      isCanceled: false,
      created_at: new Date('2026-08-26T09:30:00.000Z'),
      items: [
        {
          id: 'item-e2e-1',
          tenant_id: tenantId,
          productId: 'prod-latte',
          productName: 'Café Latte Especial',
          quantity: 2,
          unitPrice: 500,
          discount: 0,
          originalTaxRate: 0.15,
          appliedTaxRate: 0.15,
          taxAmount: 150,
          total: 1150,
        } as InvoiceItem,
      ],
      payments: [
        {
          id: 'pay-e2e-1',
          invoiceId: 'inv-e2e-1',
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
      id: 'inv-e2e-2',
      tenant_id: tenantId,
      number: '001-001-01-00000002',
      type: 'regular',
      userId: 'user-cashier-1',
      customerId: 'CONSUMIDOR FINAL',
      subtotal: 500,
      totalTax: 0,
      total: 500,
      totalUsd: 13.7,
      isCanceled: false,
      created_at: new Date('2026-08-26T14:15:00.000Z'),
      items: [
        {
          id: 'item-e2e-2',
          tenant_id: tenantId,
          productId: 'prod-agua',
          productName: 'Agua Mineral',
          quantity: 5,
          unitPrice: 100,
          discount: 0,
          originalTaxRate: 0,
          appliedTaxRate: 0,
          taxAmount: 0,
          total: 500,
        } as InvoiceItem,
      ],
      payments: [
        {
          id: 'pay-e2e-2',
          invoiceId: 'inv-e2e-2',
          method: 'CARD',
          amount: 500,
          currency: 'NIO',
          exchangeRate: 1.0,
          amountNio: 500,
          changeGiven: 0,
          changeCurrency: 'NIO',
          createdAt: new Date(),
          invoice: {} as Invoice,
        },
      ],
    },
    {
      id: 'inv-e2e-3',
      tenant_id: tenantId,
      number: '001-001-01-00000003',
      type: 'regular',
      userId: 'user-cashier-1',
      customerId: 'CONSUMIDOR FINAL',
      subtotal: 200,
      totalTax: 30,
      total: 230,
      totalUsd: 6.3,
      isCanceled: true,
      voidReason: 'Error al seleccionar producto',
      created_at: new Date('2026-08-26T16:00:00.000Z'),
      updated_at: new Date('2026-08-26T16:05:00.000Z'),
      items: [],
      payments: [],
    },
  ];

  const sampleShifts: Partial<CashShiftSession>[] = [
    {
      id: 'shift-e2e-1',
      tenant_id: tenantId,
      terminal_id: 'POS-01',
      cashier_id: 'user-cashier-1',
      cashier_name: 'Elena Morales',
      opened_at: new Date('2026-08-26T08:00:00.000Z'),
      closed_at: new Date('2026-08-26T17:00:00.000Z'),
      status: CashShiftStatus.CLOSED,
      initial_float_nio: 1000,
      initial_float_usd: 50,
      expected_cash_nio: 2150,
      expected_cash_usd: 50,
      final_counted_nio: 2150,
      final_counted_usd: 50,
      difference_nio: 0,
      difference_usd: 0,
      z_report_sequence: 1,
    },
  ];

  beforeAll(async () => {
    mockInvoiceRepo = { find: jest.fn() };
    mockItemRepo = { find: jest.fn() };
    mockPaymentRepo = { find: jest.fn() };
    mockShiftRepo = { find: jest.fn() };
    mockUserRepo = { find: jest.fn() };

    mockInvoiceRepo.find.mockImplementation(
      (opts?: { where?: { isCanceled?: boolean } }) => {
        let result = sampleInvoices;
        if (opts?.where && 'isCanceled' in opts.where) {
          result = sampleInvoices.filter(
            (i) => i.isCanceled === opts.where.isCanceled,
          );
        }
        return Promise.resolve(result);
      },
    );

    mockShiftRepo.find.mockResolvedValue(sampleShifts);
    mockUserRepo.find.mockResolvedValue(sampleUsers);

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: jwtSecret })],
      controllers: [ReportsController],
      providers: [
        Reflector,
        RolesGuard,
        AuthGuard,
        SalesReportsService,
        FiscalReportsService,
        SalesExportService,
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
          provide: getRepositoryToken(CashShiftSession),
          useValue: mockShiftRepo,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepo,
        },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            NODE_ENV: 'test',
            JWT_SECRET: jwtSecret,
            JWT_ISSUER: 'omnifood-admin',
            JWT_AUDIENCE: 'omnifood-pos',
            JWT_ACCESS_TTL_SECONDS: '3600',
            JWT_REFRESH_TTL_SECONDS: '604800',
            JWT_CLOCK_TOLERANCE_SECONDS: '5',
            JWT_ALGORITHM: 'HS256',
          }),
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    jwtService = app.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  const getAuthToken = (role: UserRole) =>
    jwtService.sign(
      {
        sub: 'user-manager-1',
        email: 'manager@omnifood.ni',
        tenant_id: tenantId,
        role,
        is_active: true,
        token_type: 'access',
        security_version: 1,
      },
      {
        issuer: 'omnifood-admin',
        audience: 'omnifood-pos',
        expiresIn: 3600,
        algorithm: 'HS256',
      },
    );

  describe('Security & RBAC Controls', () => {
    it('rejects unauthenticated requests with 401', async () => {
      await request(app.getHttpServer())
        .get('/sales/reports/dashboard')
        .expect(401);
    });

    it('rejects CASHIER role on administrative reporting routes with 403', async () => {
      await request(app.getHttpServer())
        .get('/sales/reports/dashboard')
        .set('Authorization', `Bearer ${getAuthToken(UserRole.CASHIER)}`)
        .expect(403);
    });

    it('rejects WAITER role on DGI fiscal routes with 403', async () => {
      await request(app.getHttpServer())
        .get('/sales/reports/fiscal/monthly-summary?year=2026&month=8')
        .set('Authorization', `Bearer ${getAuthToken(UserRole.WAITER)}`)
        .expect(403);
    });
  });

  describe('Slice 9.1: Sales Dashboard & Operational Analytics', () => {
    it('GET /sales/reports/dashboard aggregates active invoices properly', async () => {
      const res = await request(app.getHttpServer())
        .get('/sales/reports/dashboard?startDate=2026-08-01&endDate=2026-08-31')
        .set('Authorization', `Bearer ${getAuthToken(UserRole.MANAGER)}`)
        .expect(200);

      const body = res.body as SalesDashboardReportDto;
      expect(body.grossSales).toBe(1650); // 1150 + 500 (voided 230 excluded)
      expect(body.netTaxableSales).toBe(1500); // 1000 + 500
      expect(body.totalTax).toBe(150);
      expect(body.invoiceCount).toBe(2);
      expect(body.ticketAverage).toBe(825);
      expect(body.paymentMethodsBreakdown.cashNio).toBe(1150);
      expect(body.paymentMethodsBreakdown.cardNio).toBe(500);
      expect(body.paymentMethodsBreakdown.totalNio).toBe(1650);
    });

    it('GET /sales/reports/hourly-sales distributes sales across 24h heatmap', async () => {
      const res = await request(app.getHttpServer())
        .get('/sales/reports/hourly-sales?date=2026-08-26')
        .set('Authorization', `Bearer ${getAuthToken(UserRole.MANAGER)}`)
        .expect(200);

      const body = res.body as HourlySalesReportDto;
      expect(body.date).toBe('2026-08-26');
      expect(body.hourly).toHaveLength(24);
      expect(body.totalSales).toBe(1650);
      expect(body.totalInvoices).toBe(2);

      const hour9 = body.hourly.find((h) => h.hour === 9);
      expect(hour9?.invoiceCount).toBe(1);
      expect(hour9?.totalSales).toBe(1150);

      const hour14 = body.hourly.find((h) => h.hour === 14);
      expect(hour14?.invoiceCount).toBe(1);
      expect(hour14?.totalSales).toBe(500);
    });

    it('GET /sales/reports/top-products ranks top selling products', async () => {
      const res = await request(app.getHttpServer())
        .get('/sales/reports/top-products?limit=5')
        .set('Authorization', `Bearer ${getAuthToken(UserRole.OWNER)}`)
        .expect(200);

      const body = res.body as TopProductsReportDto;
      expect(body.products.length).toBeGreaterThanOrEqual(2);
      expect(body.products[0].productId).toBe('prod-agua');
      expect(body.products[0].totalQuantity).toBe(5);
      expect(body.products[1].productId).toBe('prod-latte');
      expect(body.products[1].totalQuantity).toBe(2);
    });

    it('GET /sales/reports/cashier-performance groups sales by cashier', async () => {
      const res = await request(app.getHttpServer())
        .get('/sales/reports/cashier-performance')
        .set('Authorization', `Bearer ${getAuthToken(UserRole.MANAGER)}`)
        .expect(200);

      const body = res.body as CashierPerformanceReportDto;
      expect(body.cashiers).toHaveLength(1);
      expect(body.cashiers[0].userId).toBe('user-cashier-1');
      expect(body.cashiers[0].cashierName).toBe('Elena Morales');
      expect(body.cashiers[0].invoiceCount).toBe(2);
      expect(body.cashiers[0].totalSales).toBe(1650);
    });
  });

  describe('Slice 9.2: DGI Fiscal Reconciliation & Sequence Audit', () => {
    it('GET /sales/reports/fiscal/monthly-summary computes DGI tax declaration summary', async () => {
      const res = await request(app.getHttpServer())
        .get('/sales/reports/fiscal/monthly-summary?year=2026&month=8')
        .set('Authorization', `Bearer ${getAuthToken(UserRole.MANAGER)}`)
        .expect(200);

      const body = res.body as MonthlyFiscalSummaryReportDto;
      expect(body.year).toBe(2026);
      expect(body.month).toBe(8);
      expect(body.totalGrossSales).toBe(1650);
      expect(body.totalTaxableSales).toBe(1000);
      expect(body.totalExemptSales).toBe(500);
      expect(body.totalTaxCollected).toBe(150);
      expect(body.netTaxableSales).toBe(1000);
      expect(body.netTaxPayable).toBe(150);
    });

    it('GET /sales/reports/fiscal/voided-invoices audits voided tickets and reasons', async () => {
      const res = await request(app.getHttpServer())
        .get('/sales/reports/fiscal/voided-invoices')
        .set('Authorization', `Bearer ${getAuthToken(UserRole.MANAGER)}`)
        .expect(200);

      const body = res.body as VoidedInvoicesReportDto;
      expect(body.totalVoidedCount).toBe(1);
      expect(body.totalVoidedAmount).toBe(230);
      expect(body.invoices[0].number).toBe('001-001-01-00000003');
      expect(body.invoices[0].voidReason).toBe('Error al seleccionar producto');
      expect(body.invoices[0].cashierName).toBe('Elena Morales');
    });

    it('GET /sales/reports/fiscal/sequence-audit verifies consecutive invoice numbering', async () => {
      const res = await request(app.getHttpServer())
        .get('/sales/reports/fiscal/sequence-audit')
        .set('Authorization', `Bearer ${getAuthToken(UserRole.OWNER)}`)
        .expect(200);

      const body = res.body as FiscalSequenceAuditReportDto;
      expect(body.startSequence).toBe(1);
      expect(body.endSequence).toBe(3);
      expect(body.expectedCount).toBe(3);
      expect(body.actualCount).toBe(3);
      expect(body.hasGaps).toBe(false);
      expect(body.missingSequences).toHaveLength(0);
    });
  });

  describe('Slice 9.3 & Extensions: Multi-format Accounting Exports (JSON, CSV, XLSX, PDF)', () => {
    it('exports Sales Book in JSON format', async () => {
      const res = await request(app.getHttpServer())
        .get('/sales/reports/export/sales-book?format=json')
        .set('Authorization', `Bearer ${getAuthToken(UserRole.MANAGER)}`)
        .expect(200);

      const body = res.body as SalesBookExportDto;
      expect(body.totalRecords).toBe(3);
      expect(body.totalGrossNio).toBe(1650);
      expect(body.records[0].documentType).toBe('FACTURA');
      expect(body.records[2].documentType).toBe('ANULADA');
    });

    it('exports Sales Book in CSV format with download headers', async () => {
      const res = await request(app.getHttpServer())
        .get('/sales/reports/export/sales-book?format=csv')
        .set('Authorization', `Bearer ${getAuthToken(UserRole.MANAGER)}`)
        .expect(200);

      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain(
        'attachment; filename="libro-ventas-dgi-',
      );
      expect(res.text).toContain('"Numero Factura"');
      expect(res.text).toContain('001-001-01-00000001');
    });

    it('exports Sales Book in XLSX format with Excel spreadsheet headers', async () => {
      const res = await request(app.getHttpServer())
        .get('/sales/reports/export/sales-book?format=xlsx')
        .set('Authorization', `Bearer ${getAuthToken(UserRole.MANAGER)}`)
        .expect(200);

      expect(res.headers['content-type']).toContain(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(res.headers['content-disposition']).toContain('.xlsx');
    });

    it('exports Sales Book in PDF format with PDF headers', async () => {
      const res = await request(app.getHttpServer())
        .get('/sales/reports/export/sales-book?format=pdf')
        .set('Authorization', `Bearer ${getAuthToken(UserRole.MANAGER)}`)
        .expect(200);

      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain('.pdf');
    });

    it('exports Z-Reports in JSON, CSV, XLSX, and PDF formats', async () => {
      // JSON
      const resJson = await request(app.getHttpServer())
        .get('/sales/reports/export/z-reports?format=json')
        .set('Authorization', `Bearer ${getAuthToken(UserRole.MANAGER)}`)
        .expect(200);

      const bodyJson = resJson.body as ZReportsExportDto;
      expect(bodyJson.totalRecords).toBe(1);
      expect(bodyJson.records[0].terminalId).toBe('POS-01');

      // CSV
      const resCsv = await request(app.getHttpServer())
        .get('/sales/reports/export/z-reports?format=csv')
        .set('Authorization', `Bearer ${getAuthToken(UserRole.MANAGER)}`)
        .expect(200);
      expect(resCsv.headers['content-type']).toContain('text/csv');

      // XLSX
      const resXlsx = await request(app.getHttpServer())
        .get('/sales/reports/export/z-reports?format=xlsx')
        .set('Authorization', `Bearer ${getAuthToken(UserRole.MANAGER)}`)
        .expect(200);
      expect(resXlsx.headers['content-type']).toContain(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );

      // PDF
      const resPdf = await request(app.getHttpServer())
        .get('/sales/reports/export/z-reports?format=pdf')
        .set('Authorization', `Bearer ${getAuthToken(UserRole.MANAGER)}`)
        .expect(200);
      expect(resPdf.headers['content-type']).toContain('application/pdf');
    });
  });
});
