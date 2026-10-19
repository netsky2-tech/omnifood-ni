import { Test, TestingModule } from '@nestjs/testing';
import { StreamableFile } from '@nestjs/common';
import { InventoryReportsController } from './inventory-reports.controller';
import { InventoryReportsService } from '../services/inventory-reports.service';
import { CountSessionPrintableService } from '../services/count-session-printable.service';
import { InventoryValuationService } from '../inventory-valuation.service';
import { TheoreticalCostService } from '../services/theoretical-cost.service';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { MovementType } from '../entities/inventory-movement.entity';

import { AuthGuard } from '../../identity/guards/auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';

describe('InventoryReportsController', () => {
  let controller: InventoryReportsController;
  let service: jest.Mocked<InventoryReportsService>;
  let valuationService: jest.Mocked<InventoryValuationService>;
  let theoreticalCostService: jest.Mocked<TheoreticalCostService>;
  const jwtSecret = 'test-only-jwt-secret-with-at-least-thirty-two-bytes';

  beforeEach(async () => {
    service = {
      getValuationReport: jest.fn(),
      getCogsReport: jest.fn(),
      getKardexReport: jest.fn(),
      getAlertsSummaryReport: jest.fn(),
    } as unknown as jest.Mocked<InventoryReportsService>;

    const printableService = {
      buildPrintableCountList: jest.fn(),
    } as unknown as jest.Mocked<CountSessionPrintableService>;

    valuationService = {
      setMarketPrice: jest.fn(),
      applyLowerOfCostWritedown: jest.fn(),
    } as unknown as jest.Mocked<InventoryValuationService>;

    theoreticalCostService = {
      getProductTheoreticalCost: jest.fn(),
      listDishMargins: jest.fn(),
    } as unknown as jest.Mocked<TheoreticalCostService>;

    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: jwtSecret })],
      controllers: [InventoryReportsController],
      providers: [
        {
          provide: InventoryReportsService,
          useValue: service,
        },
        {
          provide: CountSessionPrintableService,
          useValue: printableService,
        },
        {
          provide: InventoryValuationService,
          useValue: valuationService,
        },
        {
          provide: TheoreticalCostService,
          useValue: theoreticalCostService,
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

  describe('GET count-sessions/:sessionId/printable-list (R19 T3)', () => {
    const getPrintableService = (): jest.Mocked<CountSessionPrintableService> =>
      (
        controller as unknown as {
          countSessionPrintableService: jest.Mocked<CountSessionPrintableService>;
        }
      ).countSessionPrintableService;

    it('returns the PDF as a StreamableFile with the printable headers (R13)', async () => {
      const buffer = Buffer.from('%PDF-fake');
      getPrintableService().buildPrintableCountList.mockResolvedValue({
        buffer,
        contentType: 'application/pdf',
        filename: 'conteo-fisico-CS-001.pdf',
      });

      // The route returns a StreamableFile (Nest streams the raw bytes and
      // stamps the headers itself). A plain Buffer return was the V12-1
      // defect: with a passthrough @Res it got JSON-serialized on the wire.
      const result = await controller.getCountSessionPrintableList(
        'tenant-1',
        'CS/001',
      );

      expect(
        getPrintableService().buildPrintableCountList,
      ).toHaveBeenCalledWith('tenant-1', 'CS/001');
      expect(result).toBeInstanceOf(StreamableFile);
      expect(result.getStream().read()).toEqual(buffer);
      expect(result.options.type).toBe('application/pdf');
      expect(result.options.disposition).toBe(
        'inline; filename="conteo-fisico-CS-001.pdf"',
      );
    });
  });

  it('delegates COGS report retrieval to InventoryReportsService with tenant context and date filters', async () => {
    const mockCogs = {
      fromDate: '2026-08-01T00:00:00.000Z',
      toDate: '2026-08-31T23:59:59.999Z',
      totalCogsNio: 1500,
      salesCogsNio: 1300,
      shrinkageCogsNio: 200,
      // Coherent with the fixture's real COGS: a fully costed period with
      // actual sales, so the fixture exercises the contract field instead
      // of degenerating to the empty-period COMPLETE/0/0 shape.
      inventoryCoverage: {
        status: 'COMPLETE' as const,
        costedSalesCount: 24,
        uncostedSalesCount: 0,
      },
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

  it('delegates the market-price upsert to InventoryValuationService (R12)', async () => {
    const saved = {
      id: 'mp-1',
      insumo_id: 'ins-1',
      market_price_nio: 250,
    };
    valuationService.setMarketPrice.mockResolvedValue(saved as never);

    const result = await controller.setMarketPrice('tenant-1', {
      insumoId: 'ins-1',
      marketPriceNio: 250,
      effectiveDate: '2026-10-15',
      sourceNote: 'proveedor',
    });

    expect(valuationService.setMarketPrice).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      insumoId: 'ins-1',
      marketPriceNio: 250,
      effectiveDate: '2026-10-15',
      sourceNote: 'proveedor',
    });
    expect(result).toBe(saved);
  });

  it('defaults the market-price note to null when omitted (R12)', async () => {
    valuationService.setMarketPrice.mockResolvedValue({} as never);

    await controller.setMarketPrice('tenant-1', {
      insumoId: 'ins-1',
      marketPriceNio: 10,
      effectiveDate: '2026-10-15',
    });

    expect(valuationService.setMarketPrice).toHaveBeenCalledWith(
      expect.objectContaining({ sourceNote: null }),
    );
  });

  it('delegates the lower-of-cost writedown to InventoryValuationService (R12)', async () => {
    const writedown = {
      asOfDate: '2026-10-31',
      lines: [],
      totalWritedownNio: 0,
      skippedExisting: [],
      notAboveReference: [],
      withoutReference: [],
    };
    valuationService.applyLowerOfCostWritedown.mockResolvedValue(
      writedown as never,
    );

    const returned = await controller.applyValuationWritedown('tenant-1', {
      asOfDate: '2026-10-31',
    });

    expect(valuationService.applyLowerOfCostWritedown).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      asOfDate: '2026-10-31',
    });
    expect(returned).toBe(writedown);
  });

  it('delegates the per-dish margins list to TheoreticalCostService (R8)', async () => {
    const margins = { dishes: [], skipped: [] };
    theoreticalCostService.listDishMargins.mockResolvedValue(margins as never);

    // R28 / M5: the period of the second figure ("what it actually cost")
    // travels to the service.
    const result = await controller.getDishMargins(
      'tenant-1',
      '2026-10-01',
      '2026-10-19',
    );

    expect(theoreticalCostService.listDishMargins).toHaveBeenCalledWith(
      'tenant-1',
      { from: '2026-10-01', to: '2026-10-19' },
    );
    expect(result).toBe(margins);
  });

  it('delegates one product theoretical cost to TheoreticalCostService (R8)', async () => {
    const margin = { productId: 'prod-1', unitTheoreticalCostNio: 12 };
    theoreticalCostService.getProductTheoreticalCost.mockResolvedValue(
      margin as never,
    );

    const result = await controller.getTheoreticalCost('tenant-1', 'prod-1');

    expect(theoreticalCostService.getProductTheoreticalCost).toHaveBeenCalledWith(
      'tenant-1',
      'prod-1',
    );
    expect(result).toBe(margin);
  });
});
