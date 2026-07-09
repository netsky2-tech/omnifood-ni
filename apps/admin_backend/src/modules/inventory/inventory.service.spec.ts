import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InventoryService } from './inventory.service';
import { Insumo } from './entities/insumo.entity';
import {
  InventoryMovement,
  MovementType,
} from './entities/inventory-movement.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { CostCalculatorService } from './cost-calculator.service';
import { CreateInventoryMovementDto } from './dto/create-inventory-movement.dto';

describe('InventoryService', () => {
  let service: InventoryService;
  let insumoRepo: { findOne: jest.Mock; save: jest.Mock };
  let movementRepo: { create: jest.Mock; save: jest.Mock };

  // Helper function to create a mock insumo with tenant_id
  const createMockInsumo = (overrides: Partial<Insumo> = {}): Insumo => {
    return {
      id: 'ins-1',
      tenant_id: 'tenant-A',
      name: 'Test Insumo',
      stock: 10,
      averageCost: 100,
      conversionFactor: 1,
      purchaseUom: 'unit',
      consumptionUom: 'unit',
      is_active: true,
      ...overrides,
    } as Insumo;
  };

  beforeEach(async () => {
    insumoRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    };
    movementRepo = {
      create: jest.fn(),
      save: jest.fn(),
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
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            transaction: jest
              .fn()
              .mockImplementation(
                (cb: (m: Record<string, unknown>) => Promise<unknown>) =>
                  cb({
                    getRepository: (entity: unknown) => {
                      if (entity === Insumo) return insumoRepo;
                      if (entity === InventoryMovement) return movementRepo;
                      return null;
                    },
                  }),
              ),
          },
        },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('updateWAC', () => {
    it('should calculate and update weighted average cost correctly', async () => {
      const insumoId = 'ins-1';
      const existingInsumo = {
        id: insumoId,
        tenant_id: 'tenant-A',
        stock: 10,
        averageCost: 100,
        conversionFactor: 1,
      } as Insumo;

      jest.spyOn(insumoRepo, 'findOne').mockResolvedValue(existingInsumo);
      jest
        .spyOn(insumoRepo, 'save')
        .mockImplementation((insumo: Insumo) => Promise.resolve(insumo));

      const result = await service.recordPurchase(insumoId, 5, 130, 'tenant-A');

      expect(insumoRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          stock: 15,
          averageCost: 110,
        }),
      );
      expect(result.averageCost).toBe(110);
    });

    it('should handle zero initial stock correctly', async () => {
      const insumoId = 'ins-2';
      const existingInsumo = {
        id: insumoId,
        tenant_id: 'tenant-A',
        stock: 0,
        averageCost: 0,
        conversionFactor: 1,
      } as Insumo;

      jest.spyOn(insumoRepo, 'findOne').mockResolvedValue(existingInsumo);
      jest
        .spyOn(insumoRepo, 'save')
        .mockImplementation((insumo: Insumo) => Promise.resolve(insumo));

      const result = await service.recordPurchase(insumoId, 10, 50, 'tenant-A');

      expect(result.stock).toBe(10);
      expect(result.averageCost).toBe(50);
    });
  });

  describe('syncMovements', () => {
    it('should sort movements by timestamp ASC before processing', () => {
      const movements = [
        { timestamp: new Date('2026-05-05T10:00:05Z'), insumoId: '1' },
        { timestamp: new Date('2026-05-05T10:00:00Z'), insumoId: '2' },
        { timestamp: new Date('2026-05-05T10:00:10Z'), insumoId: '3' },
      ];

      const sorted = service.sortMovements(movements);

      expect(sorted[0].insumoId).toBe('2');
      expect(sorted[1].insumoId).toBe('1');
      expect(sorted[2].insumoId).toBe('3');
    });

    it('should process movements in chronological order and update stock', async () => {
      const movements: CreateInventoryMovementDto[] = [
        {
          id: 'mov-1',
          insumoId: 'ins-1',
          type: MovementType.SALE,
          quantity: 2,
          previousStock: 10,
          newStock: 8,
          timestamp: '2026-05-05T10:00:05Z',
        },
        {
          id: 'mov-2',
          insumoId: 'ins-1',
          type: MovementType.SALE,
          quantity: 1,
          previousStock: 11,
          newStock: 10,
          timestamp: '2026-05-05T10:00:00Z',
        },
      ];

      const insumo = {
        id: 'ins-1',
        tenant_id: 'tenant-A',
        stock: 11,
      } as Insumo;
      jest.spyOn(insumoRepo, 'findOne').mockResolvedValue(insumo);
      jest.spyOn(insumoRepo, 'save').mockImplementation((i: Insumo) => {
        insumo.stock = i.stock;
        return Promise.resolve(i);
      });

      await service.syncMovements(movements, 'tenant-A');

      expect(insumoRepo.save).toHaveBeenCalledTimes(2);
      expect(insumo.stock).toBe(8);
      expect(movementRepo.save).toHaveBeenCalledTimes(2);
    });

    it('should include tenant_id in findOne query for syncMovements (RED)', async () => {
      const movements: CreateInventoryMovementDto[] = [
        {
          id: 'mov-1',
          insumoId: 'ins-1',
          type: MovementType.SALE,
          quantity: 2,
          previousStock: 10,
          newStock: 8,
          timestamp: '2026-05-05T10:00:00Z',
        },
      ];

      const mockInsumo = createMockInsumo({
        id: 'ins-1',
        tenant_id: 'tenant-A',
      });
      const findOneSpy = jest
        .spyOn(insumoRepo, 'findOne')
        .mockResolvedValue(mockInsumo);
      jest.spyOn(insumoRepo, 'save').mockResolvedValue(mockInsumo);
      jest.spyOn(movementRepo, 'save').mockResolvedValue([]);

      await service.syncMovements(movements, 'tenant-A');

      /* eslint-disable @typescript-eslint/no-unsafe-assignment -- Jest expect.objectContaining returns any */
      expect(findOneSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'ins-1',
            tenant_id: 'tenant-A',
          }),
        }),
      );
      /* eslint-enable @typescript-eslint/no-unsafe-assignment */
    });

    it('rejects inbound synced movements that cannot freeze a cost snapshot', async () => {
      const movements: CreateInventoryMovementDto[] = [
        {
          id: 'mov-3',
          insumoId: 'ins-1',
          type: MovementType.PURCHASE,
          quantity: 5,
          previousStock: 8,
          newStock: 13,
          timestamp: '2026-05-05T10:00:00Z',
        },
      ];

      const insumo = createMockInsumo({
        id: 'ins-1',
        tenant_id: 'tenant-A',
        stock: 8,
        averageCost: 4.25,
      });
      jest.spyOn(insumoRepo, 'findOne').mockResolvedValue(insumo);

      await expect(
        service.syncMovements(movements, 'tenant-A'),
      ).rejects.toThrow(
        'Synced inbound movements must include unitCostNio to freeze a valid cost snapshot',
      );
      expect(movementRepo.save).not.toHaveBeenCalled();
    });

    it('stamps weighted post-purchase snapshots for synced purchase movements', async () => {
      const movements: Array<
        CreateInventoryMovementDto & { unitCostNio: number }
      > = [
        {
          id: 'mov-4',
          insumoId: 'ins-1',
          type: MovementType.PURCHASE,
          quantity: 5,
          previousStock: 8,
          newStock: 13,
          timestamp: '2026-05-05T10:00:00Z',
          unitCostNio: 7.5,
        },
      ];

      const insumo = createMockInsumo({
        id: 'ins-1',
        tenant_id: 'tenant-A',
        stock: 8,
        averageCost: 4.25,
      });
      jest.spyOn(insumoRepo, 'findOne').mockResolvedValue(insumo);
      jest.spyOn(insumoRepo, 'save').mockImplementation((i: Insumo) => {
        insumo.stock = i.stock;
        insumo.averageCost = i.averageCost;
        return Promise.resolve(i);
      });

      await service.syncMovements(movements, 'tenant-A');

      expect(insumoRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          stock: 13,
          averageCost: 5.5,
        }),
      );
      expect(movementRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MovementType.PURCHASE,
          newStock: 13,
          unitCostNio: 7.5,
          totalCostNio: 37.5,
          averageCostAfterNio: 5.5,
        }),
      );
    });

    it('rejects generic sync ENTRADA_COMPRA movements because the DTO has no source document linkage', async () => {
      const movements: Array<
        CreateInventoryMovementDto & { unitCostNio: number }
      > = [
        {
          id: 'mov-entrada-1',
          insumoId: 'ins-1',
          type: MovementType.ENTRADA_COMPRA,
          quantity: 5,
          previousStock: 8,
          newStock: 13,
          timestamp: '2026-05-05T10:00:00Z',
          unitCostNio: 7.5,
        },
      ];

      await expect(
        service.syncMovements(movements, 'tenant-A'),
      ).rejects.toThrow(
        'ENTRADA_COMPRA movements must be posted through the purchase document workflow because generic sync does not include source document linkage',
      );
      expect(insumoRepo.findOne).not.toHaveBeenCalled();
      expect(insumoRepo.save).not.toHaveBeenCalled();
      expect(movementRepo.create).not.toHaveBeenCalled();
      expect(movementRepo.save).not.toHaveBeenCalled();
    });

    it('rejects generic count adjustments because SesionConteo replay owns traceability', async () => {
      const movements: CreateInventoryMovementDto[] = [
        {
          id: 'count-1:line-1',
          insumoId: 'ins-1',
          type: MovementType.ADJUSTMENT,
          quantity: -5,
          previousStock: 15,
          newStock: 10,
          timestamp: '2026-06-02T10:00:00Z',
          reason: 'COUNT_SESSION:count-1',
        },
      ];

      await expect(
        service.syncMovements(movements, 'tenant-A'),
      ).rejects.toThrow(
        'AJUSTE_CONTEO movements must be posted through the count-session document workflow because generic sync cannot prove SesionConteo traceability',
      );
      expect(insumoRepo.findOne).not.toHaveBeenCalled();
      expect(insumoRepo.save).not.toHaveBeenCalled();
      expect(movementRepo.create).not.toHaveBeenCalled();
      expect(movementRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('tenant isolation', () => {
    it('should include tenant_id in findOne query for recordPurchase (RED)', async () => {
      const mockInsumo = createMockInsumo({
        id: 'ins-1',
        tenant_id: 'tenant-A',
        stock: 10,
        conversionFactor: 1,
      });
      const findOneSpy = jest
        .spyOn(insumoRepo, 'findOne')
        .mockResolvedValue(mockInsumo);
      jest.spyOn(insumoRepo, 'save').mockResolvedValue(mockInsumo);

      await service.recordPurchase('ins-1', 5, 130, 'tenant-A');

      /* eslint-disable @typescript-eslint/no-unsafe-assignment -- Jest expect.objectContaining returns any */
      expect(findOneSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'ins-1',
            tenant_id: 'tenant-A',
          }),
        }),
      );
      /* eslint-enable @typescript-eslint/no-unsafe-assignment */
    });

    it('should NOT return insumo from different tenant in recordPurchase (RED)', async () => {
      // Tenant A's insumo
      const tenantAInsumo = createMockInsumo({
        id: 'ins-1',
        tenant_id: 'tenant-A',
      });

      // When tenant B queries, they should NOT get tenant A's insumo
      // The query with tenant_id filter should return null for tenant B
      jest
        .spyOn(insumoRepo, 'findOne')
        .mockImplementation(
          (options: { where: { id?: string; tenant_id?: string } }) => {
            const where = options?.where || {};
            if (where.tenant_id === 'tenant-A' && where.id === 'ins-1') {
              return Promise.resolve(tenantAInsumo);
            }
            return Promise.resolve(null);
          },
        );

      // Tenant B trying to access tenant A's insumo should get NotFoundException
      await expect(
        service.recordPurchase('ins-1', 5, 130, 'tenant-B'),
      ).rejects.toThrow('Insumo with ID ins-1 not found');
    });

    it('should NOT return insumo from different tenant in syncMovements (RED)', async () => {
      const movements: CreateInventoryMovementDto[] = [
        {
          id: 'mov-1',
          insumoId: 'ins-1',
          type: MovementType.SALE,
          quantity: 2,
          previousStock: 10,
          newStock: 8,
          timestamp: '2026-05-05T10:00:00Z',
        },
      ];

      // Tenant A's insumo
      const tenantAInsumo = createMockInsumo({
        id: 'ins-1',
        tenant_id: 'tenant-A',
      });

      // Mock findOne to simulate tenant isolation
      jest
        .spyOn(insumoRepo, 'findOne')
        .mockImplementation(
          (options: { where: { id?: string; tenant_id?: string } }) => {
            const where = options?.where || {};
            if (where.tenant_id === 'tenant-A' && where.id === 'ins-1') {
              return Promise.resolve(tenantAInsumo);
            }
            return Promise.resolve(null);
          },
        );

      // When processing for tenant-B, findOne should return null (insumo not found)
      // The movement should be skipped
      await service.syncMovements(movements, 'tenant-B');

      // Since no insumo was found for tenant-B, save should not be called
      expect(insumoRepo.save).not.toHaveBeenCalled();
    });
  });
});
