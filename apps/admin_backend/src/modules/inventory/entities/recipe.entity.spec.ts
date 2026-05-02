import { Recipe, IngredientType } from './recipe.entity';

describe('Recipe Entity', () => {
  it('should be defined', () => {
    const recipe = new Recipe();
    expect(recipe).toBeDefined();
  });

  it('should have correct properties', () => {
    const recipe = new Recipe();
    recipe.productId = 'prod-123';
    recipe.ingredientId = 'insumo-456';
    recipe.ingredientType = IngredientType.INSUMO;
    recipe.quantity = 18.5;

    expect(recipe.productId).toBe('prod-123');
    expect(recipe.ingredientId).toBe('insumo-456');
    expect(recipe.ingredientType).toBe(IngredientType.INSUMO);
    expect(recipe.quantity).toBe(18.5);
  });
});
