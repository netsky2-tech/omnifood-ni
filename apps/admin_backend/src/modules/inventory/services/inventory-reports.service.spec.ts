import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../../core/database/tenant-transaction';
import { InventoryReportsService } from './inventory-reports.service';
import { Invoice } from '../../sales/entities/invoice.entity';
import { Insumo } from '../entities/insumo.entity';
import {
  InventoryMovement,
  MovementType,
} from '../entities/inventory-movement.entity';

describe('InventoryReportsService', () => {
  let service: InventoryReportsService;
  let insumoRepo: jest.Mocked<Repository<Insumo>>;
  let movementRepo: jest.Mocked<Repository<InventoryMovement>>;
  let invoiceRepo: { createQueryBuilder: jest.Mock };
  // Issue #512: the service must resolve its repositories from the
  // tenant-bound transaction manager, so the DataSource mock hands back a
  // manager exposing exactly those manager-scoped repositories.
  let txManager: {
    query: jest.Mock;
    getRepository: jest.Mock;
  };

  beforeEach(async () => {
    insumoRepo = {
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<Insumo>>;

    movementRepo = {
      createQueryBuilder: jest.fn(),
    } as unknown as jest.Mocked<Repository<InventoryMovement>>;

    invoiceRepo = {
      createQueryBuilder: jest.fn(),
    };

    txManager = {
      query: jest.fn().mockResolvedValue(undefined),
      getRepository: jest.fn().mockImplementation((entity: unknown) => {
        if (entity === Insumo) return insumoRepo;
        if (entity === InventoryMovement) return movementRepo;
        if (entity === Invoice) return invoiceRepo;
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryReportsService,
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn((cb: (mgr: unknown) => Promise<unknown>) =>
              cb(txManager),
            ),
          },
        },
      ],
    }).compile();

    service = module.get<InventoryReportsService>(InventoryReportsService);
  });

  it('binds the tenant context before the first report read (issue #512)', async () => {
    (insumoRepo.find as jest.Mock).mockResolvedValue([]);

    await service.getValuationReport('tenant-A');

    expect(txManager.query).toHaveBeenCalledWith(
      TENANT_CONTEXT_SET_CONFIG_SQL,
      ['tenant-A'],
    );
    expect(txManager.query.mock.invocationCallOrder[0]).toBeLessThan(
      (insumoRepo.find as jest.Mock).mock.invocationCallOrder[0],
    );
    expect(txManager.getRepository).toHaveBeenCalledWith(Insumo);
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
    // Mocks the tenant-scoped invoice query used for inventoryCoverage
    // evidence (relevant sales of the period).
    const mockSaleInvoices = (invoices: Partial<Invoice>[]) => {
      const invoiceQb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(invoices as Invoice[]),
      };
      invoiceRepo.createQueryBuilder.mockReturnValue(invoiceQb);
    };

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
      mockSaleInvoices([]);

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

    it('reports COMPLETE inventoryCoverage when every sale in the period is APPLIED', async () => {
      insumoRepo.find.mockResolvedValue([]);
      mockSaleInvoices([
        {
          id: 'inv-1',
          type: 'regular',
          isCanceled: false,
          inventoryOutcome: 'APPLIED',
        },
        {
          id: 'inv-2',
          type: 'regular',
          isCanceled: false,
          inventoryOutcome: 'APPLIED',
        },
      ]);

      const mockMovements: Partial<InventoryMovement>[] = [
        {
          insumoId: 'ins-coffee',
          type: MovementType.SALE,
          quantity: -2,
          unitCostNio: 100,
          totalCostNio: 200,
          sourceDocumentId: 'invoice:inv-1',
        },
        {
          insumoId: 'ins-milk',
          type: MovementType.SALE,
          quantity: -1,
          unitCostNio: 30,
          totalCostNio: 30,
          sourceDocumentId: 'invoice:inv-2',
        },
      ];
      const qb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockMovements),
      };
      movementRepo.createQueryBuilder.mockReturnValue(qb);

      const report = await service.getCogsReport('tenant-1');

      expect(report.inventoryCoverage).toEqual({
        status: 'COMPLETE',
        costedSalesCount: 2,
        uncostedSalesCount: 0,
      });
      // reasonCodes must be omitted entirely when there is nothing to flag.
      expect('reasonCodes' in report.inventoryCoverage).toBe(false);
    });

    it('reports PARTIAL inventoryCoverage with MISSING_INVENTORY_IMPACT when a sale is APPLIED_INVENTORY_PENDING', async () => {
      insumoRepo.find.mockResolvedValue([]);
      mockSaleInvoices([
        {
          id: 'inv-1',
          type: 'regular',
          isCanceled: false,
          inventoryOutcome: 'APPLIED',
        },
        {
          id: 'inv-2',
          type: 'regular',
          isCanceled: false,
          inventoryOutcome: 'APPLIED_INVENTORY_PENDING',
          inventoryOutcomeReason: { code: 'MISSING_PUBLISHED_RECIPE' },
        },
      ]);

      const mockMovements: Partial<InventoryMovement>[] = [
        {
          insumoId: 'ins-coffee',
          type: MovementType.SALE,
          quantity: -2,
          unitCostNio: 100,
          totalCostNio: 200,
          sourceDocumentId: 'invoice:inv-1',
        },
      ];
      const qb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockMovements),
      };
      movementRepo.createQueryBuilder.mockReturnValue(qb);

      const report = await service.getCogsReport('tenant-1');

      expect(report.inventoryCoverage).toEqual({
        status: 'PARTIAL',
        costedSalesCount: 1,
        uncostedSalesCount: 1,
        reasonCodes: ['MISSING_INVENTORY_IMPACT'],
      });
    });

    it('reports UNAVAILABLE inventoryCoverage with NO_EXPLICIT_INSUMO_MAPPING when all sales are APPLIED_NO_INVENTORY_IMPACT (WU11 policy flip)', async () => {
      insumoRepo.find.mockResolvedValue([]);
      mockSaleInvoices([
        {
          id: 'inv-1',
          type: 'regular',
          isCanceled: false,
          inventoryOutcome: 'APPLIED_NO_INVENTORY_IMPACT',
          inventoryOutcomeReason: { code: 'NO_EXPLICIT_INSUMO_MAPPING' },
        },
      ]);

      const qb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      movementRepo.createQueryBuilder.mockReturnValue(qb);

      const report = await service.getCogsReport('tenant-1');

      // WU11 owner decision: absence of an insumo mapping is NOT evidence
      // of zero cost, so the sale is uncosted under its own reason code.
      // This deliberately flips the previous "authoritative zero" policy
      // (the old spec asserted COMPLETE here); salesCogsNio stays
      // independent of coverage at 0 — never forced to null or 0.
      expect(report.salesCogsNio).toBe(0);
      expect(report.inventoryCoverage).toEqual({
        status: 'UNAVAILABLE',
        costedSalesCount: 0,
        uncostedSalesCount: 1,
        reasonCodes: ['NO_EXPLICIT_INSUMO_MAPPING'],
      });
    });

    it('pins the coverage invoice read to tenant, window and non-canceled rows (finding D3)', async () => {
      // Without this assertion a future edit that drops `inv.tenant_id` from
      // the coverage read would keep every existing test green: the mock
      // returns rows regardless of the WHERE clause. This is the only guard
      // that the read stays inside the tenant scope.
      insumoRepo.find.mockResolvedValue([]);
      const emptyMovements: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      movementRepo.createQueryBuilder.mockReturnValue(emptyMovements);
      mockSaleInvoices([]);

      await service.getCogsReport('tenant-42', '2026-08-01', '2026-08-31');

      const invoiceQb = (invoiceRepo.createQueryBuilder as jest.Mock).mock.results[0]
        .value as any;
      const predicates = [
        ...invoiceQb.where.mock.calls.map((c: any[]) => String(c[0])),
        ...invoiceQb.andWhere.mock.calls.map((c: any[]) => String(c[0])),
      ].join(' AND ');
      expect(predicates).toContain('inv.tenant_id = :tenantId');
      expect(predicates).toContain('inv.created_at BETWEEN :from AND :to');
      expect(predicates).toContain('inv.is_canceled = FALSE');
      expect(invoiceQb.where.mock.calls[0][1]).toEqual({ tenantId: 'tenant-42' });
    });

    it('labels an itemless APPLIED_NO_INVENTORY_IMPACT sale by its recorded reason, not by the outcome string (finding D6)', async () => {
      insumoRepo.find.mockResolvedValue([]);
      mockSaleInvoices([
        {
          id: 'inv-itemless',
          type: 'regular',
          isCanceled: false,
          inventoryOutcome: 'APPLIED_NO_INVENTORY_IMPACT',
          // sale-inventory-outcome.service.ts:330 short-circuits a sale with no
          // line items to this outcome with reason: null. That is NOT a mapping
          // gap — there is no product on the ticket to map — so telling the
          // tenant to "map the insumos of the product" is wrong guidance.
          inventoryOutcomeReason: null,
        },
      ]);
      const emptyMovements: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      movementRepo.createQueryBuilder.mockReturnValue(emptyMovements);

      const report = await service.getCogsReport('tenant-1');

      expect(report.inventoryCoverage).toEqual({
        status: 'UNAVAILABLE',
        costedSalesCount: 0,
        uncostedSalesCount: 1,
        reasonCodes: ['MISSING_COST_BASIS'],
      });
    });

    it('emits NO_EXPLICIT_INSUMO_MAPPING only when the invoice recorded that reason (finding D6)', async () => {
      insumoRepo.find.mockResolvedValue([]);
      mockSaleInvoices([
        {
          id: 'inv-mapping-gap',
          type: 'regular',
          isCanceled: false,
          inventoryOutcome: 'APPLIED_NO_INVENTORY_IMPACT',
          inventoryOutcomeReason: { code: 'NO_EXPLICIT_INSUMO_MAPPING', lines: ['line-1'] },
        },
      ]);
      const emptyMovements: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      movementRepo.createQueryBuilder.mockReturnValue(emptyMovements);

      const report = await service.getCogsReport('tenant-1');

      expect(report.inventoryCoverage?.reasonCodes).toEqual(['NO_EXPLICIT_INSUMO_MAPPING']);
    });

    it('reports PARTIAL inventoryCoverage mixing costed APPLIED sales and unmapped APPLIED_NO_INVENTORY_IMPACT sales without moving the money fields (WU11)', async () => {
      insumoRepo.find.mockResolvedValue([
        {
          id: 'ins-coffee',
          name: 'Café Grano',
          consumptionUom: 'kg',
        } as Insumo,
      ]);
      mockSaleInvoices([
        {
          id: 'inv-1',
          type: 'regular',
          isCanceled: false,
          inventoryOutcome: 'APPLIED',
        },
        {
          id: 'inv-2',
          type: 'regular',
          isCanceled: false,
          inventoryOutcome: 'APPLIED_NO_INVENTORY_IMPACT',
          inventoryOutcomeReason: { code: 'NO_EXPLICIT_INSUMO_MAPPING' },
        },
      ]);

      const mockMovements: Partial<InventoryMovement>[] = [
        {
          insumoId: 'ins-coffee',
          type: MovementType.SALE,
          quantity: -2,
          unitCostNio: 100,
          totalCostNio: 200,
          sourceDocumentId: 'invoice:inv-1',
        },
      ];
      const qb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockMovements),
      };
      movementRepo.createQueryBuilder.mockReturnValue(qb);

      const report = await service.getCogsReport('tenant-1');

      // Regression: coverage is trust evidence only — the money fields
      // keep their movement-derived values regardless of the flip.
      expect(report.salesCogsNio).toBe(200);
      expect(report.shrinkageCogsNio).toBe(0);
      expect(report.totalCogsNio).toBe(200);
      expect(report.inventoryCoverage).toEqual({
        status: 'PARTIAL',
        costedSalesCount: 1,
        uncostedSalesCount: 1,
        reasonCodes: ['NO_EXPLICIT_INSUMO_MAPPING'],
      });
    });

    it('excludes credit notes and canceled documents from coverage counts via the shared isCogsCoverageRelevantSale predicate (WU11)', async () => {
      insumoRepo.find.mockResolvedValue([]);
      mockSaleInvoices([
        {
          id: 'inv-1',
          type: 'regular',
          isCanceled: false,
          inventoryOutcome: 'APPLIED',
        },
        // A credit note with the WORST possible outcome fact: if it were
        // wrongly counted it would add UNRESOLVED_SOURCE_DOCUMENT and break
        // COMPLETE. It must not affect either count.
        {
          id: 'inv-cn',
          type: 'creditNote',
          isCanceled: false,
          inventoryOutcome: null,
        },
        // A canceled regular sale must equally stay out of the counts.
        {
          id: 'inv-void',
          type: 'regular',
          isCanceled: true,
          inventoryOutcome: null,
        },
      ]);

      const mockMovements: Partial<InventoryMovement>[] = [
        {
          insumoId: 'ins-coffee',
          type: MovementType.SALE,
          quantity: -2,
          unitCostNio: 100,
          totalCostNio: 200,
          sourceDocumentId: 'invoice:inv-1',
        },
      ];
      const qb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockMovements),
      };
      movementRepo.createQueryBuilder.mockReturnValue(qb);

      const report = await service.getCogsReport('tenant-1');

      expect(report.inventoryCoverage).toEqual({
        status: 'COMPLETE',
        costedSalesCount: 1,
        uncostedSalesCount: 0,
      });
      expect('reasonCodes' in report.inventoryCoverage).toBe(false);
    });

    it('emits deduplicated reasonCodes in the stable COVERAGE_REASON_CODE_ORDER (WU11)', async () => {
      insumoRepo.find.mockResolvedValue([]);
      mockSaleInvoices([
        {
          id: 'inv-1',
          type: 'regular',
          isCanceled: false,
          inventoryOutcome: 'APPLIED',
        },
        {
          id: 'inv-2',
          type: 'regular',
          isCanceled: false,
          inventoryOutcome: 'APPLIED_INVENTORY_PENDING',
          inventoryOutcomeReason: { code: 'MISSING_PUBLISHED_RECIPE' },
        },
        // Two unmapped sales: the reason code must be deduplicated.
        {
          id: 'inv-3',
          type: 'regular',
          isCanceled: false,
          inventoryOutcome: 'APPLIED_NO_INVENTORY_IMPACT',
          inventoryOutcomeReason: { code: 'NO_EXPLICIT_INSUMO_MAPPING' },
        },
        {
          id: 'inv-4',
          type: 'regular',
          isCanceled: false,
          inventoryOutcome: 'APPLIED_NO_INVENTORY_IMPACT',
          inventoryOutcomeReason: { code: 'NO_EXPLICIT_INSUMO_MAPPING' },
        },
        {
          id: 'inv-5',
          type: 'regular',
          isCanceled: false,
          inventoryOutcome: null,
        },
      ]);

      const qb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      movementRepo.createQueryBuilder.mockReturnValue(qb);

      const report = await service.getCogsReport('tenant-1');

      // inv-1 is APPLIED with no costed movement (MISSING_COST_BASIS);
      // inv-3 and inv-4 deduplicate into one NO_EXPLICIT_INSUMO_MAPPING.
      // No sale of the period is costable, so the status is UNAVAILABLE
      // (PARTIAL requires a mix of costed and uncosted sales).
      expect(report.inventoryCoverage.status).toBe('UNAVAILABLE');
      expect(report.inventoryCoverage.costedSalesCount).toBe(0);
      expect(report.inventoryCoverage.uncostedSalesCount).toBe(5);
      expect(report.inventoryCoverage.reasonCodes).toEqual([
        'MISSING_INVENTORY_IMPACT',
        'NO_EXPLICIT_INSUMO_MAPPING',
        'MISSING_COST_BASIS',
        'UNRESOLVED_SOURCE_DOCUMENT',
      ]);
    });

    it('reports PARTIAL inventoryCoverage with UNRESOLVED_SOURCE_DOCUMENT for legacy sales without an outcome fact', async () => {
      insumoRepo.find.mockResolvedValue([]);
      mockSaleInvoices([
        {
          id: 'inv-1',
          type: 'regular',
          isCanceled: false,
          inventoryOutcome: 'APPLIED',
        },
        {
          id: 'inv-2',
          type: 'regular',
          isCanceled: false,
          inventoryOutcome: null,
        },
      ]);

      const mockMovements: Partial<InventoryMovement>[] = [
        {
          insumoId: 'ins-coffee',
          type: MovementType.SALE,
          quantity: -2,
          unitCostNio: 100,
          totalCostNio: 200,
          sourceDocumentId: 'invoice:inv-1',
        },
      ];
      const qb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockMovements),
      };
      movementRepo.createQueryBuilder.mockReturnValue(qb);

      const report = await service.getCogsReport('tenant-1');

      expect(report.inventoryCoverage).toEqual({
        status: 'PARTIAL',
        costedSalesCount: 1,
        uncostedSalesCount: 1,
        reasonCodes: ['UNRESOLVED_SOURCE_DOCUMENT'],
      });
    });

    it('reports PARTIAL inventoryCoverage with MISSING_COST_BASIS when an APPLIED sale has no movement cost', async () => {
      insumoRepo.find.mockResolvedValue([]);
      mockSaleInvoices([
        {
          id: 'inv-1',
          type: 'regular',
          isCanceled: false,
          inventoryOutcome: 'APPLIED',
        },
        {
          id: 'inv-2',
          type: 'regular',
          isCanceled: false,
          inventoryOutcome: 'APPLIED',
        },
      ]);

      const mockMovements: Partial<InventoryMovement>[] = [
        {
          insumoId: 'ins-coffee',
          type: MovementType.SALE,
          quantity: -2,
          unitCostNio: 100,
          totalCostNio: 200,
          sourceDocumentId: 'invoice:inv-1',
        },
        {
          // Movement exists but carries no usable cost basis.
          insumoId: 'ins-milk',
          type: MovementType.SALE,
          quantity: -1,
          unitCostNio: null as unknown as number,
          totalCostNio: null as unknown as number,
          sourceDocumentId: 'invoice:inv-2',
        },
      ];
      const qb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockMovements),
      };
      movementRepo.createQueryBuilder.mockReturnValue(qb);

      const report = await service.getCogsReport('tenant-1');

      expect(report.inventoryCoverage).toEqual({
        status: 'PARTIAL',
        costedSalesCount: 1,
        uncostedSalesCount: 1,
        reasonCodes: ['MISSING_COST_BASIS'],
      });
    });

    // WU12: totalCostNio = 0 is NOT an authoritative cost basis.
    // invoices.service.ts stamps totalCostNio = |qty| x unitCostNio, and
    // Insumo.averageCost is a decimal column defaulting to 0, so a mapped
    // insumo with no recorded purchase produces totalCostNio = 0. Coverage
    // must treat that as uncosted under its own reason code (the operational
    // fix is recording purchase costs, not re-mapping the recipe), while the
    // money fields keep aggregating the zero cost exactly as before: this
    // change is about trust, not arithmetic.
    it('reports UNAVAILABLE inventoryCoverage with ZERO_COST_BASIS when the only SALE movement of an APPLIED sale records totalCostNio = 0 (WU12)', async () => {
      insumoRepo.find.mockResolvedValue([
        {
          id: 'ins-coffee',
          name: 'Café Grano',
          consumptionUom: 'kg',
        } as Insumo,
      ]);
      mockSaleInvoices([
        {
          id: 'inv-1',
          type: 'regular',
          isCanceled: false,
          inventoryOutcome: 'APPLIED',
        },
      ]);

      const mockMovements: Partial<InventoryMovement>[] = [
        {
          insumoId: 'ins-coffee',
          type: MovementType.SALE,
          quantity: -2,
          unitCostNio: 0,
          // Mapped insumo with no purchase yet: averageCost defaults to 0,
          // so the movement stamp is a real 0, not a null.
          totalCostNio: 0,
          sourceDocumentId: 'invoice:inv-1',
        },
      ];
      const qb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockMovements),
      };
      movementRepo.createQueryBuilder.mockReturnValue(qb);

      const report = await service.getCogsReport('tenant-1');

      // Trust: the sale is uncosted under ZERO_COST_BASIS (a zero-quantity
      // movement could not evidence a cost either; this one has qty = 2, so
      // the zero is a real recorded zero-cost basis).
      expect(report.inventoryCoverage).toEqual({
        status: 'UNAVAILABLE',
        costedSalesCount: 0,
        uncostedSalesCount: 1,
        reasonCodes: ['ZERO_COST_BASIS'],
      });
      // Money regression (byte-identical before/after WU12): a zero-cost
      // insumo genuinely contributes 0 cost, so aggregation is untouched.
      expect(report.salesCogsNio).toBe(0);
      expect(report.totalCogsNio).toBe(0);
      expect(report.shrinkageCogsNio).toBe(0);
      expect(report.items).toEqual([
        {
          insumoId: 'ins-coffee',
          insumoName: 'Café Grano',
          consumptionUom: 'kg',
          salesQuantity: 2,
          salesCostNio: 0,
          shrinkageQuantity: 0,
          shrinkageCostNio: 0,
          totalQuantity: 2,
          totalCostNio: 0,
          costPercentage: 0,
        },
      ]);
    });

    it('reports PARTIAL inventoryCoverage with ZERO_COST_BASIS when the period mixes a real-cost sale and a zero-cost sale, without moving the money fields (WU12)', async () => {
      insumoRepo.find.mockResolvedValue([
        {
          id: 'ins-coffee',
          name: 'Café Grano',
          consumptionUom: 'kg',
        } as Insumo,
        {
          id: 'ins-milk',
          name: 'Leche',
          consumptionUom: 'lt',
        } as Insumo,
      ]);
      mockSaleInvoices([
        {
          id: 'inv-1',
          type: 'regular',
          isCanceled: false,
          inventoryOutcome: 'APPLIED',
        },
        {
          id: 'inv-2',
          type: 'regular',
          isCanceled: false,
          inventoryOutcome: 'APPLIED',
        },
      ]);

      const mockMovements: Partial<InventoryMovement>[] = [
        {
          insumoId: 'ins-coffee',
          type: MovementType.SALE,
          quantity: -2,
          unitCostNio: 100,
          totalCostNio: 200,
          sourceDocumentId: 'invoice:inv-1',
        },
        {
          // Zero-cost basis: mapped insumo, no purchase recorded yet.
          insumoId: 'ins-milk',
          type: MovementType.SALE,
          quantity: -1,
          unitCostNio: 0,
          totalCostNio: 0,
          sourceDocumentId: 'invoice:inv-2',
        },
      ];
      const qb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockMovements),
      };
      movementRepo.createQueryBuilder.mockReturnValue(qb);

      const report = await service.getCogsReport('tenant-1');

      expect(report.inventoryCoverage).toEqual({
        status: 'PARTIAL',
        costedSalesCount: 1,
        uncostedSalesCount: 1,
        reasonCodes: ['ZERO_COST_BASIS'],
      });
      // Money regression (byte-identical before/after WU12): the zero-cost
      // sale contributes exactly 0 to salesCogsNio/totalCogsNio and its item
      // row aggregates exactly as under the old trust policy.
      expect(report.salesCogsNio).toBe(200);
      expect(report.totalCogsNio).toBe(200);
      expect(report.shrinkageCogsNio).toBe(0);
      expect(report.items).toEqual([
        {
          insumoId: 'ins-coffee',
          insumoName: 'Café Grano',
          consumptionUom: 'kg',
          salesQuantity: 2,
          salesCostNio: 200,
          shrinkageQuantity: 0,
          shrinkageCostNio: 0,
          totalQuantity: 2,
          totalCostNio: 200,
          costPercentage: 100,
        },
        {
          insumoId: 'ins-milk',
          insumoName: 'Leche',
          consumptionUom: 'lt',
          salesQuantity: 1,
          salesCostNio: 0,
          shrinkageQuantity: 0,
          shrinkageCostNio: 0,
          totalQuantity: 1,
          totalCostNio: 0,
          costPercentage: 0,
        },
      ]);
    });

    it('reports ZERO_COST_BASIS (not MISSING_COST_BASIS) when totalCostNio is absent but unitCostNio records a present zero (WU12)', async () => {
      insumoRepo.find.mockResolvedValue([]);
      mockSaleInvoices([
        {
          id: 'inv-1',
          type: 'regular',
          isCanceled: false,
          inventoryOutcome: 'APPLIED',
        },
      ]);

      const mockMovements: Partial<InventoryMovement>[] = [
        {
          insumoId: 'ins-coffee',
          type: MovementType.SALE,
          quantity: -2,
          unitCostNio: 0,
          totalCostNio: null as unknown as number,
          sourceDocumentId: 'invoice:inv-1',
        },
      ];
      const qb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockMovements),
      };
      movementRepo.createQueryBuilder.mockReturnValue(qb);

      const report = await service.getCogsReport('tenant-1');

      // Present-but-zero cost is operationally different from no recorded
      // cost at all: the fix is recording a purchase cost, not auditing the
      // movement chain, so it earns its own reason code.
      expect(report.inventoryCoverage).toEqual({
        status: 'UNAVAILABLE',
        costedSalesCount: 0,
        uncostedSalesCount: 1,
        reasonCodes: ['ZERO_COST_BASIS'],
      });
      // Money regression: qty x unitCostNio(0) = 0, unchanged by WU12.
      expect(report.salesCogsNio).toBe(0);
      expect(report.totalCogsNio).toBe(0);
    });

    it('reports COMPLETE inventoryCoverage with zero counts for an empty period', async () => {
      insumoRepo.find.mockResolvedValue([]);
      mockSaleInvoices([]);

      const qb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      movementRepo.createQueryBuilder.mockReturnValue(qb);

      const report = await service.getCogsReport('tenant-1');

      expect(report.inventoryCoverage).toEqual({
        status: 'COMPLETE',
        costedSalesCount: 0,
        uncostedSalesCount: 0,
      });
      expect('reasonCodes' in report.inventoryCoverage).toBe(false);
    });

    it('reports UNAVAILABLE inventoryCoverage when sales exist but none can be costed', async () => {
      insumoRepo.find.mockResolvedValue([]);
      mockSaleInvoices([
        {
          id: 'inv-1',
          type: 'regular',
          isCanceled: false,
          inventoryOutcome: null,
        },
      ]);

      const qb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      movementRepo.createQueryBuilder.mockReturnValue(qb);

      const report = await service.getCogsReport('tenant-1');

      expect(report.inventoryCoverage).toEqual({
        status: 'UNAVAILABLE',
        costedSalesCount: 0,
        uncostedSalesCount: 1,
        reasonCodes: ['UNRESOLVED_SOURCE_DOCUMENT'],
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
      const warningAlert = summary.alerts.find(
        (a: any) => a.insumoId === 'ins-warning',
      );
      expect(warningAlert).toBeDefined();
      expect(warningAlert.severity).toBe('WARNING');
      expect(warningAlert.suggestedReorderQuantity).toBe(16.0); // 20 - 4

      // Critical alert
      const criticalAlert = summary.alerts.find(
        (a: any) => a.insumoId === 'ins-critical-zero',
      );
      expect(criticalAlert).toBeDefined();
      expect(criticalAlert.severity).toBe('CRITICAL');
      expect(criticalAlert.suggestedReorderQuantity).toBe(200.0); // 200 - 0

      // Negative stock alert
      const negativeAlert = summary.alerts.find(
        (a: any) => a.insumoId === 'ins-negative',
      );
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
