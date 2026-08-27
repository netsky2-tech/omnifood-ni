import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { ReportsController } from './reports.controller';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { UserRole } from '../../identity/entities/user.entity';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { SalesReportsService } from '../services/sales-reports.service';
import { FiscalReportsService } from '../services/fiscal-reports.service';
import { SalesExportService } from '../services/sales-export.service';
import {
  CashierPerformanceReportDto,
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

describe('ReportsController RBAC & Analytics & Fiscal & Export', () => {
  const jwtSecret = 'test-only-jwt-secret-with-at-least-thirty-two-bytes';
  let app: INestApplication;
  let mockSalesReportsService: {
    getDashboard: jest.Mock;
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
      imports: [JwtModule.register({ secret: jwtSecret })],
      controllers: [ReportsController],
      providers: [
        Reflector,
        RolesGuard,
        AuthGuard,
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
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const signToken = (jwtService: JwtService, role: UserRole) =>
    jwtService.sign(
      {
        sub: 'user-1',
        email: 'user@omnifood.ni',
        tenant_id: 'tenant-1',
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

  const getHttpServer = (): Parameters<typeof request>[0] =>
    app.getHttpServer() as Parameters<typeof request>[0];

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

  it('returns 403 for CASHIER on dashboard endpoint', async () => {
    const jwtService = app.get(JwtService);
    await request(getHttpServer())
      .get('/sales/reports/dashboard')
      .set('Authorization', `Bearer ${signToken(jwtService, UserRole.CASHIER)}`)
      .expect(403);
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
