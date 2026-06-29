import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { InventoryMovementService } from './inventory-movement.service';
import {
  InventoryMovement,
  MovementType,
} from './entities/inventory-movement.entity';

describe('InventoryMovementService', () => {
  let service: InventoryMovementService;
  const saveMock = jest.fn();
  const createMock = jest.fn();
  const getOneMock = jest.fn();
  const setLockMock = jest.fn();
  const whereMock = jest.fn();
  const andWhereMock = jest.fn();
  const createQueryBuilderMock = jest.fn();

  interface TransactionManagerMock {
    createQueryBuilder: typeof createQueryBuilderMock;
    save: typeof saveMock;
    create: typeof createMock;
    update: jest.Mock;
    delete: jest.Mock;
  }

  const manager: TransactionManagerMock = {
    createQueryBuilder: createQueryBuilderMock,
    save: saveMock,
    create: createMock,
    update: jest.fn(),
    delete: jest.fn(),
  };

  const transactionMock = jest.fn();
  type TransactionCallback = (
    transactionManager: TransactionManagerMock,
  ) => Promise<unknown>;

  beforeEach(async () => {
    jest.clearAllMocks();
    getOneMock.mockResolvedValue({
      id: 'ins-1',
      tenant_id: 'tenant-A',
      stock: 10,
      existenciaActual: 10,
      averageCost: 50,
    });

    setLockMock.mockReturnValue({ where: whereMock });
    whereMock.mockReturnValue({ andWhere: andWhereMock });
    andWhereMock.mockReturnValue({ getOne: getOneMock });
    createQueryBuilderMock.mockReturnValue({ setLock: setLockMock });

    saveMock.mockImplementation((_entity: unknown, payload: unknown) =>
      Promise.resolve(payload),
    );
    createMock.mockImplementation(
      (_entity: unknown, payload: unknown) => payload,
    );

    transactionMock.mockImplementation(
      (_iso: unknown, cb: TransactionCallback) => Promise.resolve(cb(manager)),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryMovementService,
        {
          provide: DataSource,
          useValue: { transaction: transactionMock },
        },
      ],
    }).compile();

    service = module.get<InventoryMovementService>(InventoryMovementService);
  });

  it('uses SERIALIZABLE transaction and row lock', async () => {
    await service.postPurchaseMovement({
      tenantId: 'tenant-A',
      insumoId: 'ins-1',
      quantity: 2,
      unitCostNio: 40,
    });

    expect(transactionMock).toHaveBeenCalledWith(
      'SERIALIZABLE',
      expect.any(Function),
    );
    expect(setLockMock).toHaveBeenCalledWith('pessimistic_write');
  });

  it('appends purchase movement without mutating historical rows', async () => {
    await service.postPurchaseMovement({
      tenantId: 'tenant-A',
      insumoId: 'ins-1',
      quantity: 2,
      unitCostNio: 40,
    });

    expect(createMock).toHaveBeenCalledWith(
      InventoryMovement,
      expect.objectContaining({
        type: MovementType.PURCHASE,
        quantity: 2,
        previousStock: 10,
        newStock: 12,
        unitCostNio: 40,
        totalCostNio: 80,
        averageCostAfterNio: 48.3333,
      }),
    );
    expect(manager.update).not.toHaveBeenCalled();
    expect(manager.delete).not.toHaveBeenCalled();
  });

  it('freezes each purchase cost snapshot even when later purchases change the current average cost', async () => {
    let state = {
      id: 'ins-1',
      tenant_id: 'tenant-A',
      stock: 10,
      existenciaActual: 10,
      averageCost: 50,
    };

    const movementSnapshots: Array<Record<string, unknown>> = [];

    getOneMock.mockImplementation(() => Promise.resolve({ ...state }));
    createMock.mockImplementation((_entity: unknown, payload: unknown) => {
      const movement = payload as Record<string, unknown>;
      movementSnapshots.push({ ...movement });
      return payload;
    });
    saveMock.mockImplementation((entity: unknown, payload: unknown) => {
      if (entity !== InventoryMovement) {
        const updated = payload as {
          stock: number;
          existenciaActual: number;
          averageCost: number;
        };
        state = {
          ...state,
          stock: updated.stock,
          existenciaActual: updated.existenciaActual,
          averageCost: updated.averageCost,
        };
      }

      return Promise.resolve(payload);
    });

    await service.postPurchaseMovement({
      tenantId: 'tenant-A',
      insumoId: 'ins-1',
      quantity: 2,
      unitCostNio: 40,
    });
    await service.postPurchaseMovement({
      tenantId: 'tenant-A',
      insumoId: 'ins-1',
      quantity: 4,
      unitCostNio: 30,
    });

    expect(movementSnapshots).toEqual([
      expect.objectContaining({
        unitCostNio: 40,
        newStock: 12,
        averageCostAfterNio: 48.3333,
      }),
      expect.objectContaining({
        unitCostNio: 30,
        newStock: 16,
        averageCostAfterNio: 43.75,
      }),
    ]);
  });

  it('keeps deterministic NUMERIC(14,4) precision across 1000 fractional operations', async () => {
    let state = {
      id: 'ins-1',
      tenant_id: 'tenant-A',
      stock: 0,
      existenciaActual: 0,
      averageCost: 0,
    };

    getOneMock.mockImplementation(() => Promise.resolve({ ...state }));
    saveMock.mockImplementation((entity: unknown, payload: unknown) => {
      if (entity !== InventoryMovement) {
        const updated = payload as {
          stock: number;
          existenciaActual: number;
          averageCost: number;
        };
        state = {
          ...state,
          stock: updated.stock,
          existenciaActual: updated.existenciaActual,
          averageCost: updated.averageCost,
        };
      }

      return Promise.resolve(payload);
    });

    for (let i = 0; i < 1000; i += 1) {
      await service.postPurchaseMovement({
        tenantId: 'tenant-A',
        insumoId: 'ins-1',
        quantity: 0.1,
        unitCostNio: 0.3,
      });
    }

    expect(state.stock).toBe(100);
    expect(state.averageCost).toBe(0.3);

    const movementRows: Array<{ newStock: number; unitCostNio: number }> = [];
    for (const call of createMock.mock.calls as unknown[][]) {
      const movement = call[1] as Record<string, unknown>;
      if (
        typeof movement.newStock === 'number' &&
        typeof movement.unitCostNio === 'number'
      ) {
        movementRows.push({
          newStock: movement.newStock,
          unitCostNio: movement.unitCostNio,
        });
      }
    }

    expect(movementRows).toHaveLength(1000);
    for (const movement of movementRows) {
      expect(Number(movement.newStock.toFixed(4))).toBe(movement.newStock);
      expect(Number(movement.unitCostNio.toFixed(4))).toBe(
        movement.unitCostNio,
      );
    }
  });
});
