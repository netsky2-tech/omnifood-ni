import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CostingReadinessAdapter } from './costing-readiness.adapter';
import { Product, ProductType } from '../../inventory/entities/product.entity';
import { InventoryMovement } from '../../inventory/entities/inventory-movement.entity';

describe('CostingReadinessAdapter (Unit)', () => {
  let adapter: CostingReadinessAdapter;
  let productRepo: jest.Mocked<Partial<Repository<Product>>>;
  let movementRepo: jest.Mocked<Partial<Repository<InventoryMovement>>>;

  beforeEach(async () => {
    productRepo = {
      find: jest.fn(),
    };
    movementRepo = {
      count: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CostingReadinessAdapter,
        {
          provide: getRepositoryToken(Product),
          useValue: productRepo,
        },
        {
          provide: getRepositoryToken(InventoryMovement),
          useValue: movementRepo,
        },
      ],
    }).compile();

    adapter = module.get<CostingReadinessAdapter>(CostingReadinessAdapter);
  });

  it('marks product with averageCost = 0 as COST_PENDING when no inventory provenance exists (AC-08)', async () => {
    const products = [
      {
        id: 'prod-1',
        name: 'Gaseosa Cola',
        sellPrice: 30,
        averageCost: 0,
        is_active: true,
        product_type: ProductType.SIMPLE,
      } as Product,
    ];
    (productRepo.find as jest.Mock).mockResolvedValue(products);
    (movementRepo.count as jest.Mock).mockResolvedValue(0);

    const result = await adapter.evaluateCostingReadiness('tenant-test');

    expect(result.costingReady).toBe(false);
    expect(result.totalProducts).toBe(1);
    expect(result.knownCostCount).toBe(0);
    expect(result.pendingCostCount).toBe(1);
    expect(result.items[0]).toEqual({
      productId: 'prod-1',
      productName: 'Gaseosa Cola',
      state: 'COST_PENDING',
      reason: 'ZERO_COST_WITHOUT_INVENTORY_PROVENANCE',
      provenance: 'NONE',
    });
  });

  it('marks product with averageCost > 0 as KNOWN(value) (AC-41)', async () => {
    const products = [
      {
        id: 'prod-2',
        name: 'Café Espresso',
        sellPrice: 45,
        averageCost: 15.5,
        is_active: true,
        product_type: ProductType.SIMPLE,
      } as Product,
    ];
    (productRepo.find as jest.Mock).mockResolvedValue(products);

    const result = await adapter.evaluateCostingReadiness('tenant-test');

    expect(result.costingReady).toBe(true);
    expect(result.totalProducts).toBe(1);
    expect(result.knownCostCount).toBe(1);
    expect(result.pendingCostCount).toBe(0);
    expect(result.items[0]).toEqual({
      productId: 'prod-2',
      productName: 'Café Espresso',
      state: 'KNOWN',
      value: 15.5,
      provenance: 'MANUAL_INITIAL_PROVENANCE',
    });
  });

  it('triangulates multiple products with mixed states: KNOWN, COST_PENDING, and NOT_APPLICABLE', async () => {
    const products = [
      {
        id: 'prod-known',
        name: 'Sandwich Mixto',
        sellPrice: 120,
        averageCost: 60,
        is_active: true,
        product_type: ProductType.SIMPLE,
      } as Product,
      {
        id: 'prod-pending',
        name: 'Jugo Natural',
        sellPrice: 40,
        averageCost: 0,
        is_active: true,
        product_type: ProductType.SIMPLE,
      } as Product,
      {
        id: 'prod-service',
        name: 'Servicio de Descorche',
        sellPrice: 150,
        averageCost: 0,
        category_code: 'SERVICIOS',
        is_active: true,
        product_type: ProductType.SIMPLE,
      } as Product,
    ];
    (productRepo.find as jest.Mock).mockResolvedValue(products);
    (movementRepo.count as jest.Mock).mockResolvedValue(0);

    const result = await adapter.evaluateCostingReadiness('tenant-test');

    expect(result.costingReady).toBe(false);
    expect(result.totalProducts).toBe(3);
    expect(result.knownCostCount).toBe(1);
    expect(result.pendingCostCount).toBe(1);
    expect(result.notApplicableCount).toBe(1);

    expect(result.items).toContainEqual({
      productId: 'prod-service',
      productName: 'Servicio de Descorche',
      state: 'NOT_APPLICABLE',
      reason: 'SERVICE_OR_NON_INVENTORIABLE',
      provenance: 'NONE',
    });
  });
});
