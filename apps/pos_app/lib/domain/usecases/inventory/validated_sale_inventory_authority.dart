import 'dart:collection';

enum CheckoutAuthorityFailureReason {
  invalidContext,
  missingRecipe,
  circularRecipe,
  maxDepthExceeded,
  negativeStockBlocked,
  unresolvedInsumo,
  invalidFact,
}

class CheckoutAuthorityException implements Exception {
  final CheckoutAuthorityFailureReason reason;
  final String? productName;
  final String? insumoName;
  final double? requiredQuantity;
  final double? availableQuantity;
  final String? message;

  const CheckoutAuthorityException({
    this.reason = CheckoutAuthorityFailureReason.invalidFact,
    this.productName,
    this.insumoName,
    this.requiredQuantity,
    this.availableQuantity,
    this.message,
  });

  @override
  String toString() =>
      'CheckoutAuthorityException(reason: $reason, product: $productName, insumo: $insumoName, required: $requiredQuantity, available: $availableQuantity, message: $message)';
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
  const AuthorityInsumo({
    required this.id,
    required this.tenantId,
    this.name = '',
    this.negativeStockPolicy = 'RESTRICT',
    // R28: the insumo's consumption unit. The deviation resolver needs it
    // to know whether a quantity INHERITED from a recipe component means
    // the same thing in the insumo the effect applies to (a number in
    // millilitres is not a number in litres).
    this.consumptionUom = '',
    // R28: whether the insumo is still ACTIVE. An effect that points at a
    // deactivated insumo does NOT apply (the SOHO guarantee, D6): the
    // terminal would demand a stock that is not for sale.
    this.isActive = true,
  });
  final String id, tenantId, name, negativeStockPolicy;

  /// The unit the stock of this insumo is kept in.
  final String consumptionUom;

  /// Whether the insumo is still active in the catalog.
  final bool isActive;
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

/// R21 / S18: what a recipe component references. An `insumo` component
/// names an insumo; a `subRecipe` component names a PRODUCT whose own
/// published recipe is expanded recursively at sale time (the POS mirror of
/// the backend's `BomExplosionService`, R11).
enum AuthorityIngredientType { insumo, subRecipe }

/// Any recorded value that is not the literal `SUB_RECIPE` (`INSUMO`, the
/// legacy `DIRECT`, an unknown string) is an insumo reference: that is the
/// historical behaviour and it must not change.
AuthorityIngredientType parseAuthorityIngredientType(String raw) =>
    raw.trim().toUpperCase() == 'SUB_RECIPE'
        ? AuthorityIngredientType.subRecipe
        : AuthorityIngredientType.insumo;

class AuthorityComponent {
  const AuthorityComponent({
    required this.id,
    required this.tenantId,
    required this.recipeId,
    required this.insumoId,
    required this.quantityPerSaleUnit,
    this.ingredientType = AuthorityIngredientType.insumo,
    this.referenceVersionId,
  });
  final String id, tenantId, recipeId;

  /// Insumo id for [AuthorityIngredientType.insumo] components; product id of
  /// the sub-recipe for [AuthorityIngredientType.subRecipe] ones.
  final String insumoId;
  final double quantityPerSaleUnit;
  final AuthorityIngredientType ingredientType;
  final String? referenceVersionId;
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
      // R21 / S18: a SUB_RECIPE component names a PRODUCT (the sub-recipe),
      // which never has an authority insumo row — the backend excludes it
      // from the insumo closure. It must resolve against the product map; an
      // insumo component keeps resolving against the insumo map.
      final targetResolves =
          component.ingredientType == AuthorityIngredientType.subRecipe
          ? productMap.containsKey(component.insumoId)
          : insumoMap.containsKey(component.insumoId);
      _require(
        recipeMap.values.any((recipe) => recipe.id == component.recipeId) &&
            targetResolves &&
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
