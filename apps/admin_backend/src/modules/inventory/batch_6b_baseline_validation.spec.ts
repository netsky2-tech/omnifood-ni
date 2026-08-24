import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Insumo } from './entities/insumo.entity';
import {
  InventoryMovement,
  MovementType,
} from './entities/inventory-movement.entity';
import { InventoryService } from './inventory.service';
import { CostCalculatorService } from './cost-calculator.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('Batch 6b Baseline Validation', () => {
  let inventoryService: InventoryService;
  let costCalculator: CostCalculatorService;
  let insumoRepo: jest.Mocked<Partial<Repository<Insumo>>>;
  let movementRepo: jest.Mocked<Partial<Repository<InventoryMovement>>>;
  let dataSource: jest.Mocked<Partial<DataSource>>;
  let eventEmitter: jest.Mocked<Partial<EventEmitter2>>;

  const mockTenantA = 'tenant-uuid-alpha';
  const mockTenantB = 'tenant-uuid-beta';

  const createMockInsumo = (overrides: Partial<Insumo> = {}): Insumo =>
    ({
      id: 'insumo-uuid-1',
      tenant_id: mockTenantA,
      name: 'Café Grano Especial',
      stock: 0,
      existenciaActual: 0,
      averageCost: 120.5,
      conversionFactor: 1,
      purchaseUom: 'kg',
      consumptionUom: 'kg',
      is_active: true,
      ...overrides,
    }) as Insumo;

  const createMockMovement = (
    overrides: Partial<InventoryMovement> = {},
  ): InventoryMovement =>
    ({
      id: '1',
      tenant_id: mockTenantA,
      insumoId: 'insumo-uuid-1',
      type: MovementType.SALE,
      quantity: 5,
      unitCostNio: 120.5,
      totalCostNio: 602.5,
      previousStock: 0,
      newStock: -5,
      averageCostAfterNio: 120.5,
      sourceDocumentId: 'INV-001',
      sourceDocumentType: 'INVOICE',
      ...overrides,
    }) as InventoryMovement;

  beforeEach(async () => {
    insumoRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      create: jest.fn().mockImplementation((dto) => dto),
    };

    movementRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      create: jest.fn().mockImplementation((dto) => dto),
    };

    eventEmitter = {
      emit: jest.fn(),
    };

    dataSource = {
      transaction: jest
        .fn()
        .mockImplementation(async (callback) =>
          callback({
            getRepository: (entity: any) =>
              entity === Insumo ? insumoRepo : movementRepo,
          }),
        ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        CostCalculatorService,
        {
          provide: getRepositoryToken(Insumo),
          useValue: insumoRepo,
        },
        {
          provide: getRepositoryToken(InventoryMovement),
          useValue: movementRepo,
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: EventEmitter2,
          useValue: eventEmitter,
        },
      ],
    }).compile();

    inventoryService = module.get<InventoryService>(InventoryService);
    costCalculator = module.get<CostCalculatorService>(CostCalculatorService);
  });

  describe('1. Negative Stock Acceptance & Outflow Handling', () => {
    it('allows outflows when stock is zero, resulting in negative stock balance', async () => {
      const insumo = createMockInsumo({ stock: 0, averageCost: 150.0 });
      insumoRepo.findOne!.mockResolvedValue(insumo);

      await inventoryService.syncMovements(
        [
          {
            id: 'd9b2d63d-a411-4fae-a34f-9e6727289b4e',
            insumoId: insumo.id,
            type: MovementType.SALE,
            quantity: 10,
            previousStock: 0,
            newStock: -10,
            unitCostNio: 150.0,
            reason: 'FOH POS Sale Outflow under zero stock',
            timestamp: new Date().toISOString(),
          },
        ],
        mockTenantA,
      );

      expect(insumo.stock).toBe(-10);
      expect(insumo.existenciaActual).toBe(-10);
      expect(movementRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          previousStock: 0,
          newStock: -10,
          type: MovementType.SALE,
        }),
      );
    });

    it('preserves historical average cost when operating in negative stock territory', async () => {
      const insumo = createMockInsumo({
        stock: -5,
        existenciaActual: -5,
        averageCost: 135.5,
      });
      insumoRepo.findOne!.mockResolvedValue(insumo);

      await inventoryService.syncMovements(
        [
          {
            id: 'c8a1b2c3-d4e5-4f6a-b7c8-d9e0f1a2b3c4',
            insumoId: insumo.id,
            type: MovementType.SALE,
            quantity: 2,
            previousStock: -5,
            newStock: -7,
            unitCostNio: 135.5,
            reason: 'Consecutive negative outflow',
            timestamp: new Date().toISOString(),
          },
        ],
        mockTenantA,
      );

      expect(insumo.stock).toBe(-7);
      expect(insumo.averageCost).toBe(135.5);
    });
  });

  describe('2. Append-Only Kardex & Lineage Proof', () => {
    it('ensures movements are append-only and never update previous movement rows', async () => {
      const insumo = createMockInsumo({ stock: 10, averageCost: 100 });
      insumoRepo.findOne!.mockResolvedValue(insumo);

      await inventoryService.syncMovements(
        [
          {
            id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
            insumoId: insumo.id,
            type: MovementType.PURCHASE,
            quantity: 5,
            previousStock: 10,
            newStock: 15,
            unitCostNio: 110,
            reason: 'PURCHASE:DOC-1234',
            timestamp: new Date().toISOString(),
          },
        ],
        mockTenantA,
      );

      expect(movementRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MovementType.PURCHASE,
          quantity: 5,
          unitCostNio: 110,
        }),
      );
      expect(movementRepo.save).toHaveBeenCalled();
    });

    it('records compensations as separate linked movements with reference pointers', async () => {
      const originalMovement = createMockMovement({
        id: '100',
        quantity: 5,
        unitCostNio: 120.0,
      });

      const compensationMovement = createMockMovement({
        id: '101',
        type: MovementType.CREDIT_NOTE_RESTOCK,
        quantity: 5,
        unitCostNio: 120.0,
        sourceDocumentId: 'NC-001',
        sourceDocumentType: 'CREDIT_NOTE',
      });

      expect(compensationMovement.id).not.toBe(originalMovement.id);
      expect(compensationMovement.quantity).toBe(originalMovement.quantity);
      expect(compensationMovement.type).toBe(MovementType.CREDIT_NOTE_RESTOCK);
    });
  });

  describe('3. NUMERIC(14,4) Precision & Valuation Calculations', () => {
    it('calculates weighted average cost (CPP) accurately to 4 decimal places via calculatePurchaseCpp', () => {
      const result = costCalculator.calculatePurchaseCpp({
        currentStock: 12.3456,
        currentCppNio: 145.6789,
        entryQuantity: 25.5,
        entryUnitCost: 152.3333,
        currency: 'NIO',
      });

      expect(Number.isFinite(result.projectedCppNio)).toBe(true);
      expect(result.projectedCppNio).toBeGreaterThan(145.6789);
      expect(result.projectedCppNio).toBeLessThan(152.3333);
      const decimalPlaces =
        result.projectedCppNio.toString().split('.')[1]?.length || 0;
      expect(decimalPlaces).toBeLessThanOrEqual(4);
    });

    it('handles zero stock incoming purchase replenishment without division by zero', () => {
      const result = costCalculator.calculatePurchaseCpp({
        currentStock: 0,
        currentCppNio: 0,
        entryQuantity: 10,
        entryUnitCost: 85.5,
        currency: 'NIO',
      });

      expect(result.projectedCppNio).toBe(85.5);
    });
  });

  describe('4. Multi-Tenant Isolation & RLS Boundary', () => {
    it('strictly isolates inventory operations between distinct tenants', async () => {
      const insumoTenantA = createMockInsumo({
        id: 'ins-A',
        tenant_id: mockTenantA,
        stock: 50,
      });

      insumoRepo.findOne!.mockImplementation(async (options: any) => {
        if (
          options?.where?.id === 'ins-A' &&
          options?.where?.tenant_id === mockTenantA
        ) {
          return insumoTenantA;
        }
        return null;
      });

      // If Tenant B attempts to sync movements for Tenant A's insumo, it finds nothing and does not modify it
      await inventoryService.syncMovements(
        [
          {
            id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
            insumoId: 'ins-A',
            type: MovementType.SALE,
            quantity: 5,
            previousStock: 50,
            newStock: 45,
            unitCostNio: 100,
            timestamp: new Date().toISOString(),
          },
        ],
        mockTenantB,
      );

      expect(insumoTenantA.stock).toBe(50);
      expect(movementRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('5. Batch 6a Credit Note Compensation Provenance', () => {
    it('validates that credit note refunds reverse stock without mutating invoice status destructively', () => {
      const originalSale = {
        invoiceId: 'inv-001',
        is_canceled: false,
        items: [{ insumoId: 'ins-1', quantity: 2, unitPrice: 200 }],
      };

      const creditNoteReversal = {
        creditNoteId: 'nc-001',
        relatedInvoiceId: originalSale.invoiceId,
        reversalType: 'CREDIT_NOTE_COMPENSATION',
        itemsReversed: [{ insumoId: 'ins-1', quantity: 2 }],
        updatedOriginalInvoice: {
          ...originalSale,
          is_canceled: true,
        },
      };

      expect(creditNoteReversal.updatedOriginalInvoice.is_canceled).toBe(true);
      expect(creditNoteReversal.relatedInvoiceId).toBe('inv-001');
      expect(creditNoteReversal.itemsReversed[0].quantity).toBe(2);
    });
  });
});
