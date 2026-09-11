import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OperationsReadinessAdapter } from './operations-readiness.adapter';
import { User } from '../../identity/entities/user.entity';
import { RecipeVersion } from '../../inventory/entities/recipe-version.entity';
import { Supplier } from '../../inventory/entities/supplier.entity';
import { Product } from '../../inventory/entities/product.entity';

describe('OperationsReadinessAdapter (Unit)', () => {
  let adapter: OperationsReadinessAdapter;
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
          provide: getRepositoryToken(Product),
          useValue: productRepo,
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
});
