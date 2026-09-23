import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../core/database/tenant-transaction';
import { PurchaseService } from './purchase.service';
import { Insumo } from './entities/insumo.entity';
import { Supplier } from './entities/supplier.entity';
import { InventoryMovement } from './entities/inventory-movement.entity';

describe('PurchaseService.recordPurchase', () => {
  let service: PurchaseService;

  const insumo = {
    id: 'ins-1',
    tenant_id: 'tenant-A',
    stock: 10,
    averageCost: 50,
    conversionFactor: 1,
  };
  const supplier = { id: 'sup-1', tenant_id: 'tenant-A', name: 'Acme' };

  const manager = {
    query: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(async (value: unknown) => value),
    create: jest.fn((_entity: unknown, value: unknown) => value),
  };
  const dataSource = {
    transaction: jest.fn(
      <T>(cb: (m: typeof manager) => Promise<T>): Promise<T> => cb(manager),
    ),
    // The pooled repository path must stay unused for this route.
    getRepository: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    manager.findOne.mockImplementation((entity: unknown) => {
      if (entity === Insumo) return Promise.resolve(insumo);
      if (entity === Supplier) return Promise.resolve(supplier);
      return Promise.resolve(null);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseService,
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<PurchaseService>(PurchaseService);
  });

  it('binds app.tenant_id before the first protected read and keeps every access on the transaction manager', async () => {
    const result = await service.recordPurchase('ins-1', 'sup-1', 5, 130, 'tenant-A');

    expect(result).toMatchObject({ id: 'ins-1', stock: 15 });
    expect(manager.query).toHaveBeenCalledWith(TENANT_CONTEXT_SET_CONFIG_SQL, [
      'tenant-A',
    ]);
    // Binding order: transaction-local set_config first, then the Insumo
    // read, all on the same tenant-bound manager.
    expect(manager.query.mock.invocationCallOrder[0]).toBeLessThan(
      manager.findOne.mock.invocationCallOrder[0],
    );
    expect(manager.findOne).toHaveBeenCalledWith(
      Insumo,
      expect.objectContaining({ where: { id: 'ins-1' } }),
    );
    expect(manager.findOne).toHaveBeenCalledWith(
      Supplier,
      expect.objectContaining({ where: { id: 'sup-1' } }),
    );
    // The pooled repository path must never serve this route (issue #512).
    expect(dataSource.getRepository).not.toHaveBeenCalled();
  });

  it('keeps the movement attached to the insumo tenant and the write on the bound manager', async () => {
    await service.recordPurchase('ins-1', 'sup-1', 5, 130, 'tenant-A');

    expect(manager.create).toHaveBeenCalledWith(
      InventoryMovement,
      expect.objectContaining({
        tenant_id: 'tenant-A',
        insumoId: 'ins-1',
        type: 'PURCHASE',
      }),
    );
    expect(manager.save).toHaveBeenCalledTimes(2);
  });

  it('preserves the NotFoundException error semantics of the transaction', async () => {
    manager.findOne.mockImplementation((entity: unknown) =>
      entity === Supplier ? Promise.resolve(supplier) : Promise.resolve(null),
    );

    await expect(
      service.recordPurchase('missing', 'sup-1', 5, 130, 'tenant-A'),
    ).rejects.toThrow(NotFoundException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('fails closed on a blank tenant id before any transaction and issues no SQL', async () => {
    for (const blankTenantId of ['', '   ']) {
      await expect(
        service.recordPurchase('ins-1', 'sup-1', 5, 130, blankTenantId),
      ).rejects.toThrow('TENANT_CONTEXT_REQUIRED');
    }
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(manager.query).not.toHaveBeenCalled();
    expect(manager.findOne).not.toHaveBeenCalled();
  });
});
