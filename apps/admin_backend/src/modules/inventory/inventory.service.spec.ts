import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InventoryService } from './inventory.service';
import { Insumo } from './entities/insumo.entity';
import { InventoryMovement, MovementType } from './entities/inventory-movement.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { CostCalculatorService } from './cost-calculator.service';
import { CreateInventoryMovementDto } from './dto/create-inventory-movement.dto';

describe('InventoryService', () => {
  let service: InventoryService;
  let insumoRepo: any;
  let movementRepo: any;
  let eventEmitter: EventEmitter2;
  let dataSource: any;
  let costCalculator: CostCalculatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        CostCalculatorService,
        {
          provide: getRepositoryToken(Insumo),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(InventoryMovement),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
          },
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
            transaction: jest.fn().mockImplementation((cb) => cb({
              getRepository: jest.fn().mockImplementation((entity) => {
                if (entity === Insumo) return insumoRepo;
                if (entity === InventoryMovement) return movementRepo;
              }),
            })),
          },
        },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
    insumoRepo = module.get(getRepositoryToken(Insumo));
    movementRepo = module.get(getRepositoryToken(InventoryMovement));
    eventEmitter = module.get(EventEmitter2);
    dataSource = module.get(DataSource);
    costCalculator = module.get(CostCalculatorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('updateWAC', () => {
    it('should calculate and update weighted average cost correctly', async () => {
      const insumoId = 'ins-1';
      const existingInsumo = {
        id: insumoId,
        stock: 10,
        averageCost: 100,
        conversionFactor: 1,
      } as Insumo;

      jest.spyOn(insumoRepo, 'findOne').mockResolvedValue(existingInsumo);
      jest
        .spyOn(insumoRepo, 'save')
        .mockImplementation(async (insumo) => insumo as Insumo);

      const result = await service.recordPurchase(insumoId, 5, 130);

      expect(insumoRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          stock: 15,
          averageCost: 110,
        }),
      );
      expect((result as any).averageCost).toBe(110);
    });

    it('should handle zero initial stock correctly', async () => {
      const insumoId = 'ins-2';
      const existingInsumo = {
        id: insumoId,
        stock: 0,
        averageCost: 0,
        conversionFactor: 1,
      } as Insumo;

      jest.spyOn(insumoRepo, 'findOne').mockResolvedValue(existingInsumo);
      jest
        .spyOn(insumoRepo, 'save')
        .mockImplementation(async (insumo) => insumo as Insumo);

      const result = await service.recordPurchase(insumoId, 10, 50);

      expect((result as any).stock).toBe(10);
      expect((result as any).averageCost).toBe(50);
    });
  });

  describe('syncMovements', () => {
    it('should sort movements by timestamp ASC before processing', async () => {
      const movements = [
        { timestamp: new Date('2026-05-05T10:00:05Z'), insumoId: '1' },
        { timestamp: new Date('2026-05-05T10:00:00Z'), insumoId: '2' },
        { timestamp: new Date('2026-05-05T10:00:10Z'), insumoId: '3' },
      ];

      const sorted = await service.sortMovements(movements);

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

      const insumo = { id: 'ins-1', stock: 11 } as Insumo;
      jest.spyOn(insumoRepo, 'findOne').mockResolvedValue(insumo);
      jest.spyOn(insumoRepo, 'save').mockImplementation(async (i: any) => {
        insumo.stock = i.stock;
        return i;
      });

      await service.syncMovements(movements);

      expect(insumoRepo.save).toHaveBeenCalledTimes(2);
      expect(insumo.stock).toBe(8);
      expect(movementRepo.save).toHaveBeenCalledTimes(2);
    });
  });
});
