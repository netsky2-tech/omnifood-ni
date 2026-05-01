import { Test, TestingModule } from '@nestjs/testing';
import { InventoryService } from './inventory.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Insumo } from './entities/insumo.entity';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('InventoryService', () => {
  let service: InventoryService;
  let repo: Repository<Insumo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        {
          provide: getRepositoryToken(Insumo),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
    repo = module.get<Repository<Insumo>>(getRepositoryToken(Insumo));
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

      jest.spyOn(repo, 'findOne').mockResolvedValue(existingInsumo);
      jest
        .spyOn(repo, 'save')
        // eslint-disable-next-line @typescript-eslint/require-await
        .mockImplementation(async (insumo) => insumo as Insumo);

      // New purchase: 5 units at 130 each
      // New total cost = (10 * 100) + (5 * 130) = 1000 + 650 = 1650
      // New stock = 10 + 5 = 15
      // New average = 1650 / 15 = 110

      const result = await service.recordPurchase(insumoId, 5, 130);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          stock: 15,
          averageCost: 110,
        }),
      );
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
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

      jest.spyOn(repo, 'findOne').mockResolvedValue(existingInsumo);
      jest
        .spyOn(repo, 'save')
        // eslint-disable-next-line @typescript-eslint/require-await
        .mockImplementation(async (insumo) => insumo as Insumo);

      const result = await service.recordPurchase(insumoId, 10, 50);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect((result as any).stock).toBe(10);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect((result as any).averageCost).toBe(50);
    });
  });
});
