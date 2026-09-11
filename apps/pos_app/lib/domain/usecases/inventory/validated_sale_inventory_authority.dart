import 'dart:collection';

class CheckoutAuthorityException implements Exception {
  const CheckoutAuthorityException();
}

class CheckoutAuthorityContext {
  const CheckoutAuthorityContext({
    required this.checkoutId,
    required this.offlineUserId,
    required this.offlineTenantId,
    required this.provisionedTenantId,
  });
  final String checkoutId, offlineUserId, offlineTenantId, provisionedTenantId;
}

enum AuthorityInventoryKind { simple, prepared, compound }

class AuthorityProduct {
  const AuthorityProduct({required this.id, required this.tenantId, this.inventoryKind = AuthorityInventoryKind.simple});
  final String id, tenantId;
  final AuthorityInventoryKind inventoryKind;
}

class AuthorityInsumo {
  const AuthorityInsumo({required this.id, required this.tenantId});
  final String id, tenantId;
}

class AuthorityMapping {
  const AuthorityMapping({
    required this.id,
    required this.tenantId,
    required this.productId,
    required this.insumoId,
  });
  final String id, tenantId, productId, insumoId;
}

class AuthorityRecipe {
  const AuthorityRecipe({
    required this.id,
    required this.tenantId,
    required this.productId,
    required this.isPublished,
  });
  final String id, tenantId, productId;
  final bool isPublished;
}

class AuthorityComponent {
  const AuthorityComponent({
    required this.id,
    required this.tenantId,
    required this.recipeId,
    required this.insumoId,
    required this.quantityPerSaleUnit,
  });
  final String id, tenantId, recipeId, insumoId;
  final double quantityPerSaleUnit;
}

class ValidatedSaleInventoryAuthority {
  ValidatedSaleInventoryAuthority._({
    required this.context,
    required Map<String, AuthorityProduct> productsById,
    required Map<String, AuthorityInsumo> insumosById,
    required Map<String, AuthorityMapping> mappingsByProductId,
    required Map<String, AuthorityRecipe> recipesByProductId,
    required Map<String, AuthorityComponent> componentsById,
  }) : productsById = UnmodifiableMapView(Map.of(productsById)),
       insumosById = UnmodifiableMapView(Map.of(insumosById)),
       mappingsByProductId = UnmodifiableMapView(Map.of(mappingsByProductId)),
       recipesByProductId = UnmodifiableMapView(Map.of(recipesByProductId)),
       componentsById = UnmodifiableMapView(Map.of(componentsById));

  final CheckoutAuthorityContext context;
  final Map<String, AuthorityProduct> productsById;
  final Map<String, AuthorityInsumo> insumosById;
  final Map<String, AuthorityMapping> mappingsByProductId;
  final Map<String, AuthorityRecipe> recipesByProductId;
  final Map<String, AuthorityComponent> componentsById;

  factory ValidatedSaleInventoryAuthority.validate({
    required CheckoutAuthorityContext context,
    required List<AuthorityProduct> products,
    required List<AuthorityMapping> mappings,
    required List<AuthorityRecipe> recipes,
    required List<AuthorityComponent> components,
    required List<AuthorityInsumo> insumos,
  }) {
    _validateContext(context);
    final tenant = context.provisionedTenantId;
    final productMap = _validatedFacts(products, (fact) => fact.id, (fact) => fact.id, (fact) => fact.tenantId, tenant);
    final insumoMap = _validatedFacts(insumos, (fact) => fact.id, (fact) => fact.id, (fact) => fact.tenantId, tenant);
    final mappingMap = _validatedFacts(mappings, (fact) => fact.id, (fact) => fact.productId, (fact) => fact.tenantId, tenant);
    final recipeMap = _validatedFacts(recipes, (fact) => fact.id, (fact) => fact.productId, (fact) => fact.tenantId, tenant);
    final componentMap = _validatedFacts(components, (fact) => fact.id, (fact) => fact.id, (fact) => fact.tenantId, tenant);
    for (final mapping in mappings) {
      _require(productMap.containsKey(mapping.productId) && insumoMap.containsKey(mapping.insumoId));
    }
    for (final recipe in recipes) {
      _require(recipe.isPublished && productMap.containsKey(recipe.productId));
    }
    final componentLinks = <String>{};
    for (final component in components) {
      _require(
        recipeMap.values.any((recipe) => recipe.id == component.recipeId) &&
            insumoMap.containsKey(component.insumoId) &&
            component.quantityPerSaleUnit.isFinite &&
            component.quantityPerSaleUnit > 0 &&
            componentLinks.add('${component.recipeId}\u0000${component.insumoId}'),
      );
    }
    return ValidatedSaleInventoryAuthority._(
      context: context,
      productsById: productMap,
      insumosById: insumoMap,
      mappingsByProductId: mappingMap,
      recipesByProductId: recipeMap,
      componentsById: componentMap,
    );
  }
}

void _validateContext(CheckoutAuthorityContext context) {
  _require(
    _safe(context.checkoutId) &&
        _safe(context.offlineUserId) &&
        _safe(context.offlineTenantId) &&
        _safe(context.provisionedTenantId) &&
        context.offlineTenantId == context.provisionedTenantId,
  );
}

Map<String, T> _validatedFacts<T>(
  List<T> facts,
  String Function(T) identity,
  String Function(T) selectionKey,
  String Function(T) tenant,
  String expectedTenant,
) {
  final selected = <String, T>{};
  final identities = <String>{};
  for (final fact in facts) {
    final id = identity(fact);
    final key = selectionKey(fact);
    _require(
      _safe(id) &&
          _safe(key) &&
          tenant(fact) == expectedTenant &&
          identities.add(id) &&
          !selected.containsKey(key),
    );
    selected[key] = fact;
  }
  return selected;
}

bool _safe(String value) =>
    value.trim().isNotEmpty &&
    !const {'0', 'default', 'null', 'system', 'unknown'}.contains(value.trim().toLowerCase());

void _require(bool condition) {
  if (!condition) throw const CheckoutAuthorityException();
}
