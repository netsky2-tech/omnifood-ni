import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import {
  CURRENCY,
  FX_RATE_RESOLVER,
  InventoryPurchaseService,
} from './inventory-purchase.service';
import { Batch } from './entities/batch.entity';
import { Insumo } from './entities/insumo.entity';
import { InventoryMovement } from './entities/inventory-movement.entity';

describe('InventoryPurchaseService', () => {
  let service: InventoryPurchaseService;
  const resolveBcnRateByDate = jest.fn();
  const transaction = jest.fn();
  const findOne = jest.fn();

  const manager = {
    createQueryBuilder: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  const queryBuilder = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };

  const dataSource = {
    transaction,
    getRepository: jest.fn().mockReturnValue({ findOne }),
  };

  const perishableInsumo: Partial<Insumo> = {
    id: 'ins-1',
    tenant_id: 'tenant-A',
    stock: 10,
    averageCost: 50,
    existenciaActual: 10,
    is_perishable: true,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    manager.createQueryBuilder.mockReturnValue(queryBuilder);
    transaction.mockImplementation(
      (
        _isolation: string,
        handler: (entityManager: typeof manager) => unknown,
      ) => handler(manager),
    );
    findOne.mockResolvedValue(perishableInsumo);
    queryBuilder.getOne.mockResolvedValue({ ...perishableInsumo });
    manager.create.mockImplementation(
      (_entity: unknown, payload: Record<string, unknown>) => payload,
    );
    manager.save.mockImplementation(
      (_entity: unknown, payload: Record<string, unknown>) => payload,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryPurchaseService,
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: FX_RATE_RESOLVER,
          useValue: { resolveBcnRateByDate },
        },
      ],
    }).compile();

    service = module.get<InventoryPurchaseService>(InventoryPurchaseService);
  });

  it('converts USD purchase using BCN rate for invoice date', async () => {
    resolveBcnRateByDate.mockResolvedValue(36.5);

    const preview = await service.previewPurchase({
      tenantId: 'tenant-A',
      insumoId: 'ins-1',
      quantity: 10,
      unitCost: 2,
      currency: CURRENCY.USD,
      invoiceDate: '2026-01-01',
    });

    expect(resolveBcnRateByDate).toHaveBeenCalledWith('2026-01-01');
    expect(preview.unitCostNio).toBe(73);
    expect(preview.projectedCppNio).toBe(61.5);
    expect(preview.requiresBatchTracking).toBe(true);
  });

  it('keeps NIO purchases in NIO-only CPP input rounded to 4 decimals', async () => {
    queryBuilder.getOne.mockResolvedValue({
      ...perishableInsumo,
      is_perishable: false,
    });
    findOne.mockResolvedValue({
      ...perishableInsumo,
      is_perishable: false,
    });

    const preview = await service.previewPurchase({
      tenantId: 'tenant-A',
      insumoId: 'ins-1',
      quantity: 1,
      unitCost: 10.123456,
      currency: CURRENCY.NIO,
      invoiceDate: '2026-01-02',
    });

    expect(resolveBcnRateByDate).not.toHaveBeenCalled();
    expect(preview.bcnRate).toBe(1);
    expect(preview.unitCostNio).toBe(10.1235);
  });

  it('persists a batch for perishable purchases during posting', async () => {
    resolveBcnRateByDate.mockResolvedValue(36.5);

    await service.recordPurchase({
      tenantId: 'tenant-A',
      insumoId: 'ins-1',
      quantity: 5,
      unitCost: 2,
      currency: CURRENCY.USD,
      invoiceDate: '2026-01-03',
      supplierName: 'Proveedor X',
      lotCode: 'LOT-9',
      receivedDate: '2026-01-03',
      expirationDate: '2026-02-03',
    });

    expect(manager.save).toHaveBeenCalledWith(
      Batch,
      expect.objectContaining({
        batch_number: 'LOT-9',
        received_date: new Date('2026-01-03'),
        expiration_date: new Date('2026-02-03'),
        remaining_stock: 5,
        cost: 73,
      }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      InventoryMovement,
      expect.objectContaining({
        type: 'PURCHASE',
        unitCostNio: 73,
      }),
    );
  });

  it('rejects perishable purchases without batch metadata', async () => {
    await expect(
      service.recordPurchase({
        tenantId: 'tenant-A',
        insumoId: 'ins-1',
        quantity: 5,
        unitCost: 20,
        currency: CURRENCY.NIO,
        invoiceDate: '2026-01-03',
      }),
    ).rejects.toThrow(
      'Batch-managed purchases require lotCode, receivedDate, and expirationDate',
    );
  });
});
