import { INestApplication, BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { ReportsController } from './reports.controller';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { AuthoritativeCurrentUserGuard } from '../../identity/guards/authoritative-current-user.guard';
import { CurrentUserAuthorizationService } from '../../identity/services/current-user-authorization.service';
import { UserRole } from '../../identity/entities/user.entity';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { SalesReportsService } from '../services/sales-reports.service';
import { FiscalReportsService } from '../services/fiscal-reports.service';
import { SalesExportService } from '../services/sales-export.service';
import {
  CashierPerformanceReportDto,
  DailySeriesReportDto,
  HourlySalesReportDto,
  SalesDashboardReportDto,
  TopProductsReportDto,
} from '../dto/sales-reports.dto';
import {
  FiscalSequenceAuditReportDto,
  MonthlyFiscalSummaryReportDto,
  VoidedInvoicesReportDto,
} from '../dto/fiscal-reports.dto';
import {
  ExportSalesBookQueryDto,
  ExportZReportsQueryDto,
  SalesBookExportDto,
  ZReportsExportDto,
} from '../dto/sales-export.dto';
import {
  IDENTITY_JWT_CONFIG,
  type IdentityJwtConfig,
} from '../../identity/config/identity-jwt.config';

describe('ReportsController RBAC & Analytics & Fiscal & Export', () => {
  const jwtEnvironment = {
    NODE_ENV: 'test',
    JWT_SECRET: 'test-only-jwt-secret-with-at-least-thirty-two-bytes',
    JWT_ISSUER: 'omnifood-admin-test',
    JWT_AUDIENCE: 'omnifood-pos-test',
    JWT_ACCESS_TTL_SECONDS: '3600',
    JWT_REFRESH_TTL_SECONDS: '604800',
    JWT_CLOCK_TOLERANCE_SECONDS: '5',
    JWT_ALGORITHM: 'HS256',
  } as const;
  const identityJwtConfig: IdentityJwtConfig = {
    secret: jwtEnvironment.JWT_SECRET,
    issuer: jwtEnvironment.JWT_ISSUER,
    audience: jwtEnvironment.JWT_AUDIENCE,
    accessTokenTtlSeconds: Number(jwtEnvironment.JWT_ACCESS_TTL_SECONDS),
    refreshTokenTtlSeconds: Number(jwtEnvironment.JWT_REFRESH_TTL_SECONDS),
    clockToleranceSeconds: Number(jwtEnvironment.JWT_CLOCK_TOLERANCE_SECONDS),
    algorithm: jwtEnvironment.JWT_ALGORITHM,
  };
  let app: INestApplication;
  let mockSalesReportsService: {
    getDashboard: jest.Mock;
    getDashboardDailySeries: jest.Mock;
    getHourlySales: jest.Mock;
    getTopProducts: jest.Mock;
    getCashierPerformance: jest.Mock;
  };
  let mockFiscalReportsService: {
    getMonthlySummary: jest.Mock;
    getVoidedInvoices: jest.Mock;
    getSequenceAudit: jest.Mock;
  };
  let mockSalesExportService: {
    exportSalesBook: jest.Mock;
    exportZReports: jest.Mock;
    getXReport: jest.Mock;
    getZReport: jest.Mock;
  };

  beforeAll(async () => {
    mockSalesReportsService = {
      getDashboard: jest.fn().mockResolvedValue({
        grossSales: 5000,
        netTaxableSales: 4347.83,
        totalTax: 652.17,
        totalDiscounts: 100,
        invoiceCount: 10,
        ticketAverage: 500,
        paymentMethodsBreakdown: {
          cashNio: 2000,
          cashUsd: 50,
          cardNio: 3000,
          cardUsd: 0,
          other: 0,
          totalNio: 5000,
        },
        generatedAt: '2026-08-26T18:00:00.000Z',
      }),
      getDashboardDailySeries: jest.fn().mockResolvedValue({
        days: [
          {
            date: '2026-08-26',
            netSalesNio: 5000,
            completedTicketCount: 10,
            averageTicketNetNio: 500,
          },
        ],
        reportingPeriod: {
          timezone: 'America/Managua',
          localStartDate: '2026-08-26',
          localEndDate: '2026-08-27',
        },
        generatedAt: '2026-08-26T18:00:00.000Z',
      } satisfies DailySeriesReportDto),
      getHourlySales: jest.fn().mockResolvedValue({
        date: '2026-08-26',
        totalSales: 5000,
        totalInvoices: 10,
        generatedAt: '2026-08-26T18:00:00.000Z',
        hourly: [],
      }),
      getTopProducts: jest.fn().mockResolvedValue({
        generatedAt: '2026-08-26T18:00:00.000Z',
        products: [
          {
            productId: 'p-1',
            productName: 'Café',
            totalQuantity: 20,
            totalRevenue: 2000,
          },
        ],
      }),
      getCashierPerformance: jest.fn().mockResolvedValue({
        generatedAt: '2026-08-26T18:00:00.000Z',
        cashiers: [
          {
            userId: 'u-1',
            cashierName: 'Juan',
            invoiceCount: 10,
            totalSales: 5000,
            ticketAverage: 500,
          },
        ],
      }),
    };

    mockFiscalReportsService = {
      getMonthlySummary: jest.fn().mockResolvedValue({
        year: 2026,
        month: 8,
        totalGrossSales: 10000,
        totalTaxableSales: 8000,
        totalExemptSales: 2000,
        totalTaxCollected: 1200,
        totalCreditNotes: 500,
        totalCreditNotesTax: 75,
        netTaxableSales: 7575,
        netTaxPayable: 1125,
        invoiceCount: 20,
        creditNoteCount: 2,
        generatedAt: '2026-08-26T18:00:00.000Z',
      }),
      getVoidedInvoices: jest.fn().mockResolvedValue({
        totalVoidedCount: 1,
        totalVoidedAmount: 500,
        generatedAt: '2026-08-26T18:00:00.000Z',
        invoices: [],
      }),
      getSequenceAudit: jest.fn().mockResolvedValue({
        startSequence: 1,
        endSequence: 100,
        expectedCount: 100,
        actualCount: 100,
        missingSequences: [],
        duplicateSequences: [],
        hasGaps: false,
        series: [],
        generatedAt: '2026-08-26T18:00:00.000Z',
      }),
    };

    mockSalesExportService = {
      // G1 (issue #522 Finding 1): the X/Z handlers delegate to
      // SalesExportService; the mocks below resolve the 200-expecting RBAC
      // cases with a real response shape.
      getXReport: jest.fn().mockResolvedValue({
        generatedAt: '2026-08-26T18:00:00.000Z',
        closesShift: false,
        shifts: [
          {
            shiftId: 'shift-1',
            terminalId: 'POS-01',
            cashier: 'Juan',
            openedAt: '2026-08-26T08:00:00.000Z',
            status: 'OPEN',
            closesShift: false,
            initialFloatNio: 1000,
            initialFloatUsd: 50,
            cashMovements: {
              CASH_IN: { nio: 0, usd: 0, count: 0 },
              CASH_OUT: { nio: 0, usd: 0, count: 0 },
              PETTY_CASH: { nio: 0, usd: 0, count: 0 },
              SAFE_DROP: { nio: 0, usd: 0, count: 0 },
            },
            salesByMethod: {
              cashNio: 0,
              cardNio: 0,
              qrNio: 0,
              pointsNio: 0,
              otherNio: 0,
            },
            expectedCashNio: 1000,
            expectedCashUsd: 50,
          },
        ],
      }),
      getZReport: jest.fn().mockResolvedValue({
        startDate: '2026-08-26',
        endDate: '2026-08-26',
        generatedAt: '2026-08-26T18:00:00.000Z',
        totalRecords: 1,
        records: [
          {
            shiftId: 'shift-1',
            closedAt: '2026-08-26T17:00:00.000Z',
            openedAt: '2026-08-26T08:00:00.000Z',
            terminalId: 'POS-01',
            zSequence: 14,
            cashierName: 'Juan',
            initialFloatNio: 1000,
            initialFloatUsd: 50,
            expectedCashNio: 6500,
            expectedCashUsd: 120,
            finalCountedNio: 6500,
            finalCountedUsd: 120,
            differenceNio: 0,
            differenceUsd: 0,
            status: 'CLOSED',
            notes: null,
            supervisorId: 'sup-1',
            fiscalTotals: {
              totalGrossNio: 1650,
              totalTaxableNio: 1000,
              totalExemptNio: 500,
              totalTaxNio: 150,
            },
            blockedByUnreconciledPayments: false,
            unreconciledPaymentCount: 0,
          },
        ],
      }),
      exportSalesBook: jest
        .fn()
        .mockImplementation(
          (_tenantId: string, query?: ExportSalesBookQueryDto) => {
            const format = query?.format ?? 'json';
            if (format === 'csv') {
              return Promise.resolve({
                format: 'csv',
                filename: 'libro-ventas-dgi-2026-08-26.csv',
                contentType: 'text/csv; charset=utf-8',
                content:
                  '"Fecha","Numero Factura"\n"2026-08-26","001-001-01-00000001"',
                data: { totalRecords: 1, records: [] },
              });
            }
            if (format === 'xlsx') {
              return Promise.resolve({
                format: 'xlsx',
                filename: 'libro-ventas-dgi-2026-08-26.xlsx',
                contentType:
                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                buffer: Buffer.from('mock-xlsx-data'),
                data: { totalRecords: 1, records: [] },
              });
            }
            if (format === 'pdf') {
              return Promise.resolve({
                format: 'pdf',
                filename: 'libro-ventas-dgi-2026-08-26.pdf',
                contentType: 'application/pdf',
                buffer: Buffer.from('mock-pdf-data'),
                data: { totalRecords: 1, records: [] },
              });
            }
            return Promise.resolve({
              format: 'json',
              filename: 'libro-ventas-dgi-2026-08-26.json',
              contentType: 'application/json',
              data: {
                totalRecords: 1,
                totalGrossNio: 1150,
                totalTaxNio: 150,
                totalExemptNio: 0,
                records: [],
                generatedAt: '2026-08-26T18:00:00.000Z',
              },
            });
          },
        ),
      exportZReports: jest
        .fn()
        .mockImplementation(
          (_tenantId: string, query?: ExportZReportsQueryDto) => {
            const format = query?.format ?? 'json';
            if (format === 'csv') {
              return Promise.resolve({
                format: 'csv',
                filename: 'resumen-cortes-z-2026-08-26.csv',
                contentType: 'text/csv; charset=utf-8',
                content: '"ID Turno","Terminal"\n"shift-1","POS-01"',
                data: { totalRecords: 1, records: [] },
              });
            }
            if (format === 'xlsx') {
              return Promise.resolve({
                format: 'xlsx',
                filename: 'resumen-cortes-z-2026-08-26.xlsx',
                contentType:
                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                buffer: Buffer.from('mock-xlsx-z-data'),
                data: { totalRecords: 1, records: [] },
              });
            }
            if (format === 'pdf') {
              return Promise.resolve({
                format: 'pdf',
                filename: 'resumen-cortes-z-2026-08-26.pdf',
                contentType: 'application/pdf',
                buffer: Buffer.from('mock-pdf-z-data'),
                data: { totalRecords: 1, records: [] },
              });
            }
            return Promise.resolve({
              format: 'json',
              filename: 'resumen-cortes-z-2026-08-26.json',
              contentType: 'application/json',
              data: {
                totalRecords: 1,
                records: [],
                generatedAt: '2026-08-26T18:00:00.000Z',
              },
            });
          },
        ),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: jwtEnvironment.JWT_SECRET,
          signOptions: {
            algorithm: jwtEnvironment.JWT_ALGORITHM,
            issuer: jwtEnvironment.JWT_ISSUER,
            audience: jwtEnvironment.JWT_AUDIENCE,
          },
        }),
      ],
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
        {
          provide: SalesReportsService,
          useValue: mockSalesReportsService,
        },
        {
          provide: FiscalReportsService,
          useValue: mockFiscalReportsService,
        },
        {
          provide: SalesExportService,
          useValue: mockSalesExportService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: keyof typeof jwtEnvironment) => jwtEnvironment[key],
          },
        },
        {
          provide: IDENTITY_JWT_CONFIG,
          useValue: identityJwtConfig,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const signToken = (jwtService: JwtService, role: UserRole) =>
    jwtService.sign({
      sub: 'user-1',
      email: 'manager@example.com',
      role,
      tenant_id: 'tenant-1',
      is_active: true,
      token_type: 'access',
      security_version: 1,
    });

  const getHttpServer = (): Parameters<typeof request>[0] =>
    app.getHttpServer() as Parameters<typeof request>[0];

  it('requires authoritative authorization before role checks on X and Z reports', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ReportsController)).toEqual([
      AuthGuard,
      AuthoritativeCurrentUserGuard,
      RolesGuard,
    ]);
  });

  it('returns 403 for CASHIER role on X report route', async () => {
    const jwtService = app.get(JwtService);
    await request(getHttpServer())
      .get('/sales/reports/x')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.CASHIER)}`)
      .expect(403);
  });

  it('returns 403 for WAITER role on Z report route', async () => {
    const jwtService = app.get(JwtService);
    await request(getHttpServer())
      .get('/sales/reports/z')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.WAITER)}`)
      .expect(403);
  });

  it('allows MANAGER on X report route', async () => {
    const jwtService = app.get(JwtService);
    await request(getHttpServer())
      .get('/sales/reports/x')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.MANAGER)}`)
      .expect(200);
  });

  // G1 (issue #522 Finding 1): /x and /z are real fiscal reports, not
  // literal stubs — the 200 cases must resolve a real response shape and
  // reach the service with the tenant id from TenantInterceptor.
  it('serves the real Corte X reading to MANAGER with an explicit non-closing marker', async () => {
    const jwtService = app.get(JwtService);
    const response = await request(getHttpServer())
      .get('/sales/reports/x?terminalId=POS-01')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.MANAGER)}`)
      .expect(200);

    const body = response.body as {
      status?: string;
      closesShift: boolean;
      shifts: unknown[];
    };
    expect(body.status).toBeUndefined();
    expect(body.closesShift).toBe(false);
    expect(body.shifts).toHaveLength(1);
    expect(mockSalesExportService.getXReport).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ terminalId: 'POS-01' }) as unknown,
    );
  });

  it('serves the real Corte Z close view to OWNER with the Z row and fiscal totals', async () => {
    const jwtService = app.get(JwtService);
    const response = await request(getHttpServer())
      .get('/sales/reports/z?startDate=2026-08-26&endDate=2026-08-26')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.OWNER)}`)
      .expect(200);

    const body = response.body as {
      status?: string;
      totalRecords: number;
      records: Array<{ shiftId: string; zSequence: number | null }>;
    };
    expect(body.status).toBeUndefined();
    expect(body.totalRecords).toBe(1);
    expect(body.records[0].shiftId).toBe('shift-1');
    expect(body.records[0].zSequence).toBe(14);
    expect(mockSalesExportService.getZReport).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        startDate: '2026-08-26',
        endDate: '2026-08-26',
      }) as unknown,
    );
  });

  it('returns 403 for CASHIER on dashboard endpoint', async () => {
    const jwtService = app.get(JwtService);
    await request(getHttpServer())
      .get('/sales/reports/dashboard')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.CASHIER)}`)
      .expect(403);
  });

  it('allows MANAGER on dashboard/daily-series endpoint and returns the series', async () => {
    const jwtService = app.get(JwtService);
    const response = await request(getHttpServer())
      .get(
        '/sales/reports/dashboard/daily-series?startDate=2026-08-01&endDate=2026-08-02',
      )
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.MANAGER)}`)
      .expect(200);

    const body = response.body as DailySeriesReportDto;
    expect(body.days[0].date).toBe('2026-08-26');
    expect(body.reportingPeriod.timezone).toBe('America/Managua');
    expect(
      mockSalesReportsService.getDashboardDailySeries,
    ).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        startDate: '2026-08-01',
        endDate: '2026-08-02',
      }) as unknown,
    );
  });

  it('returns 403 for CASHIER on dashboard/daily-series endpoint', async () => {
    const jwtService = app.get(JwtService);
    await request(getHttpServer())
      .get('/sales/reports/dashboard/daily-series')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.CASHIER)}`)
      .expect(403);
  });

  it('passes a BadRequestException from the daily-series service through as 400', async () => {
    const jwtService = app.get(JwtService);
    mockSalesReportsService.getDashboardDailySeries.mockRejectedValueOnce(
      new BadRequestException(
        'Daily series supports a 2-60 day range; got 1 day(s).',
      ),
    );

    await request(getHttpServer())
      .get('/sales/reports/dashboard/daily-series?startDate=2026-08-26')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.MANAGER)}`)
      .expect(400);
  });

  it('allows MANAGER on dashboard endpoint and returns report', async () => {
    const jwtService = app.get(JwtService);
    const response = await request(getHttpServer())
      .get('/sales/reports/dashboard?startDate=2026-08-01&endDate=2026-08-26')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.MANAGER)}`)
      .expect(200);

    const body = response.body as SalesDashboardReportDto;
    expect(body.grossSales).toBe(5000);
    expect(mockSalesReportsService.getDashboard).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        startDate: '2026-08-01',
        endDate: '2026-08-26',
      }) as unknown,
    );
  });

  it('allows OWNER on hourly-sales endpoint and returns report', async () => {
    const jwtService = app.get(JwtService);
    const response = await request(getHttpServer())
      .get('/sales/reports/hourly-sales?date=2026-08-26')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.OWNER)}`)
      .expect(200);

    const body = response.body as HourlySalesReportDto;
    expect(body.totalSales).toBe(5000);
    expect(mockSalesReportsService.getHourlySales).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ date: '2026-08-26' }) as unknown,
    );
  });

  it('allows MANAGER on top-products endpoint and returns report', async () => {
    const jwtService = app.get(JwtService);
    const response = await request(getHttpServer())
      .get('/sales/reports/top-products?limit=5')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.MANAGER)}`)
      .expect(200);

    const body = response.body as TopProductsReportDto;
    expect(body.products).toHaveLength(1);
    expect(mockSalesReportsService.getTopProducts).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ limit: '5' }) as unknown,
    );
  });

  it('allows MANAGER on cashier-performance endpoint and returns report', async () => {
    const jwtService = app.get(JwtService);
    const response = await request(getHttpServer())
      .get('/sales/reports/cashier-performance')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.MANAGER)}`)
      .expect(200);

    const body = response.body as CashierPerformanceReportDto;
    expect(body.cashiers).toHaveLength(1);
    expect(mockSalesReportsService.getCashierPerformance).toHaveBeenCalledWith(
      'tenant-1',
      expect.any(Object) as unknown,
    );
  });

  it('allows MANAGER on fiscal/monthly-summary endpoint', async () => {
    const jwtService = app.get(JwtService);
    const response = await request(getHttpServer())
      .get('/sales/reports/fiscal/monthly-summary?year=2026&month=8')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.MANAGER)}`)
      .expect(200);

    const body = response.body as MonthlyFiscalSummaryReportDto;
    expect(body.totalGrossSales).toBe(10000);
    expect(mockFiscalReportsService.getMonthlySummary).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ year: '2026', month: '8' }) as unknown,
    );
  });

  it('allows OWNER on fiscal/voided-invoices endpoint', async () => {
    const jwtService = app.get(JwtService);
    const response = await request(getHttpServer())
      .get('/sales/reports/fiscal/voided-invoices')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.OWNER)}`)
      .expect(200);

    const body = response.body as VoidedInvoicesReportDto;
    expect(body.totalVoidedCount).toBe(1);
    expect(mockFiscalReportsService.getVoidedInvoices).toHaveBeenCalledWith(
      'tenant-1',
      expect.any(Object) as unknown,
    );
  });

  it('allows MANAGER on fiscal/sequence-audit endpoint', async () => {
    const jwtService = app.get(JwtService);
    const response = await request(getHttpServer())
      .get('/sales/reports/fiscal/sequence-audit?terminalId=001-001')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.MANAGER)}`)
      .expect(200);

    const body = response.body as FiscalSequenceAuditReportDto;
    expect(body.expectedCount).toBe(100);
    expect(mockFiscalReportsService.getSequenceAudit).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ terminalId: '001-001' }) as unknown,
    );
  });

  it('allows MANAGER on export/sales-book endpoint in JSON, CSV, XLSX, PDF formats', async () => {
    const jwtService = app.get(JwtService);

    // JSON
    const responseJson = await request(getHttpServer())
      .get(
        '/sales/reports/export/sales-book?startDate=2026-08-01&endDate=2026-08-26&format=json',
      )
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.MANAGER)}`)
      .expect(200);

    const body = responseJson.body as SalesBookExportDto;
    expect(body.totalRecords).toBe(1);
    expect(body.totalGrossNio).toBe(1150);

    // CSV
    const responseCsv = await request(getHttpServer())
      .get('/sales/reports/export/sales-book?format=csv')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.MANAGER)}`)
      .expect(200);

    expect(responseCsv.headers['content-type']).toContain('text/csv');
    expect(responseCsv.headers['content-disposition']).toContain(
      'attachment; filename=',
    );

    // XLSX
    const responseXlsx = await request(getHttpServer())
      .get('/sales/reports/export/sales-book?format=xlsx')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.MANAGER)}`)
      .expect(200);

    expect(responseXlsx.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(responseXlsx.headers['content-disposition']).toContain('.xlsx');

    // PDF
    const responsePdf = await request(getHttpServer())
      .get('/sales/reports/export/sales-book?format=pdf')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.MANAGER)}`)
      .expect(200);

    expect(responsePdf.headers['content-type']).toContain('application/pdf');
    expect(responsePdf.headers['content-disposition']).toContain('.pdf');
  });

  it('allows MANAGER on export/z-reports endpoint in JSON, CSV, XLSX, PDF formats', async () => {
    const jwtService = app.get(JwtService);

    // JSON
    const responseJson = await request(getHttpServer())
      .get('/sales/reports/export/z-reports?format=json')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.MANAGER)}`)
      .expect(200);

    const body = responseJson.body as ZReportsExportDto;
    expect(body.totalRecords).toBe(1);

    // CSV
    const responseCsv = await request(getHttpServer())
      .get('/sales/reports/export/z-reports?format=csv')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.MANAGER)}`)
      .expect(200);

    expect(responseCsv.headers['content-type']).toContain('text/csv');

    // XLSX
    const responseXlsx = await request(getHttpServer())
      .get('/sales/reports/export/z-reports?format=xlsx')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.MANAGER)}`)
      .expect(200);

    expect(responseXlsx.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(responseXlsx.headers['content-disposition']).toContain('.xlsx');

    // PDF
    const responsePdf = await request(getHttpServer())
      .get('/sales/reports/export/z-reports?format=pdf')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.MANAGER)}`)
      .expect(200);

    expect(responsePdf.headers['content-type']).toContain('application/pdf');
    expect(responsePdf.headers['content-disposition']).toContain('.pdf');
  });
});
