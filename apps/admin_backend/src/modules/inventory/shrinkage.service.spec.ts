import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ShrinkageService } from './shrinkage.service';
import { Insumo } from './entities/insumo.entity';
import { InventoryMovement } from './entities/inventory-movement.entity';
import { ForensicAlertService } from './forensic-alert.service';

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
        {
          provide: getRepositoryToken(InventoryMovement),
          useValue: movementRepo,
        },
        { provide: DataSource, useValue: { transaction } },
        { provide: ForensicAlertService, useValue: forensicAlertService },
      ],
    }).compile();

    service = module.get<ShrinkageService>(ShrinkageService);
  });

  it('rejects non-whitelisted shrinkage types', async () => {
    await expect(
      service.recordShrinkage('ins-1', 2.3456, 'UNKNOWN_TYPE'),
    ).rejects.toThrow('Invalid shrinkage type');
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

    await service.recordShrinkage('ins-1', 2.3456, 'DESECHO_COCINA');

    expect(create).toHaveBeenCalledWith(
      InventoryMovement,
      expect.objectContaining({
        quantity: -2.3456,
        unitCostNio: 800,
        totalCostNio: 1876.48,
      }),
    );
    expect(forensicAlertService.create).toHaveBeenCalledTimes(1);
  });
});
