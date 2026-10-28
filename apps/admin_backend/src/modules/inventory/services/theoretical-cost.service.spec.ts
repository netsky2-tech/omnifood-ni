import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TheoreticalCostService } from './theoretical-cost.service';
import { CostCalculatorService } from '../cost-calculator.service';
import { RecipeService } from '../recipe.service';
import { Product, ProductType } from '../entities/product.entity';
import { Insumo } from '../entities/insumo.entity';
import { InventoryMovement } from '../entities/inventory-movement.entity';
import { InvoiceItem } from '../../sales/entities/invoice-item.entity';

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
  // R28 / M5: the "as sold" figures are read from the kardex (the SALE
  // movements) joined to the invoice lines. The double defaults to "no
  // sales", which is the honest empty for a report (a dish nobody sold has
  // no cost, not a zero one).
  const movementRows: Array<Record<string, unknown>> = [];
  const lineRows: Array<Record<string, unknown>> = [];
  const rawQueryBuilder = (rows: Array<Record<string, unknown>>) => {
    const builder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(async () => rows),
    };
    return builder;
  };
  const manager = {
    query,
    getRepository: jest.fn((entity: unknown) => {
      if (entity === Product) {
        return { find: productFind, findOne: productFindOne };
      }
      if (entity === Insumo) {
        return { findOne: insumoFindOne };
      }
      if (entity === InventoryMovement) {
        return { createQueryBuilder: () => rawQueryBuilder(movementRows) };
      }
      if (entity === InvoiceItem) {
        return { createQueryBuilder: () => rawQueryBuilder(lineRows) };
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
    movementRows.length = 0;
    lineRows.length = 0;
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

  // Nhilos backoffice experience standard: AP-10 (raw technical error as the
  // primary explanation), §39.4 (implementation vocabulary) and §30.3 (raw ids
  // live in a support detail, never as operator copy). The skip surface carries
  // a machine code plus calm Spanish copy, and the raw technical message only
  // reaches the log.
  describe('skip reasons are operator copy, never a wire error (S13)', () => {
    const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

    // Loosely typed on purpose: the assertion of a missing `reasonCode` must
    // fail as a BEHAVIOURAL red, not as a compile error the fix would hide.
    const marginsFor = async (
      tenantId: string,
      productId: string,
    ): Promise<{ dishes: unknown[]; skipped: Array<Record<string, string>> }> => {
      productFind.mockResolvedValueOnce([{ id: productId, name: 'Pan de Lote', product_type: ProductType.COMPOUND }]);
      productFind.mockResolvedValueOnce([]);
      return (await service.listDishMargins(tenantId)) as unknown as {
        dishes: unknown[];
        skipped: Array<Record<string, string>>;
      };
    };

    it('a dish without a published recipe reports the code and Spanish copy, no UUID', async () => {
      productFindOne.mockResolvedValue({ id: 'prod-a', name: 'Pan de Lote' });
      recipeService.findActiveVersion.mockResolvedValue(null);

      const { skipped } = await marginsFor('21beade5-dfc6-44df-b680-1065b42fc68b', 'prod-a');

      expect(skipped[0]).toMatchObject({
        productId: 'prod-a',
        productName: 'Pan de Lote',
        reasonCode: 'NO_ACTIVE_RECIPE',
      });
      expect(skipped[0].reason).toContain('receta publicada');
      expect(skipped[0].reason).not.toMatch(UUID_PATTERN);
      expect(skipped[0].reason).not.toMatch(/does not have|not found|Product [0-9a-f]/i);
    });

    it('a sub-recipe without its own recipe names the sub-recipe, not its UUID', async () => {
      productFindOne.mockImplementation(async ({ where }: { where: { id: string } }) =>
        where.id === 'prod-a'
          ? { id: 'prod-a', name: 'Pan de Lote', sellPrice: 10 }
          : { id: '21beade5-dfc6-44df-b680-1065b42fc68b', name: 'Salsa Madre', sellPrice: 0 },
      );
      recipeService.findActiveVersion.mockImplementation(
        async (_tenant: string, productId: string) =>
          productId === 'prod-a' ? { id: 'rv-a', yield_quantity: 1 } : null,
      );
      recipeService.getSnapshot.mockResolvedValue({
        components: [
          {
            insumo_id: '21beade5-dfc6-44df-b680-1065b42fc68b',
            ingredient_name: 'Salsa Madre',
            ingredient_type: 'SUB_RECIPE',
            gross_quantity: 1,
            technical_shrink_pct: 0,
          },
        ],
      });

      const { skipped } = await marginsFor('tenant-1', 'prod-a');

      expect(skipped[0]).toMatchObject({ reasonCode: 'SUB_RECIPE_NO_ACTIVE_RECIPE' });
      expect(skipped[0].reason).toContain('Salsa Madre');
      expect(skipped[0].reason).not.toMatch(UUID_PATTERN);
    });

    it('a component whose insumo no longer exists names the ingredient, not its UUID', async () => {
      productFindOne.mockResolvedValue({ id: 'prod-a', name: 'Pan de Lote', sellPrice: 10 });
      recipeService.findActiveVersion.mockResolvedValue({ id: 'rv-a', yield_quantity: 1 });
      recipeService.getSnapshot.mockResolvedValue({
        components: [
          {
            insumo_id: '6e80db28-0000-4000-8000-000000000000',
            ingredient_name: 'Queso Viejo',
            ingredient_type: 'INSUMO',
            gross_quantity: 1,
            technical_shrink_pct: 0,
          },
        ],
      });
      insumoFindOne.mockResolvedValue(null);

      const { skipped } = await marginsFor('tenant-1', 'prod-a');

      expect(skipped[0]).toMatchObject({ reasonCode: 'MISSING_COMPONENT' });
      expect(skipped[0].reason).toContain('Queso Viejo');
      expect(skipped[0].reason).not.toMatch(UUID_PATTERN);
      expect(skipped[0].reason).not.toMatch(/tenant/i);
    });

    it('an unexpected failure keeps the raw message in the log, not in the copy', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      productFindOne.mockResolvedValue({ id: 'prod-a', name: 'Pan de Lote', sellPrice: 10 });
      recipeService.findActiveVersion.mockResolvedValue({ id: 'rv-a', yield_quantity: 1 });
      recipeService.getSnapshot.mockRejectedValue(new Error('connection reset by peer'));

      const { skipped } = await marginsFor('tenant-1', 'prod-a');

      expect(skipped[0]).toMatchObject({ reasonCode: 'UNEXPECTED' });
      expect(skipped[0].reason).not.toMatch(/connection reset/i);
      expect(skipped[0].reason).not.toMatch(UUID_PATTERN);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('connection reset by peer'),
      );
      warn.mockRestore();
    });

    it('a circular sub-recipe reference gets its own code', async () => {
      productFindOne.mockResolvedValue({ id: 'prod-a', name: 'Pan de Lote', sellPrice: 10 });
      recipeService.findActiveVersion.mockResolvedValue({ id: 'rv-a', yield_quantity: 1 });
      recipeService.getSnapshot.mockResolvedValue({
        components: [
          {
            insumo_id: 'prod-a',
            ingredient_name: 'Masa madre',
            ingredient_type: 'SUB_RECIPE',
            gross_quantity: 1,
            technical_shrink_pct: 0,
          },
        ],
      });

      const { skipped } = await marginsFor('tenant-1', 'prod-a');

      expect(skipped[0]).toMatchObject({ reasonCode: 'CIRCULAR_SUB_RECIPE' });
      expect(skipped[0].reason).not.toMatch(UUID_PATTERN);
    });
  });

  describe('R28 / M5: the two figures — the recipe as written and what it actually cost', () => {
    const productId = 'prod-dish-1';

    beforeEach(() => {
      // The service lists COMPOUND and PREPARED separately: the dish is
      // COMPOUND, and a PREPARED listing that returned the same product
      // would count it twice.
      productFind.mockImplementation(async (args?: any) =>
        args?.where?.product_type === ProductType.PREPARED
          ? []
          : [
              {
                id: productId,
                name: 'Capuccino',
                sellPrice: 70,
              },
            ],
      );
      productFindOne.mockResolvedValue({
        id: productId,
        name: 'Capuccino',
        sellPrice: 70,
      });
      recipeService.findActiveVersion.mockResolvedValue({
        id: 'rv-1',
        product_id: productId,
        yield_quantity: 1,
      });
      recipeService.getSnapshot.mockResolvedValue({
        recipeVersion: { id: 'rv-1', product_id: productId },
        components: [],
      });
      costCalculator.calculateRecipeTheoreticalCost.mockReturnValue(
        calculatorResult(20),
      );
    });

    it('reports the units sold and the actual cost per unit from the kardex', async () => {
      // The dish was sold 3 times and C$75.0000 of stock left for it: the
      // actual cost is C$25.0000 per unit, while the recipe says C$20.0000.
      movementRows.push({ product_id: productId, total_cost: '75.0000' });
      lineRows.push({ product_id: productId, units: '3' });

      const result = await service.listDishMargins('tenant-1');

      const dish = result.dishes[0];
      // The FIRST figure: the recipe as written (an estimate with the
      // components' current CPPs).
      expect(dish.unitTheoreticalCostNio).toBe(20);
      // The SECOND figure: what it actually cost (a fact from the kardex).
      expect(dish.unitsSold).toBe(3);
      expect(dish.actualCostNio).toBe(75);
      expect(dish.unitActualCostNio).toBe(25);
      // And the gap between the two.
      expect(dish.costGapNio).toBe(5);
    });

    it('aggregates the impact over the period', async () => {
      movementRows.push({ product_id: productId, total_cost: '75.0000' });
      lineRows.push({ product_id: productId, units: '3' });

      const result = await service.listDishMargins('tenant-1', {
        from: '2026-10-01',
        to: '2026-10-19',
      });

      // The headline the industry surfaces: what the sales cost MINUS what
      // the recipes said they would cost.
      expect(result.totalActualCostNio).toBe(75);
      expect(result.totalTheoreticalCostNio).toBe(60);
      expect(result.extrasImpactNio).toBe(15);
      expect(result.extrasImpactPct).toBe(25);
      expect(result.period).toEqual({
        from: '2026-10-01',
        to: '2026-10-19',
      });
    });

    it('reports NO sales as no figure, never as a zero cost', async () => {
      const result = await service.listDishMargins('tenant-1');

      const dish = result.dishes[0];
      // "Not sold" is not "cost zero" (§27, AP-02).
      expect(dish.unitsSold).toBeNull();
      expect(dish.unitActualCostNio).toBeNull();
      expect(dish.actualCostNio).toBeNull();
      expect(dish.costGapNio).toBeNull();
      expect(result.extrasImpactNio).toBe(0);
      expect(result.extrasImpactPct).toBeNull();
    });
  });
});
