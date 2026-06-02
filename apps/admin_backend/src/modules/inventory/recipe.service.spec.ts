import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RecipeService } from './recipe.service';
import { RecipeVersion } from './entities/recipe-version.entity';
import { RecipeDetail } from './entities/recipe-detail.entity';

describe('RecipeService', () => {
  let service: RecipeService;

  const recipeVersionRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const recipeDetailRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecipeService,
        {
          provide: getRepositoryToken(RecipeVersion),
          useValue: recipeVersionRepo,
        },
        {
          provide: getRepositoryToken(RecipeDetail),
          useValue: recipeDetailRepo,
        },
      ],
    }).compile();

    service = module.get<RecipeService>(RecipeService);
  });

  it('creates new immutable recipe version and computes net usable quantity', async () => {
    recipeVersionRepo.findOne.mockResolvedValue({
      id: 'v7',
      version_number: 7,
      is_active: true,
    });
    recipeVersionRepo.create.mockImplementation((value: unknown) => value);
    recipeVersionRepo.save
      .mockResolvedValueOnce({ id: 'v7', is_active: false })
      .mockResolvedValueOnce({ id: 'v8', version_number: 8, is_active: true });
    recipeDetailRepo.create.mockImplementation((value: unknown) => value);
    recipeDetailRepo.save.mockResolvedValue([]);

    await service.createNewVersion({
      tenantId: 'tenant-A',
      productId: 'prod-1',
      components: [
        { insumoId: 'ins-1', grossQuantity: 1, technicalShrinkPct: 15 },
      ],
    });

    expect(recipeVersionRepo.save).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        is_active: false,
      }),
    );
    expect(recipeVersionRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ version_number: 8, is_active: true }),
    );
    expect(recipeDetailRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        gross_quantity: 1,
        technical_shrink_pct: 15,
        quantity: 0.85,
      }),
    );
  });

  it('returns deterministic ordered snapshot by insumo id', async () => {
    recipeVersionRepo.findOne.mockResolvedValue({ id: 'v3' });
    recipeDetailRepo.find.mockResolvedValue([
      { insumo_id: 'ins-9' },
      { insumo_id: 'ins-1' },
    ]);

    await service.getSnapshot('v3', 'tenant-A');

    expect(recipeDetailRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ order: { insumo_id: 'ASC' } }),
    );
  });
});
