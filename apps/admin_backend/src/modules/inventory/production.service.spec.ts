import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Batch } from './entities/batch.entity';
import { ProductionService } from './production.service';
import { RecipeService } from './recipe.service';
import { BomExplosionService } from './bom-explosion.service';
import { BatchCostingService } from './batch-costing.service';

describe('ProductionService', () => {
  let service: ProductionService;

  const batchRepo = { find: jest.fn() };
  const recipeService = { getSnapshot: jest.fn() };
  const bomExplosionService = { explode: jest.fn() };
  const batchCostingService = { buildValuationTrace: jest.fn() };

  const manager = {
    createQueryBuilder: jest.fn(() => ({
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        id: 'ins-1',
        stock: 10,
        existenciaActual: 10,
        averageCost: 3,
      }),
    })),
    save: jest.fn().mockResolvedValue({}),
    create: jest.fn((_: unknown, payload: unknown) => payload),
    findOne: jest.fn().mockResolvedValue(null),
  };

  const dataSource = {
    transaction: jest
      .fn()
      .mockImplementation(
        async (
          _isolation: string,
          callback: (txManager: typeof manager) => Promise<void>,
        ) => callback(manager),
      ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductionService,
        { provide: DataSource, useValue: dataSource },
        { provide: RecipeService, useValue: recipeService },
        { provide: BomExplosionService, useValue: bomExplosionService },
        { provide: BatchCostingService, useValue: batchCostingService },
        { provide: getRepositoryToken(Batch), useValue: batchRepo },
      ],
    }).compile();

    service = module.get<ProductionService>(ProductionService);
  });

  it('processes production by consuming exploded ingredients and creating receipt stock', async () => {
    recipeService.getSnapshot.mockResolvedValue({
      recipeVersion: { id: 'v3' },
      components: [{ insumo_id: 'ins-raw', quantity: 0.5 }],
    });
    bomExplosionService.explode.mockReturnValue(new Map([['ins-raw', 2]]));
    batchRepo.find.mockResolvedValue([
      { id: 'b1', remaining_stock: 2, cost: 1.5 },
    ]);
    batchCostingService.buildValuationTrace.mockReturnValue([
      {
        batchId: 'b1',
        consumedQuantity: 2,
        unitCostNio: 1.5,
        totalCostNio: 3,
        isSoftExpired: false,
      },
    ]);

    const result = await service.processOrder({
      tenantId: 'tenant-A',
      recipeVersionId: 'v3',
      orderQuantity: 4,
      producedInsumoId: 'ins-finished',
      producedBatchNumber: 'PB-001',
      producedExpirationDate: new Date('2026-12-01T00:00:00.000Z'),
      operationDate: new Date('2026-05-01T00:00:00.000Z'),
    });

    expect(dataSource.transaction).toHaveBeenCalledWith(
      'SERIALIZABLE',
      expect.any(Function),
    );
    expect(result.valuationTraceability['ins-raw']).toHaveLength(1);
    expect(manager.save).toHaveBeenCalled();
    expect(manager.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        reason: 'PRODUCTION_RECEIPT:v3',
        unitCostNio: 0.75,
        totalCostNio: 3,
      }),
    );
  });

  it('keeps valuation traceability with soft-expired flag from costing service', async () => {
    recipeService.getSnapshot.mockResolvedValue({
      recipeVersion: { id: 'v3' },
      components: [],
    });
    bomExplosionService.explode.mockReturnValue(new Map([['ins-raw', 1]]));
    batchRepo.find.mockResolvedValue([]);
    batchCostingService.buildValuationTrace.mockReturnValue([
      {
        batchId: 'expired-1',
        consumedQuantity: 1,
        unitCostNio: 2,
        totalCostNio: 2,
        isSoftExpired: true,
      },
    ]);

    const result = await service.processOrder({
      tenantId: 'tenant-A',
      recipeVersionId: 'v3',
      orderQuantity: 1,
      producedInsumoId: 'ins-finished',
      producedBatchNumber: 'PB-002',
      producedExpirationDate: new Date('2026-12-01T00:00:00.000Z'),
      operationDate: new Date('2026-05-01T00:00:00.000Z'),
    });

    expect(result.valuationTraceability['ins-raw'][0].isSoftExpired).toBe(true);
  });
});
