import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { ReportsController } from '../../src/modules/sales/controllers/reports.controller';
import { SalesReportsService } from '../../src/modules/sales/services/sales-reports.service';
import { FiscalReportsService } from '../../src/modules/sales/services/fiscal-reports.service';
import { SalesExportService } from '../../src/modules/sales/services/sales-export.service';
import { FiscalSetupService } from '../../src/modules/onboarding/services/fiscal-setup.service';
import { Invoice } from '../../src/modules/sales/entities/invoice.entity';
import { InvoiceItem } from '../../src/modules/sales/entities/invoice-item.entity';
import { Payment } from '../../src/modules/sales/entities/payment.entity';
import {
  CashShiftSession,
  CashShiftStatus,
} from '../../src/modules/sales/entities/cash-shift.entity';
import {
  CashMovement,
  CashMovementType,
} from '../../src/modules/sales/entities/cash-movement.entity';
import {
  User,
  UserRole,
} from '../../src/modules/identity/entities/user.entity';
import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { AuthoritativeCurrentUserGuard } from '../../src/modules/identity/guards/authoritative-current-user.guard';
import { CurrentUserAuthorizationService } from '../../src/modules/identity/services/current-user-authorization.service';
import { RolesGuard } from '../../src/modules/identity/guards/roles.guard';
import {
  createIdentityJwtConfigProvider,
  IDENTITY_JWT_TEST_CONFIG,
  signIdentityJwtAccessToken,
} from '../support/identity-jwt-test.fixture';
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
  const jwtSecret = IDENTITY_JWT_TEST_CONFIG.secret;
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
  // G1 (issue #522 Finding 1): X-report cash-movement reads run through the
  // bound transaction manager; the pooled token stays wired as tripwire.
  let mockMovementRepo: {
    find: jest.Mock;
  };
  let mockUserRepo: {
    find: jest.Mock;
  };
  // The tenant-bound transaction fake, copied from
  // sales-export.service.spec.ts: the manager hands back the same repository
  // mocks the pooled tokens provide, so SalesExportService's trailing
  // DataSource dependency resolves and its tenant-bound read observes the
  // same fixtures as the pooled reads.
  let transactionalManager: {
    query: jest.Mock;
    getRepository: jest.Mock;
  };
  let transactionalDataSource: { transaction: jest.Mock };

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
      shiftId: 'shift-e2e-1',
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
      shiftId: 'shift-e2e-1',
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
          // G1 (DEC-04): the unreconciled card voucher that must raise the
          // Z report's reconciliation blocker signal WITHOUT failing it.
          reconciliationStatus: 'PENDIENTE',
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
    // G1 (issue #522 Finding 1): an OPEN shift so the Corte X reading has
    // a subject. Its opened_at sits far outside every seeded fiscal range,
    // so unscoped legacy reads keep their pre-G1 fixture counts.
    {
      id: 'shift-e2e-open',
      tenant_id: tenantId,
      terminal_id: 'POS-02',
      cashier_id: 'user-cashier-1',
      cashier_name: 'Elena Morales',
      opened_at: new Date('2027-01-10T08:00:00.000Z'),
      closed_at: null,
      status: CashShiftStatus.OPEN,
      initial_float_nio: 500,
      initial_float_usd: 25,
      expected_cash_nio: 700,
      expected_cash_usd: 25,
      final_counted_nio: null,
      final_counted_usd: null,
      difference_nio: null,
      difference_usd: null,
      z_report_sequence: null,
    },
    // SF4 (tenant-isolation teeth): shifts belonging to a DIFFERENT tenant.
    // They must never appear in /x or /z responses for the acting tenant;
    // seeding them makes the tenant predicate observable (dropping it
    // leaks these rows and fails the isolation test below).
    {
      id: 'shift-e2e-foreign-open',
      tenant_id: 'tenant-e2e-rival',
      terminal_id: 'POS-99',
      cashier_id: 'user-rival-1',
      cashier_name: 'Rival Cajero',
      opened_at: new Date('2026-08-26T08:00:00.000Z'),
      closed_at: null,
      status: CashShiftStatus.OPEN,
      initial_float_nio: 900,
      initial_float_usd: 45,
      expected_cash_nio: 900,
      expected_cash_usd: 45,
      final_counted_nio: null,
      final_counted_usd: null,
      difference_nio: null,
      difference_usd: null,
      z_report_sequence: null,
    },
    {
      id: 'shift-e2e-foreign-closed',
      tenant_id: 'tenant-e2e-rival',
      terminal_id: 'POS-99',
      cashier_id: 'user-rival-1',
      cashier_name: 'Rival Cajero',
      opened_at: new Date('2026-08-26T07:00:00.000Z'),
      closed_at: new Date('2026-08-26T16:00:00.000Z'),
      status: CashShiftStatus.CLOSED,
      initial_float_nio: 900,
      initial_float_usd: 45,
      expected_cash_nio: 1900,
      expected_cash_usd: 45,
      final_counted_nio: 1900,
      final_counted_usd: 45,
      difference_nio: 0,
      difference_usd: 0,
      z_report_sequence: 99,
    },
  ];

  const sampleMovements: Partial<CashMovement>[] = [
    {
      tenant_id: tenantId,
      shift_id: 'shift-e2e-open',
      terminal_id: 'POS-02',
      type: CashMovementType.CASH_IN,
      amount_nio: 500,
      amount_usd: 0,
      reason: 'Cambio inicial',
    },
    {
      tenant_id: tenantId,
      shift_id: 'shift-e2e-open',
      terminal_id: 'POS-02',
      type: CashMovementType.SAFE_DROP,
      amount_nio: 200,
      amount_usd: 0,
      reason: 'Salva',
    },
    {
      tenant_id: tenantId,
      shift_id: 'shift-e2e-open',
      terminal_id: 'POS-02',
      type: CashMovementType.PETTY_CASH,
      amount_nio: 100,
      amount_usd: 0,
      reason: 'Fondo caja chica',
    },
    {
      tenant_id: tenantId,
      shift_id: 'shift-e2e-open',
      terminal_id: 'POS-02',
      type: CashMovementType.CASH_OUT,
      amount_nio: 200,
      amount_usd: 0,
      reason: 'Gasto operativo',
    },
  ];

  beforeAll(async () => {
    mockInvoiceRepo = { find: jest.fn() };
    mockItemRepo = { find: jest.fn() };
    mockPaymentRepo = { find: jest.fn() };
    mockShiftRepo = { find: jest.fn() };
    mockMovementRepo = { find: jest.fn() };
    mockUserRepo = { find: jest.fn() };

    transactionalManager = {
      query: jest.fn(async () => []),
      getRepository: jest.fn((entity: unknown) =>
        entity === Invoice
          ? mockInvoiceRepo
          : entity === User
            ? mockUserRepo
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

    mockInvoiceRepo.find.mockImplementation(
      (opts?: { where?: { isCanceled?: boolean; shiftId?: unknown } }) => {
        let result = sampleInvoices;
        const where = opts?.where;
        // G1: X/Z reads narrow by the invoice's shift (property `shiftId`,
        // column shift_id). In() arrives as a FindOperator carrying the id
        // array; plain equality arrives as a raw string.
        if (where && 'shiftId' in where) {
          const raw = where.shiftId;
          const ids =
            raw &&
            typeof raw === 'object' &&
            Array.isArray((raw as { value?: string[] }).value)
              ? (raw as { value: string[] }).value
              : [raw as string];
          result = result.filter(
            (i) => i.shiftId != null && ids.includes(i.shiftId),
          );
        }
        if (where && 'isCanceled' in where) {
          result = result.filter((i) => i.isCanceled === where.isCanceled);
        }
        return Promise.resolve(result);
      },
    );

    mockShiftRepo.find.mockImplementation(
      (opts?: {
        where?: {
          tenant_id?: string;
          id?: string;
          status?: CashShiftStatus;
          opened_at?: { value?: [Date, Date] };
        };
      }) => {
        let result = sampleShifts;
        const where = opts?.where ?? {};
        // SF4: the mock honors the tenant predicate so the isolation test
        // below actually observes it (a dropped tenant_id leaks the
        // foreign-tenant shifts seeded above).
        if (where.tenant_id !== undefined) {
          result = result.filter((s) => s.tenant_id === where.tenant_id);
        }
        if (where.id !== undefined) {
          result = result.filter((s) => s.id === where.id);
        }
        if (where.status !== undefined) {
          result = result.filter((s) => s.status === where.status);
        }
        // Between(start, end) arrives as a FindOperator with a [start, end]
        // value pair; honor it so date-scoped reads keep their legacy counts.
        const bounds = where.opened_at?.value;
        if (Array.isArray(bounds) && bounds.length === 2) {
          result = result.filter(
            (s) =>
              s.opened_at != null &&
              new Date(s.opened_at) >= bounds[0] &&
              new Date(s.opened_at) <= bounds[1],
          );
        }
        return Promise.resolve(result);
      },
    );

    mockMovementRepo.find.mockResolvedValue(sampleMovements);
    mockUserRepo.find.mockResolvedValue(sampleUsers);

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: jwtSecret })],
      controllers: [ReportsController],
      providers: [
        Reflector,
        RolesGuard,
        AuthGuard,
        AuthoritativeCurrentUserGuard,
        {
          provide: CurrentUserAuthorizationService,
          useValue: { authorize: jest.fn((token: unknown) => token) },
        },
        createIdentityJwtConfigProvider(),
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
          provide: getRepositoryToken(CashMovement),
          useValue: mockMovementRepo,
        },
        { provide: DataSource, useValue: transactionalDataSource },
        {
          provide: FiscalSetupService,
          useValue: { getFiscalSetup: jest.fn() },
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
    signIdentityJwtAccessToken(jwtService, {
      sub: 'user-manager-1',
      email: `${role.toLowerCase()}@omnifood.ni`,
      tenant_id: tenantId,
      role,
      is_active: true,
      security_version: 1,
    });

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
      // JSON — scoped to August so the seeded OPEN shift (2027, added for
      // the G1 X-report coverage) stays outside this export's assertion.
      const resJson = await request(app.getHttpServer())
        .get(
          '/sales/reports/export/z-reports?format=json&startDate=2026-08-26&endDate=2026-08-26',
        )
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

  // G1 (issue #522 Finding 1): the /x and /z routes are real fiscal
  // reports, not literal stubs (roadmap D3 :16, AC4 :102, AC5 :103,
  // DEC-04 :28). RULINGS: aggregation keyed on the SHIFT (no fiscal-day
  // concept, open question P8); X = partial OPEN-shift reading with an
  // explicit closesShift:false and never closes anything; Z = definitive
  // close view for CLOSED shifts with the DEC-04 reconciliation blocker as
  // a signal, not a failure; DEC-03's manager-PIN-on-variance is a
  // close-flow concern, out of G1 scope.
  describe('G1: real fiscal Corte X and Corte Z reports', () => {
    it('GET /sales/reports/x reads the open shift with movements, float, and expected cash — without closing it', async () => {
      const res = await request(app.getHttpServer())
        .get('/sales/reports/x')
        .set('Authorization', `Bearer ${getAuthToken(UserRole.MANAGER)}`)
        .expect(200);

      const body = res.body as {
        status?: string;
        closesShift: boolean;
        generatedAt: string;
        shifts: Array<{
          shiftId: string;
          terminalId: string;
          cashier: string;
          status: string;
          closesShift: boolean;
          initialFloatNio: number;
          expectedCashNio: number;
          cashMovements: Record<
            string,
            { nio: number; usd: number; count: number }
          >;
          salesByMethod: Record<string, number>;
        }>;
      };

      // Not the literal stub, and explicitly non-closing.
      expect(body.status).toBeUndefined();
      expect(body.closesShift).toBe(false);
      expect(body.shifts).toHaveLength(1);

      const shift = body.shifts[0];
      expect(shift.shiftId).toBe('shift-e2e-open');
      expect(shift.terminalId).toBe('POS-02');
      expect(shift.cashier).toBe('Elena Morales');
      expect(shift.status).toBe('OPEN');
      expect(shift.closesShift).toBe(false);
      expect(shift.initialFloatNio).toBe(500);
      expect(shift.expectedCashNio).toBe(700);
      expect(shift.cashMovements.CASH_IN).toEqual({
        nio: 500,
        usd: 0,
        count: 1,
      });
      expect(shift.cashMovements.SAFE_DROP).toEqual({
        nio: 200,
        usd: 0,
        count: 1,
      });
      expect(shift.cashMovements.PETTY_CASH).toEqual({
        nio: 100,
        usd: 0,
        count: 1,
      });
      expect(shift.cashMovements.CASH_OUT).toEqual({
        nio: 200,
        usd: 0,
        count: 1,
      });
      // The open shift has no invoices: sales-by-method totals are honest zeros.
      expect(shift.salesByMethod.cashNio).toBe(0);
      expect(shift.salesByMethod.cardNio).toBe(0);
    });

    it('GET /sales/reports/x denies a shiftId that is not the tenant’s (empty, never leak)', async () => {
      const res = await request(app.getHttpServer())
        .get('/sales/reports/x?shiftId=shift-of-another-tenant')
        .set('Authorization', `Bearer ${getAuthToken(UserRole.MANAGER)}`)
        .expect(200);

      const body = res.body as {
        closesShift: boolean;
        shifts: unknown[];
      };
      expect(body.closesShift).toBe(false);
      expect(body.shifts).toEqual([]);
    });

    // SF4: tenant-isolation teeth. Foreign-tenant shifts ARE seeded (open
    // and closed) and must never appear in /x or /z for the acting tenant.
    // The pre-SF4 variant only proved "unknown shiftId ⇒ empty", which
    // passed even with the tenant predicate dropped.
    it('GET /sales/reports/x and /z never leak foreign-tenant shifts', async () => {
      const xRes = await request(app.getHttpServer())
        .get('/sales/reports/x')
        .set('Authorization', `Bearer ${getAuthToken(UserRole.MANAGER)}`)
        .expect(200);

      const xBody = xRes.body as { shifts: Array<{ shiftId: string }> };
      expect(xBody.shifts).toHaveLength(1);
      expect(xBody.shifts[0].shiftId).toBe('shift-e2e-open');
      expect(
        xBody.shifts.some((s) => s.shiftId === 'shift-e2e-foreign-open'),
      ).toBe(false);

      const zRes = await request(app.getHttpServer())
        .get('/sales/reports/z')
        .set('Authorization', `Bearer ${getAuthToken(UserRole.OWNER)}`)
        .expect(200);

      const zBody = zRes.body as { records: Array<{ shiftId: string }> };
      expect(
        zBody.records.some((r) => r.shiftId === 'shift-e2e-foreign-closed'),
      ).toBe(false);
      expect(zBody.records.map((r) => r.shiftId)).toEqual(['shift-e2e-1']);
    });

    it('GET /sales/reports/z returns the closed shift with fiscal totals and the reconciliation blocker signal', async () => {
      const res = await request(app.getHttpServer())
        .get('/sales/reports/z')
        .set('Authorization', `Bearer ${getAuthToken(UserRole.OWNER)}`)
        .expect(200);

      const body = res.body as {
        status?: string;
        totalRecords: number;
        records: Array<{
          shiftId: string;
          zSequence: number | null;
          supervisorId: string | null;
          status: string;
          fiscalTotals: {
            totalGrossNio: number;
            totalTaxableNio: number;
            totalExemptNio: number;
            totalTaxNio: number;
          };
          blockedByUnreconciledPayments: boolean;
          unreconciledPaymentCount: number;
        }>;
      };

      expect(body.status).toBeUndefined();
      // The OPEN shift is not Z material: definitive close view only.
      expect(body.totalRecords).toBe(1);
      const record = body.records[0];
      expect(record.shiftId).toBe('shift-e2e-1');
      expect(record.zSequence).toBe(1);
      expect(record.status).toBe('CLOSED');

      // Fiscal totals of the shift's invoices: 1150 + 500 gross (the voided
      // 230 has no shift and would be excluded anyway), IVA 150, taxable
      // 1000, exempt 500.
      expect(record.fiscalTotals).toEqual({
        totalGrossNio: 1650,
        totalTaxableNio: 1000,
        totalExemptNio: 500,
        totalTaxNio: 150,
      });

      // DEC-04: the pending card voucher on inv-e2e-2 flags the blocker
      // WITHOUT failing the report (reporting ≠ closing).
      expect(record.blockedByUnreconciledPayments).toBe(true);
      expect(record.unreconciledPaymentCount).toBe(1);
    });
  });
});
