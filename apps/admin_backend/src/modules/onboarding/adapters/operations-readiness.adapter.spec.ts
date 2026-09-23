import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../../core/database/tenant-transaction';
import { OperationsReadinessAdapter } from './operations-readiness.adapter';
import { User } from '../../identity/entities/user.entity';
import { RecipeVersion } from '../../inventory/entities/recipe-version.entity';
import { Supplier } from '../../inventory/entities/supplier.entity';
import { Product } from '../../inventory/entities/product.entity';

describe('OperationsReadinessAdapter (Unit)', () => {
  let adapter: OperationsReadinessAdapter;
  // Issue #512: the `products` categories read resolves from the
  // tenant-bound transaction manager.
  let txManager: { query: jest.Mock; getRepository: jest.Mock };
  let userRepo: jest.Mocked<Partial<Repository<User>>>;
  let recipeVersionRepo: jest.Mocked<Partial<Repository<RecipeVersion>>>;
  let supplierRepo: jest.Mocked<Partial<Repository<Supplier>>>;
  let productRepo: jest.Mocked<Partial<Repository<Product>>>;

  beforeEach(async () => {
    userRepo = {
      count: jest.fn(),
    };
    recipeVersionRepo = {
      count: jest.fn(),
    };
    supplierRepo = {
      count: jest.fn(),
    };
    productRepo = {
      createQueryBuilder: jest.fn(),
    };

    txManager = {
      query: jest.fn().mockResolvedValue(undefined),
      getRepository: jest.fn().mockImplementation((entity: unknown) => {
        if (entity === Product) return productRepo;
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OperationsReadinessAdapter,
        {
          provide: getRepositoryToken(User),
          useValue: userRepo,
        },
        {
          provide: getRepositoryToken(RecipeVersion),
          useValue: recipeVersionRepo,
        },
        {
          provide: getRepositoryToken(Supplier),
          useValue: supplierRepo,
        },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn((cb: (mgr: unknown) => Promise<unknown>) =>
              cb(txManager),
            ),
          },
        },
      ],
    }).compile();

    adapter = module.get<OperationsReadinessAdapter>(
      OperationsReadinessAdapter,
    );
  });

  it('evaluates operations readiness observing staff, recipes, suppliers, categories without revoking ACTIVATED (AC-26, ONB1.9C)', async () => {
    (userRepo.count as jest.Mock).mockResolvedValue(1); // Only Owner
    (recipeVersionRepo.count as jest.Mock).mockResolvedValue(0);
    (supplierRepo.count as jest.Mock).mockResolvedValue(0);

    const qbMock: any = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    (productRepo.createQueryBuilder as jest.Mock).mockReturnValue(qbMock);

    const result = await adapter.evaluateOperationsReadiness(
      'tenant-founder-only',
    );

    expect(result.staffCount).toBe(1);
    expect(result.additionalStaffCount).toBe(0);
    expect(result.publishedRecipeCount).toBe(0);
    expect(result.supplierCount).toBe(0);
    expect(result.categoryCount).toBe(0);
    expect(result.operationsReady).toBe(false);
    expect(result.details.hasAdditionalStaff).toBe(false);
  });

  it('triangulates operationsReady = true when business has added additional staff and suppliers', async () => {
    (userRepo.count as jest.Mock).mockResolvedValue(3); // Owner + 2 staff
    (recipeVersionRepo.count as jest.Mock).mockResolvedValue(2);
    (supplierRepo.count as jest.Mock).mockResolvedValue(1);

    const qbMock: any = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([{ category_code: 'BEBIDAS' }]),
    };
    (productRepo.createQueryBuilder as jest.Mock).mockReturnValue(qbMock);

    const result = await adapter.evaluateOperationsReadiness('tenant-enriched');

    expect(result.staffCount).toBe(3);
    expect(result.additionalStaffCount).toBe(2);
    expect(result.publishedRecipeCount).toBe(2);
    expect(result.supplierCount).toBe(1);
    expect(result.categoryCount).toBe(1);
    expect(result.operationsReady).toBe(true);
    expect(result.details.hasAdditionalStaff).toBe(true);
    expect(result.details.hasPublishedRecipes).toBe(true);
    expect(result.details.hasSuppliers).toBe(true);
    expect(result.details.hasCategories).toBe(true);
  });

  it('binds the tenant context before the products categories read (issue #512)', async () => {
    (userRepo.count as jest.Mock).mockResolvedValue(1);
    (recipeVersionRepo.count as jest.Mock).mockResolvedValue(0);
    (supplierRepo.count as jest.Mock).mockResolvedValue(0);
    const qbMock: any = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    (productRepo.createQueryBuilder as jest.Mock).mockReturnValue(qbMock);

    await adapter.evaluateOperationsReadiness('tenant-A');

    expect(txManager.query).toHaveBeenCalledWith(
      TENANT_CONTEXT_SET_CONFIG_SQL,
      ['tenant-A'],
    );
    expect(txManager.query.mock.invocationCallOrder[0]).toBeLessThan(
      (productRepo.createQueryBuilder as jest.Mock).mock.invocationCallOrder[0],
    );
    expect(txManager.getRepository).toHaveBeenCalledWith(Product);
  });
});
