import { Test, TestingModule } from '@nestjs/testing';
import { InventoryReportsController } from './inventory-reports.controller';
import { InventoryReportsService } from '../services/inventory-reports.service';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { MovementType } from '../entities/inventory-movement.entity';

import { AuthGuard } from '../../identity/guards/auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';

describe('InventoryReportsController', () => {
  let controller: InventoryReportsController;
  let service: jest.Mocked<InventoryReportsService>;
  const jwtSecret = 'test-only-jwt-secret-with-at-least-thirty-two-bytes';

  beforeEach(async () => {
    service = {
      getValuationReport: jest.fn(),
      getCogsReport: jest.fn(),
      getKardexReport: jest.fn(),
      getAlertsSummaryReport: jest.fn(),
    } as unknown as jest.Mocked<InventoryReportsService>;

    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: jwtSecret })],
      controllers: [InventoryReportsController],
      providers: [
        {
          provide: InventoryReportsService,
          useValue: service,
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
        Reflector,
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<InventoryReportsController>(
      InventoryReportsController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates valuation report retrieval to InventoryReportsService with tenant context', async () => {
    const mockReport = {
      totalValuationNio: 5000,
      totalItemsCount: 10,
      itemsWithStockCount: 8,
      itemsLowStockCount: 2,
      itemsNegativeStockCount: 0,
      generatedAt: '2026-08-24T10:00:00Z',
      items: [],
    };
    service.getValuationReport.mockResolvedValue(mockReport);

    const result = await controller.getValuationReport('tenant-1');

    expect(service.getValuationReport).toHaveBeenCalledWith('tenant-1');
    expect(result).toBe(mockReport);
  });

  it('delegates COGS report retrieval to InventoryReportsService with tenant context and date filters', async () => {
    const mockCogs = {
      fromDate: '2026-08-01T00:00:00.000Z',
      toDate: '2026-08-31T23:59:59.999Z',
      totalCogsNio: 1500,
      salesCogsNio: 1300,
      shrinkageCogsNio: 200,
      generatedAt: '2026-08-24T10:00:00Z',
      items: [],
    };
    service.getCogsReport.mockResolvedValue(mockCogs);

    const result = await controller.getCogsReport(
      'tenant-1',
      '2026-08-01',
      '2026-08-31',
    );

    expect(service.getCogsReport).toHaveBeenCalledWith(
      'tenant-1',
      '2026-08-01',
      '2026-08-31',
    );
    expect(result).toBe(mockCogs);
  });

  it('delegates Kardex report retrieval to InventoryReportsService with multi-filters and pagination', async () => {
    const mockKardex = {
      totalCount: 1,
      filters: {
        from: '2026-08-01',
        to: '2026-08-31',
        insumoId: 'ins-1',
        type: MovementType.PURCHASE,
      },
      generatedAt: '2026-08-24T10:00:00Z',
      movements: [],
    };
    service.getKardexReport.mockResolvedValue(mockKardex);

    const result = await controller.getKardexReport(
      'tenant-1',
      '2026-08-01',
      '2026-08-31',
      'ins-1',
      MovementType.PURCHASE,
      undefined,
      100,
      0,
    );

    expect(service.getKardexReport).toHaveBeenCalledWith('tenant-1', {
      from: '2026-08-01',
      to: '2026-08-31',
      insumoId: 'ins-1',
      type: MovementType.PURCHASE,
      warehouseId: undefined,
      limit: 100,
      offset: 0,
    });
    expect(result).toBe(mockKardex);
  });

  it('delegates alerts summary report retrieval to InventoryReportsService with tenant context', async () => {
    const mockAlerts = {
      totalAlertsCount: 2,
      criticalCount: 1,
      warningCount: 1,
      negativeCount: 0,
      generatedAt: '2026-08-24T10:00:00Z',
      alerts: [],
    };
    service.getAlertsSummaryReport.mockResolvedValue(mockAlerts);

    const result = await controller.getAlertsSummaryReport('tenant-1');

    expect(service.getAlertsSummaryReport).toHaveBeenCalledWith('tenant-1');
    expect(result).toBe(mockAlerts);
  });
});
