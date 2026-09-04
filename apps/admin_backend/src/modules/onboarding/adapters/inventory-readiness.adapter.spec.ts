import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InventoryReadinessAdapter } from './inventory-readiness.adapter';
import { Warehouse } from '../../inventory/entities/warehouse.entity';
import { Insumo } from '../../inventory/entities/insumo.entity';
import { Product } from '../../inventory/entities/product.entity';

describe('InventoryReadinessAdapter (Unit)', () => {
  let adapter: InventoryReadinessAdapter;
  let warehouseRepo: jest.Mocked<Partial<Repository<Warehouse>>>;
  let insumoRepo: jest.Mocked<Partial<Repository<Insumo>>>;
  let productRepo: jest.Mocked<Partial<Repository<Product>>>;

  beforeEach(async () => {
    warehouseRepo = {
      count: jest.fn(),
    };
    insumoRepo = {
      count: jest.fn(),
    };
    productRepo = {
      count: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryReadinessAdapter,
        {
          provide: getRepositoryToken(Warehouse),
          useValue: warehouseRepo,
        },
        {
          provide: getRepositoryToken(Insumo),
          useValue: insumoRepo,
        },
        {
          provide: getRepositoryToken(Product),
          useValue: productRepo,
        },
      ],
    }).compile();

    adapter = module.get<InventoryReadinessAdapter>(InventoryReadinessAdapter);
  });

  it('evaluates inventory readiness as true when warehouse or products exist, even with ZERO physical stock (AC-07, AC-40)', async () => {
    (warehouseRepo.count as jest.Mock).mockResolvedValue(1);
    (productRepo.count as jest.Mock)
      .mockResolvedValueOnce(3) // total active products
      .mockResolvedValueOnce(0); // products with stock > 0
    (insumoRepo.count as jest.Mock)
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
  });

  it('evaluates inventory readiness as false with scope NONE when no warehouses, products or insumos exist', async () => {
    (warehouseRepo.count as jest.Mock).mockResolvedValue(0);
    (productRepo.count as jest.Mock)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    (insumoRepo.count as jest.Mock)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    const result = await adapter.evaluateInventoryReadiness('tenant-empty');

    expect(result.inventoryReady).toBe(false);
    expect(result.scope).toBe('NONE');
    expect(result.warehouseCount).toBe(0);
    expect(result.hasDefaultWarehouse).toBe(false);
  });

  it('triangulates ADVANCED scope when warehouses and insumos are configured', async () => {
    (warehouseRepo.count as jest.Mock).mockResolvedValue(2);
    (productRepo.count as jest.Mock)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(2);
    (insumoRepo.count as jest.Mock)
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(4);

    const result = await adapter.evaluateInventoryReadiness('tenant-advanced');

    expect(result.inventoryReady).toBe(true);
    expect(result.scope).toBe('ADVANCED');
    expect(result.warehouseCount).toBe(2);
    expect(result.trackedProductCount).toBe(5);
    expect(result.trackedInsumoCount).toBe(10);
    expect(result.itemsWithStockCount).toBe(6);
  });
});
