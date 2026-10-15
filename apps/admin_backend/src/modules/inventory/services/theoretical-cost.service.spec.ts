import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TheoreticalCostService } from './theoretical-cost.service';
import { CostCalculatorService } from '../cost-calculator.service';
import { RecipeService } from '../recipe.service';
import { Product, ProductType } from '../entities/product.entity';
import { Insumo } from '../entities/insumo.entity';

/**
 * R8 (H8): the orchestrator that turns a product's recipe plus its
 * components' CPPs into the per-dish theoretical cost and gross margin. The
 * arithmetic lives in CostCalculatorService and is covered there; these tests
 * pin WHAT this service feeds it.
 */
describe('TheoreticalCostService (R8)', () => {
  const productFind = jest.fn();
  const productFindOne = jest.fn();
  const insumoFindOne = jest.fn();
  const query = jest.fn();
  const manager = {
    query,
    getRepository: jest.fn((entity: unknown) => {
      if (entity === Product) {
        return { find: productFind, findOne: productFindOne };
      }
      if (entity === Insumo) {
        return { findOne: insumoFindOne };
      }
      throw new Error('Unexpected repository');
    }),
  };
  const transaction = jest.fn(
    async (work: (m: unknown) => unknown) => work(manager),
  );
  const dataSource = { transaction } as unknown as DataSource;
  const recipeService = {
    findActiveVersion: jest.fn(),
    getSnapshot: jest.fn(),
  };
  const costCalculator = { calculateRecipeTheoreticalCost: jest.fn() };

  const service = new TheoreticalCostService(
    dataSource,
    recipeService as unknown as RecipeService,
    costCalculator as unknown as CostCalculatorService,
  );

  const calculatorResult = (unitTheoreticalCostNio: number) => ({
    totalBatchCostNio: unitTheoreticalCostNio,
    unitTheoreticalCostNio,
    yieldQuantity: 1,
    components: [],
    grossMarginNio: undefined,
    grossMarginPct: undefined,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    query.mockResolvedValue(undefined);
    transaction.mockImplementation(
      async (work: (m: unknown) => unknown) => work(manager),
    );
  });

  it('prices an INSUMO component from its CPP and passes the selling price', async () => {
    productFindOne.mockResolvedValue({
      id: 'prod-1',
      name: 'Lasagna',
      sellPrice: 20,
    });
    recipeService.findActiveVersion.mockResolvedValue({
      id: 'rv-1',
      yield_quantity: 2,
    });
    recipeService.getSnapshot.mockResolvedValue({
      components: [
        {
          insumo_id: 'ins-1',
          ingredient_name: 'Queso',
          ingredient_type: 'INSUMO',
          gross_quantity: 3,
          technical_shrink_pct: 0,
        },
      ],
    });
    insumoFindOne.mockResolvedValue({
      id: 'ins-1',
      name: 'Queso',
      averageCost: 4,
    });
    costCalculator.calculateRecipeTheoreticalCost.mockReturnValue(
      calculatorResult(6),
    );

    const dish = await service.getProductTheoreticalCost('tenant-1', 'prod-1');

    expect(costCalculator.calculateRecipeTheoreticalCost).toHaveBeenCalledWith({
      yieldQuantity: 2,
      sellingPriceNio: 20,
      components: [
        {
          ingredientId: 'ins-1',
          ingredientName: 'Queso',
          ingredientType: 'INSUMO',
          grossQuantity: 3,
          technicalShrinkPct: 0,
          unitCostNio: 4,
          totalCostNio: 12,
          costPercentage: 0,
        },
      ],
    });
    expect(dish).toMatchObject({
      productId: 'prod-1',
      unitTheoreticalCostNio: 6,
      yieldQuantity: 1,
    });
  });

  it('rolls a SUB_RECIPE component up through its own recipe', async () => {
    productFindOne.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === 'prod-parent'
        ? { id: 'prod-parent', name: 'Plato', sellPrice: 50 }
        : { id: 'prod-sub', name: 'Salsa', sellPrice: 0 },
    );
    recipeService.findActiveVersion.mockImplementation(
      async (_tenant: string, productId: string) =>
        productId === 'prod-parent'
          ? { id: 'rv-parent', yield_quantity: 1 }
          : { id: 'rv-sub', yield_quantity: 1 },
    );
    recipeService.getSnapshot.mockImplementation(
      async (versionId: string) =>
        versionId === 'rv-parent'
          ? {
              components: [
                {
                  insumo_id: 'prod-sub',
                  ingredient_name: 'Salsa',
                  ingredient_type: 'SUB_RECIPE',
                  gross_quantity: 2,
                  technical_shrink_pct: 0,
                },
              ],
            }
          : {
              components: [
                {
                  insumo_id: 'ins-leaf',
                  ingredient_name: 'Tomate',
                  ingredient_type: 'INSUMO',
                  gross_quantity: 4,
                  technical_shrink_pct: 0,
                },
              ],
            },
    );
    insumoFindOne.mockResolvedValue({ id: 'ins-leaf', averageCost: 5 });
    // Sub-recipe unit cost 20; the parent consumes 2 of it.
    costCalculator.calculateRecipeTheoreticalCost.mockImplementation(
      (input: { components: Array<{ ingredientType: string }> }) =>
        calculatorResult(input.components[0].ingredientType === 'SUB_RECIPE' ? 40 : 20),
    );

    await service.getProductTheoreticalCost('tenant-1', 'prod-parent');

    const parentCall = costCalculator.calculateRecipeTheoreticalCost.mock.calls
      .map(([input]) => input)
      .find((input) => input.components[0].ingredientType === 'SUB_RECIPE');
    expect(parentCall.components[0]).toMatchObject({
      ingredientId: 'prod-sub',
      ingredientType: 'SUB_RECIPE',
      grossQuantity: 2,
      unitCostNio: 20,
      totalCostNio: 40,
    });
  });

  it('fails when the product has no active published recipe', async () => {
    productFindOne.mockResolvedValue({ id: 'prod-1', name: 'Lasagna' });
    recipeService.findActiveVersion.mockResolvedValue(null);

    await expect(
      service.getProductTheoreticalCost('tenant-1', 'prod-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('reports a circular sub-recipe reference instead of looping', async () => {
    productFindOne.mockResolvedValue({ id: 'prod-a', name: 'A' });
    recipeService.findActiveVersion.mockResolvedValue({
      id: 'rv-a',
      yield_quantity: 1,
    });
    recipeService.getSnapshot.mockResolvedValue({
      components: [
        {
          insumo_id: 'prod-a',
          ingredient_type: 'SUB_RECIPE',
          gross_quantity: 1,
          technical_shrink_pct: 0,
        },
      ],
    });

    await expect(
      service.getProductTheoreticalCost('tenant-1', 'prod-a'),
    ).rejects.toThrow(BadRequestException);
  });

  it('lists dish margins and reports the ones it had to skip', async () => {
    productFind.mockResolvedValueOnce([
      { id: 'prod-ok', name: 'Ok', product_type: ProductType.COMPOUND },
      { id: 'prod-bad', name: 'Bad', product_type: ProductType.COMPOUND },
    ]);
    productFind.mockResolvedValueOnce([]);
    productFindOne.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === 'prod-bad') {
        return { id: 'prod-bad', name: 'Bad', sellPrice: 10 };
      }
      return { id: 'prod-ok', name: 'Ok', sellPrice: 10 };
    });
    recipeService.findActiveVersion.mockImplementation(
      async (_tenant: string, productId: string) =>
        productId === 'prod-bad' ? null : { id: 'rv-ok', yield_quantity: 1 },
    );
    recipeService.getSnapshot.mockResolvedValue({ components: [] });
    costCalculator.calculateRecipeTheoreticalCost.mockReturnValue(
      calculatorResult(3),
    );

    const result = await service.listDishMargins('tenant-1');

    expect(result.dishes.map((dish) => dish.productId)).toEqual(['prod-ok']);
    expect(result.skipped).toEqual([
      expect.objectContaining({ productId: 'prod-bad' }),
    ]);
  });
});
