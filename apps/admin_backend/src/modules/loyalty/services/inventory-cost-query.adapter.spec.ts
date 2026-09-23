import { DataSource } from 'typeorm';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../../core/database/tenant-transaction';
import { TypeOrmInventoryCostQueryAdapter } from './inventory-cost-query.adapter';
import { Product } from '../../inventory/entities/product.entity';

describe('TypeOrmInventoryCostQueryAdapter (Unit)', () => {
  let adapter: TypeOrmInventoryCostQueryAdapter;
  // Issue #512 slice 1 part A: the `products` read must resolve from the
  // tenant-bound transaction manager, so the DataSource mock hands back a
  // manager exposing a manager-scoped Product repository.
  let txManager: { query: jest.Mock; getRepository: jest.Mock };
  let mgrProductRepo: { findOne: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  beforeEach(() => {
    mgrProductRepo = {
      findOne: jest.fn(),
    };

    txManager = {
      query: jest.fn().mockResolvedValue(undefined),
      getRepository: jest.fn().mockImplementation((entity: unknown) => {
        if (entity === Product) return mgrProductRepo;
        return null;
      }),
    };

    dataSource = {
      transaction: jest.fn((cb: (mgr: unknown) => Promise<unknown>) =>
        cb(txManager),
      ),
    };

    adapter = new TypeOrmInventoryCostQueryAdapter(
      dataSource as unknown as DataSource,
    );
  });

  it('returns AVAILABLE with sell price and estimated CPP for an existing product', async () => {
    mgrProductRepo.findOne.mockResolvedValue({
      id: 'prod-1',
      tenant_id: 'tenant-A',
      sellPrice: 65,
      averageCost: 32.5,
    });

    const result = await adapter.getCurrentEstimatedCostAndPrice(
      'tenant-A',
      'prod-1',
    );

    expect(result).toEqual({
      status: 'AVAILABLE',
      canonicalBasePriceNio: 65,
      estimatedCppNio: 32.5,
    });
  });

  it('returns NOT_AVAILABLE/PRODUCT_NOT_FOUND when no product matches the tenant', async () => {
    mgrProductRepo.findOne.mockResolvedValue(null);

    const result = await adapter.getCurrentEstimatedCostAndPrice(
      'tenant-A',
      'prod-other-tenant',
    );

    expect(result).toEqual({
      status: 'NOT_AVAILABLE',
      reason: 'PRODUCT_NOT_FOUND',
    });
  });

  it('returns NOT_AVAILABLE/PRODUCT_ID_REQUIRED without issuing any SQL when productId is blank', async () => {
    const result = await adapter.getCurrentEstimatedCostAndPrice(
      'tenant-A',
      '',
    );

    expect(result).toEqual({
      status: 'NOT_AVAILABLE',
      reason: 'PRODUCT_ID_REQUIRED',
    });
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(txManager.query).not.toHaveBeenCalled();
  });

  it('binds the tenant context on the manager before the products read (issue #512)', async () => {
    mgrProductRepo.findOne.mockResolvedValue({
      id: 'prod-1',
      tenant_id: 'tenant-A',
      sellPrice: 10,
      averageCost: 5,
    });

    await adapter.getCurrentEstimatedCostAndPrice('tenant-A', 'prod-1');

    expect(txManager.query).toHaveBeenCalledWith(
      TENANT_CONTEXT_SET_CONFIG_SQL,
      ['tenant-A'],
    );
    expect(txManager.query.mock.invocationCallOrder[0]).toBeLessThan(
      mgrProductRepo.findOne.mock.invocationCallOrder[0],
    );
    expect(txManager.getRepository).toHaveBeenCalledWith(Product);
  });
});
