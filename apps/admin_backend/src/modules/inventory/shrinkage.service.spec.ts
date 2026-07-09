import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ShrinkageService } from './shrinkage.service';
import { Insumo } from './entities/insumo.entity';
import {
  InventoryMovement,
  MovementType,
} from './entities/inventory-movement.entity';
import { ForensicAlertService } from './forensic-alert.service';
import { Product } from './entities/product.entity';
import { RecipeService } from './recipe.service';
import { BomExplosionService } from './bom-explosion.service';

type TransactionManager = {
  findOne: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
  query: jest.Mock;
};

describe('ShrinkageService', () => {
  let service: ShrinkageService;

  const insumoRepo = {};
  const movementRepo = {};
  const save = jest.fn();
  const findOne = jest.fn();
  const create = jest.fn();
  const query = jest.fn();
  const transaction = jest.fn();
  const forensicAlertService = { create: jest.fn() };
  const productRepo = {};
  const recipeService = {
    findActiveVersion: jest.fn(),
    getSnapshot: jest.fn(),
  };
  const bomExplosionService = { explode: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    transaction.mockImplementation(
      (cb: (manager: TransactionManager) => Promise<unknown>) =>
        cb({ findOne, save, create, query }),
    );
    create.mockImplementation((_entity: unknown, payload: unknown) => payload);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShrinkageService,
        { provide: getRepositoryToken(Insumo), useValue: insumoRepo },
        { provide: getRepositoryToken(Product), useValue: productRepo },
        {
          provide: getRepositoryToken(InventoryMovement),
          useValue: movementRepo,
        },
        { provide: DataSource, useValue: { transaction } },
        { provide: ForensicAlertService, useValue: forensicAlertService },
        { provide: RecipeService, useValue: recipeService },
        { provide: BomExplosionService, useValue: bomExplosionService },
      ],
    }).compile();

    service = module.get<ShrinkageService>(ShrinkageService);
  });

  it('rejects non-whitelisted shrinkage types', async () => {
    await expect(
      service.recordShrinkage('ins-1', 2.3456, 'UNKNOWN_TYPE', 'Spoiled'),
    ).rejects.toThrow('Invalid shrinkage type');
  });

  it('rejects shrinkage without an observation', async () => {
    await expect(
      service.recordShrinkage('ins-1', 2.3456, 'DESECHO_COCINA', '  '),
    ).rejects.toThrow('Merma observation is required');
  });

  it('posts shrinkage with 4-decimal costing and emits alert for high value adjustment', async () => {
    findOne.mockResolvedValue({
      id: 'ins-1',
      tenant_id: 'tenant-1',
      name: 'Tomate',
      stock: 100,
      existenciaActual: 100,
      averageCost: 800,
    });

    save
      .mockResolvedValueOnce({ id: 'ins-1', stock: 97.6544 })
      .mockResolvedValueOnce({ id: 'mov-1' });

    await service.recordShrinkage(
      'ins-1',
      2.3456,
      'MALA_PREPARACION',
      'Batch spoiled during prep',
    );

    expect(create).toHaveBeenCalledWith(
      InventoryMovement,
      expect.objectContaining({
        quantity: -2.3456,
        unitCostNio: 800,
        totalCostNio: 1876.48,
        averageCostAfterNio: 800,
        reason: 'DESECHO_COCINA',
        observation: 'Batch spoiled during prep',
      }),
    );
    expect(forensicAlertService.create).toHaveBeenCalledTimes(1);
  });

  it('explodes plated-product shrinkage into ingredient deltas using last-known CPP and allows negative stock', async () => {
    findOne.mockImplementation(
      (entity: unknown, options: { where: { id: string } }) => {
        if (entity === Product) {
          return Promise.resolve({
            id: 'prod-plate',
            tenant_id: 'tenant-1',
            name: 'Burger plate',
          });
        }
        if (entity === Insumo && options.where.id === 'ins-beef') {
          return Promise.resolve({
            id: 'ins-beef',
            tenant_id: 'tenant-1',
            name: 'Beef',
            stock: 0.25,
            existenciaActual: 0.25,
            averageCost: 300,
          });
        }
        return Promise.resolve(null);
      },
    );
    recipeService.findActiveVersion.mockResolvedValue({ id: 'rv-active' });
    recipeService.getSnapshot.mockResolvedValue({
      recipeVersion: { id: 'rv-active' },
      components: [],
    });
    bomExplosionService.explode.mockReturnValue(new Map([['ins-beef', 1]]));

    await service.recordProductShrinkage({
      productId: 'prod-plate',
      quantity: 2,
      reason: 'DESECHO_COCINA',
      observation: 'Two plated products discarded after prep',
    });

    expect(create).toHaveBeenCalledWith(
      InventoryMovement,
      expect.objectContaining({
        insumoId: 'ins-beef',
        type: MovementType.SHRINKAGE,
        quantity: -1,
        previousStock: 0.25,
        newStock: -0.75,
        unitCostNio: 300,
        totalCostNio: 300,
        sourceDocumentType: 'SHRINKAGE',
      }),
    );
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ins-beef', stock: -0.75 }),
    );
  });
});
