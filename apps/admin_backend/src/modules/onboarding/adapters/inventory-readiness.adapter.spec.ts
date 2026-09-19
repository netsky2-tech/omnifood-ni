import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { InventoryReadinessAdapter } from './inventory-readiness.adapter';
import { Warehouse } from '../../inventory/entities/warehouse.entity';
import { Insumo } from '../../inventory/entities/insumo.entity';
import { Product } from '../../inventory/entities/product.entity';
import { Invoice } from '../../sales/entities/invoice.entity';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../../core/database/tenant-transaction';

describe('InventoryReadinessAdapter (Unit)', () => {
  let adapter: InventoryReadinessAdapter;
  let warehouseRepo: { count: jest.Mock };
  let insumoRepo: { count: jest.Mock };
  let productRepo: { count: jest.Mock };
  let invoiceRepo: { count: jest.Mock };
  let managerQuery: jest.Mock;
  let manager: {
    query: jest.Mock;
    getRepository: jest.Mock;
  };

  const getManagerRepositories = (): Map<unknown, { count: jest.Mock }> => {
    const repos = new Map<unknown, { count: jest.Mock }>();
    repos.set(Warehouse, warehouseRepo);
    repos.set(Insumo, insumoRepo);
    repos.set(Product, productRepo);
    repos.set(Invoice, invoiceRepo);
    return repos;
  };

  const getEntityLabel = (entityClass: unknown): string =>
    typeof entityClass === 'function' && entityClass.name
      ? entityClass.name
      : 'unknown-entity';

  beforeEach(async () => {
    warehouseRepo = { count: jest.fn() };
    insumoRepo = { count: jest.fn() };
    productRepo = { count: jest.fn() };
    invoiceRepo = { count: jest.fn().mockResolvedValue(0) };

    // Every readiness query must run through the transaction manager
    // (issue #358): the adapter binds the tenant context on the manager
    // before any repository access, so the mock manager dispatches
    // getRepository(Entity) calls instead of exposing injected
    // default-connection repositories.
    managerQuery = jest.fn(() => Promise.resolve([]));
    manager = {
      query: managerQuery,
      getRepository: jest.fn((entityClass: unknown) => {
        const repo = getManagerRepositories().get(entityClass);
        if (!repo) {
          throw new Error(
            `unexpected repository requested: ${getEntityLabel(entityClass)}`,
          );
        }
        return repo;
      }),
    };

    const dataSource = {
      transaction: jest.fn((cb: (mgr: typeof manager) => Promise<unknown>) =>
        cb(manager),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryReadinessAdapter,
        {
          provide: DataSource,
          useValue: dataSource,
        },
      ],
    }).compile();

    adapter = module.get<InventoryReadinessAdapter>(InventoryReadinessAdapter);
  });

  it('binds the tenant context with a parameterized set_config on the transaction manager before any readiness query', async () => {
    warehouseRepo.count.mockResolvedValue(1);
    productRepo.count.mockResolvedValueOnce(3).mockResolvedValueOnce(0);
    insumoRepo.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

    await adapter.evaluateInventoryReadiness('  tenant-bind-1  ');

    expect(managerQuery).toHaveBeenCalledWith(TENANT_CONTEXT_SET_CONFIG_SQL, [
      'tenant-bind-1',
    ]);
    // The trim matters: the bound parameter must be the trimmed id.
    const setConfigCalls = managerQuery.mock.calls.filter(
      (call) => call[0] === TENANT_CONTEXT_SET_CONFIG_SQL,
    );
    expect(setConfigCalls).toHaveLength(1);

    // Every entity repository is resolved from the transaction manager.
    for (const entity of [Warehouse, Product, Insumo, Invoice]) {
      expect(manager.getRepository).toHaveBeenCalledWith(entity);
    }
  });

  it('evaluates inventory readiness as true when warehouse or products exist, even with ZERO physical stock (AC-07, AC-40)', async () => {
    warehouseRepo.count.mockResolvedValue(1);
    productRepo.count
      .mockResolvedValueOnce(3) // total active products
      .mockResolvedValueOnce(0); // products with stock > 0
    insumoRepo.count
      .mockResolvedValueOnce(0) // total insumos
      .mockResolvedValueOnce(0); // insumos with stock > 0

    const result = await adapter.evaluateInventoryReadiness('tenant-test-1');

    expect(result.inventoryReady).toBe(true);
    expect(result.warehouseCount).toBe(1);
    expect(result.trackedProductCount).toBe(3);
    expect(result.trackedInsumoCount).toBe(0);
    expect(result.itemsWithStockCount).toBe(0);
    expect(result.hasDefaultWarehouse).toBe(true);
    expect(result.scope).toBe('BASIC');
    expect(result.inventoryEnrichmentPendingCount).toBe(0);
  });

  it('includes INVENTORY_ENRICHMENT_PENDING warning and count when pending enrichment invoices exist', async () => {
    warehouseRepo.count.mockResolvedValue(1);
    productRepo.count.mockResolvedValue(1);
    insumoRepo.count.mockResolvedValue(1);
    invoiceRepo.count.mockResolvedValue(4);

    const result = await adapter.evaluateInventoryReadiness(
      'tenant-test-pending',
    );
    expect(result.inventoryReady).toBe(true);
    expect(result.inventoryEnrichmentPendingCount).toBe(4);
    expect(result.notes).toContain('INVENTORY_ENRICHMENT_PENDING');
  });

  it('evaluates inventory readiness as false with scope NONE when no warehouses, products or insumos exist', async () => {
    warehouseRepo.count.mockResolvedValue(0);
    productRepo.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    insumoRepo.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

    const result = await adapter.evaluateInventoryReadiness('tenant-empty');

    expect(result.inventoryReady).toBe(false);
    expect(result.scope).toBe('NONE');
    expect(result.warehouseCount).toBe(0);
    expect(result.hasDefaultWarehouse).toBe(false);
  });

  it('triangulates ADVANCED scope when warehouses and insumos are configured', async () => {
    warehouseRepo.count.mockResolvedValue(2);
    productRepo.count.mockResolvedValueOnce(5).mockResolvedValueOnce(2);
    insumoRepo.count.mockResolvedValueOnce(10).mockResolvedValueOnce(4);

    const result = await adapter.evaluateInventoryReadiness('tenant-advanced');

    expect(result.inventoryReady).toBe(true);
    expect(result.scope).toBe('ADVANCED');
    expect(result.warehouseCount).toBe(2);
    expect(result.trackedProductCount).toBe(5);
    expect(result.trackedInsumoCount).toBe(10);
    expect(result.itemsWithStockCount).toBe(6);
  });
});
