import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { InventoryAdjustmentService } from './inventory-adjustment.service';
import {
  InventoryMovement,
  MovementType,
} from './entities/inventory-movement.entity';

type TransactionManager = {
  findOneByOrFail: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
};

describe('InventoryAdjustmentService', () => {
  let service: InventoryAdjustmentService;
  const findOneByOrFail = jest.fn();
  const create = jest.fn();
  const save = jest.fn();
  const transaction = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    transaction.mockImplementation(
      (cb: (manager: TransactionManager) => Promise<unknown>) =>
        cb({ findOneByOrFail, create, save }),
    );
    create.mockImplementation((_entity: unknown, payload: unknown) => payload);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryAdjustmentService,
        { provide: DataSource, useValue: { transaction } },
      ],
    }).compile();

    service = module.get<InventoryAdjustmentService>(
      InventoryAdjustmentService,
    );
  });

  it('creates compensating-only adjustment without mutating original movement', async () => {
    findOneByOrFail.mockResolvedValue({
      id: 'mov-1',
      tenant_id: 'tenant-1',
      insumoId: 'ins-1',
      quantity: -3.5,
      previousStock: 20,
      newStock: 16.5,
      unitCostNio: 12.25,
      totalCostNio: -42.875,
      averageCostAfterNio: 12.25,
    });
    save.mockResolvedValue({ id: 'adj-1' });

    await service.applyCompensatingAdjustment({
      tenantId: 'tenant-1',
      originalMovementId: 'mov-1',
      reason: 'wrong-sign',
      actorUserId: 'user-1',
    });

    expect(create).toHaveBeenCalledWith(
      InventoryMovement,
      expect.objectContaining({
        type: MovementType.ADJUSTMENT,
        quantity: 3.5,
        previousStock: 16.5,
        newStock: 20,
        reason: 'wrong-sign',
        compensationForKardexId: 'mov-1',
        averageCostAfterNio: 12.25,
      }),
    );
  });

  it('preserves structured lineage even when original movement has no total cost snapshot', async () => {
    findOneByOrFail.mockResolvedValue({
      id: 'mov-2',
      tenant_id: 'tenant-1',
      insumoId: 'ins-9',
      quantity: 1.25,
      previousStock: 4,
      newStock: 5.25,
      unitCostNio: 9.5,
      totalCostNio: null,
      averageCostAfterNio: null,
    });
    save.mockResolvedValue({ id: 'adj-2' });

    await service.applyCompensatingAdjustment({
      tenantId: 'tenant-1',
      originalMovementId: 'mov-2',
      reason: 'count-reset',
    });

    expect(create).toHaveBeenCalledWith(
      InventoryMovement,
      expect.objectContaining({
        quantity: -1.25,
        totalCostNio: null,
        averageCostAfterNio: null,
        reason: 'count-reset',
        compensationForKardexId: 'mov-2',
      }),
    );
  });
});
