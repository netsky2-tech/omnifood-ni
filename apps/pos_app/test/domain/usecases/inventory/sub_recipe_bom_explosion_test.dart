import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/usecases/inventory/sub_recipe_bom_explosion.dart';
import 'package:pos_app/domain/usecases/inventory/validated_sale_inventory_authority.dart';

void main() {
  const context = CheckoutAuthorityContext(
    checkoutId: 'checkout-1',
    offlineUserId: 'user-1',
    offlineTenantId: 'tenant-1',
    provisionedTenantId: 'tenant-1',
  );

  AuthorityProduct product(String id, {AuthorityInventoryKind kind = AuthorityInventoryKind.compound}) =>
      AuthorityProduct(id: id, tenantId: 'tenant-1', inventoryKind: kind);

  AuthorityRecipe recipe(String id, String productId) => AuthorityRecipe(
        id: id,
        tenantId: 'tenant-1',
        productId: productId,
        isPublished: true,
      );

  AuthorityComponent component({
    required String id,
    required String recipeId,
    required String targetId,
    required double quantity,
    AuthorityIngredientType ingredientType = AuthorityIngredientType.insumo,
  }) => AuthorityComponent(
        id: id,
        tenantId: 'tenant-1',
        recipeId: recipeId,
        insumoId: targetId,
        quantityPerSaleUnit: quantity,
        ingredientType: ingredientType,
      );

  AuthorityInsumo insumo(String id) =>
      AuthorityInsumo(id: id, tenantId: 'tenant-1');

  ValidatedSaleInventoryAuthority authorityOf({
    required List<AuthorityProduct> products,
    required List<AuthorityRecipe> recipes,
    required List<AuthorityComponent> components,
    required List<AuthorityInsumo> insumos,
  }) => ValidatedSaleInventoryAuthority.validate(
        context: context,
        products: products,
        mappings: const [],
        recipes: recipes,
        components: components,
        insumos: insumos,
      );

  test('a flat recipe explodes to exactly its own components', () {
    final authority = authorityOf(
      products: const [AuthorityProduct(id: 'prod-burger', tenantId: 'tenant-1')],
      recipes: [recipe('ver-burger', 'prod-burger')],
      components: [
        component(id: 'c-beef', recipeId: 'ver-burger', targetId: 'insumo-beef', quantity: 0.25),
        component(id: 'c-bun', recipeId: 'ver-burger', targetId: 'insumo-bun', quantity: 1),
      ],
      insumos: [insumo('insumo-beef'), insumo('insumo-bun')],
    );

    final leaves = const SubRecipeBomExplosion().explode(
      authority: authority,
      recipeId: 'ver-burger',
      rootProductId: 'prod-burger',
    );

    expect(leaves.keys.toList(), ['insumo-beef', 'insumo-bun']);
    expect(leaves['insumo-beef']!.quantityPerSaleUnit, 0.25);
    expect(leaves['insumo-beef']!.rootComponentId, 'c-beef');
    expect(leaves['insumo-bun']!.rootComponentId, 'c-bun');
  });

  test('expands a SUB_RECIPE component into its leaf insumos, multiplied', () {
    final authority = authorityOf(
      products: [
        product('prod-tacos'),
        product('prod-relleno'),
      ],
      recipes: [
        recipe('ver-tacos', 'prod-tacos'),
        recipe('ver-relleno', 'prod-relleno'),
      ],
      components: [
        component(
          id: 'c-relleno',
          recipeId: 'ver-tacos',
          targetId: 'prod-relleno',
          quantity: 2,
          ingredientType: AuthorityIngredientType.subRecipe,
        ),
        component(id: 'c-tortillas', recipeId: 'ver-tacos', targetId: 'insumo-tortillas', quantity: 3),
        component(id: 'c-queso', recipeId: 'ver-tacos', targetId: 'insumo-queso', quantity: 40),
        component(id: 'c-carne', recipeId: 'ver-relleno', targetId: 'insumo-carne', quantity: 0.15),
      ],
      insumos: [
        insumo('insumo-tortillas'),
        insumo('insumo-queso'),
        insumo('insumo-carne'),
      ],
    );

    final leaves = const SubRecipeBomExplosion().explode(
      authority: authority,
      recipeId: 'ver-tacos',
      rootProductId: 'prod-tacos',
    );

    expect(leaves.keys.toList(), [
      'insumo-carne',
      'insumo-queso',
      'insumo-tortillas',
    ]);
    expect(leaves['insumo-carne']!.quantityPerSaleUnit, 0.3);
    // A nested leaf never carries a recipeComponentId: the backend validates
    // that id against the ROOT recipe's details only.
    expect(leaves['insumo-carne']!.rootComponentId, isNull);
    expect(leaves['insumo-queso']!.quantityPerSaleUnit, 40);
    expect(leaves['insumo-queso']!.rootComponentId, 'c-queso');
    expect(leaves['insumo-tortillas']!.rootComponentId, 'c-tortillas');
  });

  test('sums the same leaf reached from two branches (diamond)', () {
    final authority = authorityOf(
      products: [
        product('prod-root'),
        product('prod-a'),
        product('prod-b'),
      ],
      recipes: [
        recipe('ver-root', 'prod-root'),
        recipe('ver-a', 'prod-a'),
        recipe('ver-b', 'prod-b'),
      ],
      components: [
        component(
          id: 'c-a',
          recipeId: 'ver-root',
          targetId: 'prod-a',
          quantity: 1,
          ingredientType: AuthorityIngredientType.subRecipe,
        ),
        component(
          id: 'c-b',
          recipeId: 'ver-root',
          targetId: 'prod-b',
          quantity: 2,
          ingredientType: AuthorityIngredientType.subRecipe,
        ),
        component(id: 'c-a-leaf', recipeId: 'ver-a', targetId: 'insumo-x', quantity: 3),
        component(id: 'c-b-leaf', recipeId: 'ver-b', targetId: 'insumo-x', quantity: 4),
      ],
      insumos: [insumo('insumo-x')],
    );

    final leaves = const SubRecipeBomExplosion().explode(
      authority: authority,
      recipeId: 'ver-root',
      rootProductId: 'prod-root',
    );

    expect(leaves['insumo-x']!.quantityPerSaleUnit, 11);
    expect(leaves['insumo-x']!.rootComponentId, isNull);
  });

  test('fails closed on a cycle', () {
    final authority = authorityOf(
      products: [product('prod-a'), product('prod-b')],
      recipes: [recipe('ver-a', 'prod-a'), recipe('ver-b', 'prod-b')],
      components: [
        component(
          id: 'c-to-b',
          recipeId: 'ver-a',
          targetId: 'prod-b',
          quantity: 1,
          ingredientType: AuthorityIngredientType.subRecipe,
        ),
        component(
          id: 'c-to-a',
          recipeId: 'ver-b',
          targetId: 'prod-a',
          quantity: 1,
          ingredientType: AuthorityIngredientType.subRecipe,
        ),
      ],
      insumos: const [],
    );

    expect(
      () => const SubRecipeBomExplosion().explode(
        authority: authority,
        recipeId: 'ver-a',
        rootProductId: 'prod-a',
      ),
      throwsA(isA<SubRecipeBomExplosionException>()),
    );
  });

  test('fails closed on nesting beyond the depth ceiling', () {
    final products = <AuthorityProduct>[];
    final recipes = <AuthorityRecipe>[];
    final components = <AuthorityComponent>[];
    const levels = SubRecipeBomExplosion.maxDepth + 2;
    for (var i = 0; i <= levels; i++) {
      products.add(product('prod-$i'));
      recipes.add(recipe('ver-$i', 'prod-$i'));
      if (i < levels) {
        components.add(
          component(
            id: 'c-$i',
            recipeId: 'ver-$i',
            targetId: 'prod-${i + 1}',
            quantity: 1,
            ingredientType: AuthorityIngredientType.subRecipe,
          ),
        );
      }
    }

    final authority = authorityOf(
      products: products,
      recipes: recipes,
      components: components,
      insumos: const [],
    );

    expect(
      () => const SubRecipeBomExplosion().explode(
        authority: authority,
        recipeId: 'ver-0',
        rootProductId: 'prod-0',
      ),
      throwsA(isA<SubRecipeBomExplosionException>()),
    );
  });

  test('fails closed when a sub-recipe has no published recipe in the authority', () {
    final authority = authorityOf(
      products: [product('prod-root'), product('prod-orphan')],
      recipes: [recipe('ver-root', 'prod-root')],
      components: [
        component(
          id: 'c-orphan',
          recipeId: 'ver-root',
          targetId: 'prod-orphan',
          quantity: 1,
          ingredientType: AuthorityIngredientType.subRecipe,
        ),
      ],
      insumos: const [],
    );

    expect(
      () => const SubRecipeBomExplosion().explode(
        authority: authority,
        recipeId: 'ver-root',
        rootProductId: 'prod-root',
      ),
      throwsA(isA<SubRecipeBomExplosionException>()),
    );
  });

  test('fails closed when a nested recipe declares no components', () {
    final authority = authorityOf(
      products: [product('prod-root'), product('prod-empty')],
      recipes: [recipe('ver-root', 'prod-root'), recipe('ver-empty', 'prod-empty')],
      components: [
        component(
          id: 'c-empty',
          recipeId: 'ver-root',
          targetId: 'prod-empty',
          quantity: 1,
          ingredientType: AuthorityIngredientType.subRecipe,
        ),
      ],
      insumos: const [],
    );

    expect(
      () => const SubRecipeBomExplosion().explode(
        authority: authority,
        recipeId: 'ver-root',
        rootProductId: 'prod-root',
      ),
      throwsA(isA<SubRecipeBomExplosionException>()),
    );
  });

  test('a leaf insumo that was never hydrated is rejected before the explosion', () {
    // ValidatedSaleInventoryAuthority already fails closed for an insumo
    // component whose insumo is missing, so the explosion never runs with a
    // dangling leaf: the guard is upstream, not duplicated here.
    expect(
      () => authorityOf(
        products: [product('prod-root')],
        recipes: [recipe('ver-root', 'prod-root')],
        components: [
          component(id: 'c-leaf', recipeId: 'ver-root', targetId: 'insumo-missing', quantity: 1),
        ],
        insumos: const [],
      ),
      throwsA(isA<CheckoutAuthorityException>()),
    );
  });
}
