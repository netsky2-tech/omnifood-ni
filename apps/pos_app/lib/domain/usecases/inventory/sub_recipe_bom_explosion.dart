import 'dart:collection';

import 'validated_sale_inventory_authority.dart';

class SubRecipeBomExplosionException implements Exception {
  const SubRecipeBomExplosionException();
}

/// One leaf insumo consumption of a recipe after the sub-recipe explosion.
///
/// [rootComponentId] is the id of the ROOT component that introduced the leaf
/// when that component is a direct `INSUMO` component of the root recipe, and
/// null when the leaf only comes from a nested sub-recipe. The backend's
/// `SaleInventoryOutcomeService` (R11) validates a binding's
/// `recipeComponentId` against the ROOT recipe's details, so a nested leaf
/// must travel without one.
class BomLeaf {
  const BomLeaf({
    required this.insumoId,
    required this.quantityPerSaleUnit,
    required this.rootComponentId,
  });

  final String insumoId;
  final double quantityPerSaleUnit;
  final String? rootComponentId;
}

/// The POS mirror of the backend `BomExplosionService` (R11 / R21): resolve
/// SUB_RECIPE components recursively into the leaf insumos a sale actually
/// consumes, multiplying quantities at every level.
///
/// Pure and synchronous over the already-hydrated authority facts: the
/// database reads live in `CheckoutInventoryPreparationService`, which must
/// hydrate every sub-recipe version, component and leaf insumo referenced by
/// the cart before the planner or the snapshot builder runs.
///
/// Fail-closed by contract: a cycle, a depth beyond [maxDepth], a SUB_RECIPE
/// component whose product has no published recipe in the authority, or an
/// insumo component whose insumo was never hydrated all throw
/// [SubRecipeBomExplosionException]. A recipe can never be silently consumed
/// with fewer ingredients than it declares.
class SubRecipeBomExplosion {
  const SubRecipeBomExplosion();

  /// Same depth ceiling as the backend's `DEFAULT_MAX_BOM_DEPTH`.
  static const int maxDepth = 5;

  /// Leaf insumos of [recipeId], keyed and sorted by insumo id, matching the
  /// backend's deterministic leaf ordering.
  Map<String, BomLeaf> explode({
    required ValidatedSaleInventoryAuthority authority,
    required String recipeId,
    required String rootProductId,
  }) {
    final recipe = authority.recipesByProductId[rootProductId];
    if (recipe == null || recipe.id != recipeId) {
      throw const SubRecipeBomExplosionException();
    }
    final totals = <String, double>{};
    _descend(
      authority: authority,
      recipeId: recipeId,
      productId: rootProductId,
      multiplier: 1.0,
      totals: totals,
      ancestors: <String>[rootProductId],
      depth: 0,
    );

    // The root component that introduced each leaf, when it is a direct
    // insumo component of the root recipe: the backend attaches that id to
    // the binding and validates it against the root details.
    final rootComponentByInsumo = <String, String>{};
    for (final component in _componentsOf(authority, recipeId)) {
      if (component.ingredientType == AuthorityIngredientType.insumo) {
        rootComponentByInsumo[component.insumoId] = component.id;
      }
    }

    return SplayTreeMap<String, BomLeaf>.fromIterable(
      totals.entries,
      key: (entry) => entry.key,
      value: (entry) => BomLeaf(
        insumoId: entry.key,
        quantityPerSaleUnit: roundBomQuantity(entry.value),
        rootComponentId: rootComponentByInsumo[entry.key],
      ),
    );
  }

  void _descend({
    required ValidatedSaleInventoryAuthority authority,
    required String recipeId,
    required String productId,
    required double multiplier,
    required Map<String, double> totals,
    required List<String> ancestors,
    required int depth,
  }) {
    if (depth > maxDepth) {
      throw const SubRecipeBomExplosionException();
    }
    final components = _componentsOf(authority, recipeId);
    if (components.isEmpty) {
      // A published recipe that declares nothing to consume is a data
      // defect, not an empty BOM: fail closed instead of deducting less
      // than the recipe says.
      throw const SubRecipeBomExplosionException();
    }
    for (final component in components) {
      if (component.ingredientType == AuthorityIngredientType.subRecipe) {
        if (ancestors.contains(component.insumoId)) {
          throw const SubRecipeBomExplosionException();
        }
        final subRecipe = authority.recipesByProductId[component.insumoId];
        if (subRecipe == null) {
          throw const SubRecipeBomExplosionException();
        }
        _descend(
          authority: authority,
          recipeId: subRecipe.id,
          productId: component.insumoId,
          multiplier: roundBomQuantity(
            component.quantityPerSaleUnit * multiplier,
          ),
          totals: totals,
          ancestors: [...ancestors, component.insumoId],
          depth: depth + 1,
        );
      } else {
        if (!authority.insumosById.containsKey(component.insumoId)) {
          throw const SubRecipeBomExplosionException();
        }
        final normalized = roundBomQuantity(
          component.quantityPerSaleUnit * multiplier,
        );
        totals[component.insumoId] = roundBomQuantity(
          (totals[component.insumoId] ?? 0) + normalized,
        );
      }
    }
  }

  List<AuthorityComponent> _componentsOf(
    ValidatedSaleInventoryAuthority authority,
    String recipeId,
  ) {
    final components = authority.componentsById.values
        .where((component) => component.recipeId == recipeId)
        .toList();
    components.sort(
      (a, b) => a.insumoId != b.insumoId
          ? a.insumoId.compareTo(b.insumoId)
          : a.id.compareTo(b.id),
    );
    return components;
  }
}

/// Four decimal places, the same scale the backend's `round4` applies at
/// every explosion level, so a POS-frozen binding and a backend-recalculated
/// one can never diverge on rounding.
double roundBomQuantity(double value) =>
    double.parse(value.toStringAsFixed(4));
