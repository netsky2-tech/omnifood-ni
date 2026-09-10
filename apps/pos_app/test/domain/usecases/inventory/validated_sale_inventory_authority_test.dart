import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/usecases/inventory/validated_sale_inventory_authority.dart';

void main() {
  const context = CheckoutAuthorityContext(
    checkoutId: 'checkout-1',
    offlineUserId: 'user-1',
    offlineTenantId: 'tenant-1',
    provisionedTenantId: 'tenant-1',
  );
  const product = AuthorityProduct(id: 'product-1', tenantId: 'tenant-1');
  const insumo = AuthorityInsumo(id: 'insumo-1', tenantId: 'tenant-1');
  ValidatedSaleInventoryAuthority valid({
    CheckoutAuthorityContext identity = context,
    List<AuthorityProduct> products = const [product],
    List<AuthorityMapping> mappings = const [
      AuthorityMapping(
        id: 'mapping-1',
        tenantId: 'tenant-1',
        productId: 'product-1',
        insumoId: 'insumo-1',
      ),
    ],
    List<AuthorityRecipe> recipes = const [
      AuthorityRecipe(
        id: 'recipe-1',
        tenantId: 'tenant-1',
        productId: 'product-1',
        isPublished: true,
      ),
    ],
    List<AuthorityComponent> components = const [
      AuthorityComponent(
        id: 'component-1',
        tenantId: 'tenant-1',
        recipeId: 'recipe-1',
        insumoId: 'insumo-1',
        quantityPerSaleUnit: 1,
      ),
    ],
    List<AuthorityInsumo> insumos = const [insumo],
  }) => ValidatedSaleInventoryAuthority.validate(
    context: identity,
    products: products,
    mappings: mappings,
    recipes: recipes,
    components: components,
    insumos: insumos,
  );
  test('validates tenant-linked facts and returns frozen authority maps', () {
    final products = [product];
    final authority = valid(products: products);
    products.clear();
    expect(authority.context.provisionedTenantId, 'tenant-1');
    expect(authority.productsById['product-1'], product);
    expect(authority.mappingsByProductId['product-1']!.insumoId, 'insumo-1');
    expect(authority.recipesByProductId['product-1']!.id, 'recipe-1');
    expect(
      () => authority.productsById['other'] = product,
      throwsUnsupportedError,
    );
  });
  test('fails closed for blank, default, or mismatched checkout identity', () {
    expect(
      () => valid(
        identity: const CheckoutAuthorityContext(
          checkoutId: '',
          offlineUserId: 'user-1',
          offlineTenantId: 'tenant-1',
          provisionedTenantId: 'tenant-1',
        ),
      ),
      throwsA(isA<CheckoutAuthorityException>()),
    );
    expect(
      () => valid(
        identity: const CheckoutAuthorityContext(
          checkoutId: 'checkout-1',
          offlineUserId: 'default',
          offlineTenantId: 'tenant-1',
          provisionedTenantId: 'tenant-1',
        ),
      ),
      throwsA(isA<CheckoutAuthorityException>()),
    );
    expect(
      () => valid(
        identity: const CheckoutAuthorityContext(
          checkoutId: 'checkout-1',
          offlineUserId: 'user-1',
          offlineTenantId: 'tenant-1',
          provisionedTenantId: 'tenant-2',
        ),
      ),
      throwsA(isA<CheckoutAuthorityException>()),
    );
  });
  test(
    'rejects duplicates, unpublished recipes, and foreign facts before selection',
    () {
      expect(
        () => valid(products: const [product, product]),
        throwsA(isA<CheckoutAuthorityException>()),
      );
      expect(
        () => valid(
          recipes: const [
            AuthorityRecipe(
              id: 'recipe-1',
              tenantId: 'tenant-1',
              productId: 'product-1',
              isPublished: false,
            ),
          ],
        ),
        throwsA(isA<CheckoutAuthorityException>()),
      );
      expect(
        () => valid(
          mappings: const [
            AuthorityMapping(
              id: 'mapping-1',
              tenantId: 'tenant-2',
              productId: 'product-1',
              insumoId: 'insumo-1',
            ),
          ],
        ),
        throwsA(isA<CheckoutAuthorityException>()),
      );
    },
  );
  test('rejects duplicate mapping IDs across products before selection', () {
    expect(
      () => valid(
        products: const [
          product,
          AuthorityProduct(id: 'product-2', tenantId: 'tenant-1'),
        ],
        mappings: const [
          AuthorityMapping(
            id: 'mapping-1',
            tenantId: 'tenant-1',
            productId: 'product-1',
            insumoId: 'insumo-1',
          ),
          AuthorityMapping(
            id: 'mapping-1',
            tenantId: 'tenant-1',
            productId: 'product-2',
            insumoId: 'insumo-1',
          ),
        ],
      ),
      throwsA(isA<CheckoutAuthorityException>()),
    );
  });
  test('rejects duplicate recipe IDs across products before selection', () {
    expect(
      () => valid(
        products: const [
          product,
          AuthorityProduct(id: 'product-2', tenantId: 'tenant-1'),
        ],
        recipes: const [
          AuthorityRecipe(
            id: 'recipe-1',
            tenantId: 'tenant-1',
            productId: 'product-1',
            isPublished: true,
          ),
          AuthorityRecipe(
            id: 'recipe-1',
            tenantId: 'tenant-1',
            productId: 'product-2',
            isPublished: true,
          ),
        ],
      ),
      throwsA(isA<CheckoutAuthorityException>()),
    );
  });
  test(
    'rejects partial links, ambiguous components, and invalid quantities',
    () {
      expect(
        () => valid(insumos: const []),
        throwsA(isA<CheckoutAuthorityException>()),
      );
      expect(
        () => valid(
          components: const [
            AuthorityComponent(
              id: 'component-1',
              tenantId: 'tenant-1',
              recipeId: 'recipe-1',
              insumoId: 'insumo-1',
              quantityPerSaleUnit: double.nan,
            ),
          ],
        ),
        throwsA(isA<CheckoutAuthorityException>()),
      );
      expect(
        () => valid(
          components: const [
            AuthorityComponent(
              id: 'component-1',
              tenantId: 'tenant-1',
              recipeId: 'recipe-1',
              insumoId: 'insumo-1',
              quantityPerSaleUnit: 1,
            ),
            AuthorityComponent(
              id: 'component-2',
              tenantId: 'tenant-1',
              recipeId: 'recipe-1',
              insumoId: 'insumo-1',
              quantityPerSaleUnit: 2,
            ),
          ],
        ),
        throwsA(isA<CheckoutAuthorityException>()),
      );
    },
  );
}
