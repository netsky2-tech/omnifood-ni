import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InventoryReportsService } from './inventory-reports.service';
import { Insumo } from '../entities/insumo.entity';
import {
  InventoryMovement,
  MovementType,
} from '../entities/inventory-movement.entity';

describe('InventoryReportsService', () => {
  let service: InventoryReportsService;
  let insumoRepo: jest.Mocked<Repository<Insumo>>;
  let movementRepo: jest.Mocked<Repository<InventoryMovement>>;

  beforeEach(async () => {
    insumoRepo = {
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<Insumo>>;

    movementRepo = {
      createQueryBuilder: jest.fn(),
    } as unknown as jest.Mocked<Repository<InventoryMovement>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryReportsService,
        {
          provide: getRepositoryToken(Insumo),
          useValue: insumoRepo,
        },
        {
          provide: getRepositoryToken(InventoryMovement),
          useValue: movementRepo,
        },
      ],
    }).compile();

    service = module.get<InventoryReportsService>(InventoryReportsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getValuationReport', () => {
    it('calculates inventory valuation report accurately across items with various stock levels', async () => {
      const mockInsumos: Partial<Insumo>[] = [
        {
          id: 'ins-1',
          name: 'Café Grano',
          consumptionUom: 'kg',
          warehouse_id: 'wh-main',
          is_perishable: true,
          stock: 10.5,
          averageCost: 120.0,
          minStock: 5.0,
          maxStock: 50.0,
          parLevel: 20.0,
          is_active: true,
        },
        {
          id: 'ins-2',
          name: 'Leche Entera',
          consumptionUom: 'lt',
          warehouse_id: 'wh-main',
          is_perishable: true,
          stock: 3.0,
          averageCost: 35.5,
          minStock: 5.0, // Low stock!
          maxStock: 30.0,
          parLevel: 15.0,
          is_active: true,
        },
        {
          id: 'ins-3',
          name: 'Azúcar',
          consumptionUom: 'kg',
          warehouse_id: 'wh-main',
          is_perishable: false,
          stock: -2.0, // Negative stock!
          averageCost: 25.0,
          minStock: 1.0,
          maxStock: 20.0,
          parLevel: 5.0,
          is_active: true,
        },
        {
          id: 'ins-4',
          name: 'Vasos 8oz',
          consumptionUom: 'unit',
          warehouse_id: 'wh-main',
          is_perishable: false,
          stock: 0.0, // Zero stock!
          averageCost: 2.5,
          minStock: 10.0,
          is_active: true,
        },
      ];

      insumoRepo.find.mockResolvedValue(mockInsumos as Insumo[]);

      const report = await service.getValuationReport('tenant-1');

      expect(report.totalItemsCount).toBe(4);
      expect(report.itemsWithStockCount).toBe(2); // ins-1 and ins-2
      expect(report.itemsLowStockCount).toBe(3); // ins-2 (3 <= 5), ins-3 (-2 <= 1), ins-4 (0 <= 10)
      expect(report.itemsNegativeStockCount).toBe(1); // ins-3 (-2 < 0)

      // Valuation = (10.5 * 120 = 1260) + (3 * 35.5 = 106.5) = 1366.5000
      expect(report.totalValuationNio).toBe(1366.5);

      expect(report.items).toHaveLength(4);
      expect(report.items[0]).toEqual({
        id: 'ins-1',
        name: 'Café Grano',
        consumptionUom: 'kg',
        warehouseId: 'wh-main',
        isPerishable: true,
        stock: 10.5,
        averageCostNio: 120.0,
        totalValuationNio: 1260.0,
        stockMin: 5.0,
        stockMax: 50.0,
        parLevel: 20.0,
        isLowStock: false,
        isNegativeStock: false,
      });
      expect(report.items[1].isLowStock).toBe(true);
      expect(report.items[2].isNegativeStock).toBe(true);
    });

    it('returns empty summary when tenant has no active insumos', async () => {
      insumoRepo.find.mockResolvedValue([]);

      const report = await service.getValuationReport('tenant-empty');

      expect(report.totalValuationNio).toBe(0);
      expect(report.totalItemsCount).toBe(0);
      expect(report.itemsWithStockCount).toBe(0);
      expect(report.itemsLowStockCount).toBe(0);
      expect(report.itemsNegativeStockCount).toBe(0);
      expect(report.items).toEqual([]);
    });
  });

  describe('getCogsReport', () => {
    it('aggregates sales and shrinkage COGS and deducts cancellations/returns', async () => {
      const mockInsumos: Partial<Insumo>[] = [
        {
          id: 'ins-coffee',
          name: 'Café Grano',
          consumptionUom: 'kg',
        },
        {
          id: 'ins-milk',
          name: 'Leche',
          consumptionUom: 'lt',
        },
      ];
      insumoRepo.find.mockResolvedValue(mockInsumos as Insumo[]);

      const mockMovements: Partial<InventoryMovement>[] = [
        // 1. Sale: 2kg coffee at C$ 100/kg -> 200
        {
          insumoId: 'ins-coffee',
          type: MovementType.SALE,
          quantity: -2,
          unitCostNio: 100,
          totalCostNio: 200,
        },
        // 2. Sale Cancel: 0.5kg coffee at C$ 100/kg -> -50
        {
          insumoId: 'ins-coffee',
          type: MovementType.SALE_CANCEL,
          quantity: 0.5,
          unitCostNio: 100,
          totalCostNio: 50,
        },
        // 3. Shrinkage: 1lt milk at C$ 30/lt -> 30
        {
          insumoId: 'ins-milk',
          type: MovementType.SHRINKAGE,
          quantity: -1,
          unitCostNio: 30,
          totalCostNio: 30,
        },
      ];

      const qb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockMovements),
      };
      movementRepo.createQueryBuilder.mockReturnValue(qb);

      const report = await service.getCogsReport(
        'tenant-1',
        '2026-08-01',
        '2026-08-31',
      );

      // Coffee: 2 - 0.5 = 1.5kg, cost = 200 - 50 = 150
      // Milk: 1lt, shrinkage cost = 30
      // Total COGS = 150 (sales) + 30 (shrinkage) = 180
      expect(report.salesCogsNio).toBe(150);
      expect(report.shrinkageCogsNio).toBe(30);
      expect(report.totalCogsNio).toBe(180);

      expect(report.items).toHaveLength(2);
      expect(report.items[0]).toEqual({
        insumoId: 'ins-coffee',
        insumoName: 'Café Grano',
        consumptionUom: 'kg',
        salesQuantity: 1.5,
        salesCostNio: 150,
        shrinkageQuantity: 0,
        shrinkageCostNio: 0,
        totalQuantity: 1.5,
        totalCostNio: 150,
        costPercentage: 83.3333,
      });
      expect(report.items[1]).toEqual({
        insumoId: 'ins-milk',
        insumoName: 'Leche',
        consumptionUom: 'lt',
        salesQuantity: 0,
        salesCostNio: 0,
        shrinkageQuantity: 1,
        shrinkageCostNio: 30,
        totalQuantity: 1,
        totalCostNio: 30,
        costPercentage: 16.6667,
      });
    });
  });

  describe('getKardexReport', () => {
    it('queries and maps movements with multi-filters and pagination', async () => {
      const mockInsumos: Partial<Insumo>[] = [
        {
          id: 'ins-coffee',
          name: 'Café Grano',
          consumptionUom: 'kg',
        },
      ];
      insumoRepo.find.mockResolvedValue(mockInsumos as Insumo[]);

      const mockCreatedAt = new Date('2026-08-20T10:30:00Z');
      const mockMovements: Partial<InventoryMovement>[] = [
        {
          id: 'mov-100',
          insumoId: 'ins-coffee',
          type: MovementType.PURCHASE,
          quantity: 10,
          previousStock: 0,
          newStock: 10,
          unitCostNio: 100,
          totalCostNio: 1000,
          averageCostAfterNio: 100,
          reason: 'Compra Factura 001-002-12345',
          sourceDocumentType: 'PURCHASE',
          sourceDocumentId: 'pur-1',
          timestamp: mockCreatedAt,
        },
      ];

      const qb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockMovements, 1]),
      };
      movementRepo.createQueryBuilder.mockReturnValue(qb);

      const report = await service.getKardexReport('tenant-1', {
        from: '2026-08-01',
        to: '2026-08-31',
        insumoId: 'ins-coffee',
        type: MovementType.PURCHASE,
        limit: 50,
      });

      expect(report.totalCount).toBe(1);
      expect(report.filters.insumoId).toBe('ins-coffee');
      expect(report.filters.type).toBe(MovementType.PURCHASE);
      expect(report.movements).toHaveLength(1);
      expect(report.movements[0]).toEqual({
        id: 'mov-100',
        insumoId: 'ins-coffee',
        insumoName: 'Café Grano',
        consumptionUom: 'kg',
        type: MovementType.PURCHASE,
        quantity: 10,
        stockBefore: 0,
        stockAfter: 10,
        unitCostNio: 100,
        totalCostNio: 1000,
        averageCostAfterNio: 100,
        reason: 'Compra Factura 001-002-12345',
        sourceDocumentType: 'PURCHASE',
        sourceDocumentId: 'pur-1',
        createdAt: mockCreatedAt.toISOString(),
      });
    });
  });

  describe('getAlertsSummaryReport', () => {
    it('classifies CRITICAL, WARNING, and NEGATIVE_STOCK alerts and calculates suggested reorders', async () => {
      const mockInsumos: Partial<Insumo>[] = [
        {
          id: 'ins-healthy',
          name: 'Arroz',
          consumptionUom: 'kg',
          stock: 50.0,
          minStock: 10.0,
          parLevel: 60.0,
          is_active: true,
        },
        {
          id: 'ins-warning',
          name: 'Café Grano',
          consumptionUom: 'kg',
          stock: 4.0, // <= minStock (5.0) -> WARNING
          minStock: 5.0,
          parLevel: 20.0,
          is_active: true,
        },
        {
          id: 'ins-critical-zero',
          name: 'Vasos 8oz',
          consumptionUom: 'unit',
          stock: 0.0, // == 0 -> CRITICAL
          minStock: 50.0,
          parLevel: 200.0,
          is_active: true,
        },
        {
          id: 'ins-negative',
          name: 'Leche Entera',
          consumptionUom: 'lt',
          stock: -3.0, // < 0 -> NEGATIVE_STOCK
          minStock: 10.0,
          parLevel: 30.0,
          is_active: true,
        },
      ];

      insumoRepo.find.mockResolvedValue(mockInsumos as Insumo[]);

      const summary = await (service as any).getAlertsSummaryReport('tenant-1');

      expect(summary.totalAlertsCount).toBe(3);
      expect(summary.criticalCount).toBe(1);
      expect(summary.negativeCount).toBe(1);
      expect(summary.warningCount).toBe(1);

      expect(summary.alerts).toHaveLength(3);

      // Warning alert
      const warningAlert = summary.alerts.find((a: any) => a.insumoId === 'ins-warning');
      expect(warningAlert).toBeDefined();
      expect(warningAlert.severity).toBe('WARNING');
      expect(warningAlert.suggestedReorderQuantity).toBe(16.0); // 20 - 4

      // Critical alert
      const criticalAlert = summary.alerts.find((a: any) => a.insumoId === 'ins-critical-zero');
      expect(criticalAlert).toBeDefined();
      expect(criticalAlert.severity).toBe('CRITICAL');
      expect(criticalAlert.suggestedReorderQuantity).toBe(200.0); // 200 - 0

      // Negative stock alert
      const negativeAlert = summary.alerts.find((a: any) => a.insumoId === 'ins-negative');
      expect(negativeAlert).toBeDefined();
      expect(negativeAlert.severity).toBe('NEGATIVE_STOCK');
      expect(negativeAlert.suggestedReorderQuantity).toBe(33.0); // 30 - (-3)
    });

    it('returns empty alert list and 0 counts when all insumos are above minStock', async () => {
      const mockInsumos: Partial<Insumo>[] = [
        {
          id: 'ins-1',
          name: 'Insumo Óptimo',
          stock: 100.0,
          minStock: 20.0,
          is_active: true,
        },
      ];
      insumoRepo.find.mockResolvedValue(mockInsumos as Insumo[]);

      const summary = await (service as any).getAlertsSummaryReport('tenant-1');

      expect(summary.totalAlertsCount).toBe(0);
      expect(summary.criticalCount).toBe(0);
      expect(summary.warningCount).toBe(0);
      expect(summary.negativeCount).toBe(0);
      expect(summary.alerts).toEqual([]);
    });
  });
});
