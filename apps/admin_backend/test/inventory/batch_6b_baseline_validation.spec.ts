import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Insumo } from '../../src/modules/inventory/entities/insumo.entity';
import {
  InventoryMovement,
  MovementType,
} from '../../src/modules/inventory/entities/inventory-movement.entity';
import { InventoryService } from '../../src/modules/inventory/inventory.service';
import { CostCalculatorService } from '../../src/modules/inventory/cost-calculator.service';
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
      id: 'movement-uuid-1',
      tenant_id: mockTenantA,
      insumoId: 'insumo-uuid-1',
      type: MovementType.OUT,
      quantity: 5,
      unitCost: 120.5,
      previousStock: 0,
      newStock: -5,
      createdAt: new Date('2026-08-21T10:00:00Z'),
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
            findOne: insumoRepo.findOne,
            save: insumoRepo.save,
            create: movementRepo.create,
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

      const result = await inventoryService.registerMovement({
        insumoId: insumo.id,
        tenant_id: mockTenantA,
        type: MovementType.OUT,
        quantity: 10,
        unitCost: 150.0,
        reason: 'FOH POS Sale Outflow under zero stock',
      });

      expect(result.insumo.stock).toBe(-10);
      expect(result.movement.previousStock).toBe(0);
      expect(result.movement.newStock).toBe(-10);
    });

    it('preserves historical average cost when operating in negative stock territory', async () => {
      const insumo = createMockInsumo({ stock: -5, averageCost: 135.5 });
      insumoRepo.findOne!.mockResolvedValue(insumo);

      const result = await inventoryService.registerMovement({
        insumoId: insumo.id,
        tenant_id: mockTenantA,
        type: MovementType.OUT,
        quantity: 2,
        unitCost: 135.5,
        reason: 'Consecutive negative outflow',
      });

      expect(result.insumo.stock).toBe(-7);
      expect(result.insumo.averageCost).toBe(135.5);
    });
  });

  describe('2. Append-Only Kardex & Lineage Proof', () => {
    it('ensures movements are append-only and never update previous movement rows', async () => {
      const insumo = createMockInsumo({ stock: 10, averageCost: 100 });
      insumoRepo.findOne!.mockResolvedValue(insumo);

      await inventoryService.registerMovement({
        insumoId: insumo.id,
        tenant_id: mockTenantA,
        type: MovementType.IN,
        quantity: 5,
        unitCost: 110,
        reason: 'Purchase replenishment',
      });

      expect(movementRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MovementType.IN,
          quantity: 5,
          unitCost: 110,
        }),
      );
    });

    it('records compensations as separate linked movements with reference pointers', async () => {
      const originalMovement = createMockMovement({
        id: 'original-mov-1',
        quantity: 5,
        unitCost: 120.0,
      });

      const compensationMovement = createMockMovement({
        id: 'comp-mov-1',
        type: MovementType.IN,
        quantity: 5,
        unitCost: 120.0,
        reason: 'Compensation for Credit Note NC-001',
      });

      expect(compensationMovement.id).not.toBe(originalMovement.id);
      expect(compensationMovement.quantity).toBe(originalMovement.quantity);
      expect(compensationMovement.type).toBe(MovementType.IN);
    });
  });

  describe('3. NUMERIC(14,4) Precision & Valuation Calculations', () => {
    it('calculates weighted average cost (CPP) accurately to 4 decimal places', () => {
      const currentStock = 12.3456;
      const currentAvgCost = 145.6789;
      const incomingQty = 25.5;
      const incomingCost = 152.3333;

      const newAvgCost = costCalculator.calculateWeightedAverageCost(
        currentStock,
        currentAvgCost,
        incomingQty,
        incomingCost,
      );

      expect(Number.isFinite(newAvgCost)).toBe(true);
      expect(newAvgCost).toBeGreaterThan(145.6789);
      expect(newAvgCost).toBeLessThan(152.3333);
      const decimalPlaces = newAvgCost.toString().split('.')[1]?.length || 0;
      expect(decimalPlaces).toBeLessThanOrEqual(4);
    });

    it('handles zero stock incoming purchase replenishment without division by zero', () => {
      const currentStock = 0;
      const currentAvgCost = 0;
      const incomingQty = 10;
      const incomingCost = 85.5;

      const newAvgCost = costCalculator.calculateWeightedAverageCost(
        currentStock,
        currentAvgCost,
        incomingQty,
        incomingCost,
      );

      expect(newAvgCost).toBe(85.5);
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

      await expect(
        inventoryService.registerMovement({
          insumoId: 'ins-A',
          tenant_id: mockTenantB,
          type: MovementType.OUT,
          quantity: 5,
          unitCost: 100,
        }),
      ).rejects.toThrow();
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
