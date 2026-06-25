import '../../models/inventory/batch_deduction.dart';
import '../../models/inventory/insumo.dart';
import '../../models/inventory/inventory_movement.dart';
import '../../models/inventory/recipe.dart';
import '../../repositories/inventory/inventory_repository.dart';
import '../alerts/alert_service.dart';
import 'movement_engine.dart';

class MovementEngineImpl implements MovementEngine {
  final InventoryRepository repository;
  final AlertService alertService;
  final Set<String> _alertedInsumos = {};
  static const int _maxBomDepth = 5;

  MovementEngineImpl(this.repository, this.alertService);

  @override
  Future<void> recordSale(String productId, int quantity) async {
    await _buildMovements(productId, quantity.toDouble(), MovementType.sale, 0);
  }

  @override
  Future<void> recordReversal(
    String productId,
    int quantity,
    String reason,
  ) async {
    await _buildMovements(
      productId,
      quantity.toDouble(),
      MovementType.reversal,
      0,
      reason: reason,
    );
  }

  @override
  Future<List<BatchDeduction>> getBatchesForConsumption(
    String insumoId,
    double quantity,
  ) async {
    final batches = await repository.getBatchesByInsumoId(insumoId);
    final List<BatchDeduction> deductions = [];
    double remainingToDeduct = quantity;

    for (final batch in batches) {
      if (remainingToDeduct <= 0) break;

      final canDeduct = batch.remainingStock;
      final amountToDeduct = remainingToDeduct > canDeduct
          ? canDeduct
          : remainingToDeduct;

      deductions.add(
        BatchDeduction(batchId: batch.id, quantity: amountToDeduct),
      );
      remainingToDeduct -= amountToDeduct;
    }

    return deductions;
  }

  @override
  Future<void> recordPurchase(
    String insumoId,
    double quantity,
    double cost, {
    String? movementId,
    String? reason,
  }) async {
    final insumo = await repository.getInsumoById(insumoId);
    if (insumo == null) return;

    final newStock = insumo.stock + quantity;
    final currentTotalCost = insumo.stock * insumo.averageCost;
    final newBatchCost = quantity * cost;
    final newAverageCost = (currentTotalCost + newBatchCost) / newStock;

    await repository.updateInsumoStock(insumoId, newStock);
    await repository.updateInsumoCost(insumoId, newAverageCost);

    // Reset alert when stock is replenished
    if (newStock >= (insumo.parLevel ?? 0)) {
      _alertedInsumos.remove(insumoId);
    }

    await repository.saveMovement(
      InventoryMovement(
        id: movementId ?? DateTime.now().millisecondsSinceEpoch.toString(),
        insumoId: insumoId,
        type: MovementType.purchase,
        quantity: quantity,
        previousStock: insumo.stock,
        newStock: newStock,
        timestamp: DateTime.now(),
        reason: reason ?? 'Purchase',
      ),
    );
  }

  @override
  Future<void> recordShrinkage(
    String insumoId,
    double quantity,
    String reason,
  ) async {
    if (quantity <= 0) throw ArgumentError('Quantity must be positive');

    final insumo = await repository.getInsumoById(insumoId);
    if (insumo == null) return;

    final newStock = insumo.stock - quantity;
    await repository.updateInsumoStock(insumoId, newStock);
    await _checkParAlert(insumo, newStock);

    await repository.saveMovement(
      InventoryMovement(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        insumoId: insumoId,
        type: MovementType.shrinkage,
        quantity: -quantity,
        previousStock: insumo.stock,
        newStock: newStock,
        timestamp: DateTime.now(),
        reason: reason,
      ),
    );
  }

  @override
  Future<List<InventoryMovement>> recordProduction({
    required String recipeProductId,
    required String producedInsumoId,
    required double quantity,
    required String reason,
  }) async {
    if (quantity <= 0) {
      throw ArgumentError('Production quantity must be greater than zero');
    }

    final timestamp = DateTime.now();
    final Map<String, double> insumoQuantities = {};
    await _gatherInsumoQuantities(
      recipeProductId,
      quantity,
      0,
      insumoQuantities,
      visited: <String>{},
    );

    final inputInsumos = await repository.getInsumosByIds(
      insumoQuantities.keys.toList(growable: false),
    );
    final inputInsumoMap = {
      for (final insumo in inputInsumos) insumo.id: insumo,
    };
    final movements = <InventoryMovement>[];
    double totalConsumedCost = 0;

    for (final entry in insumoQuantities.entries) {
      final insumo = inputInsumoMap[entry.key];
      if (insumo == null) {
        continue;
      }

      final previousStock = insumo.stock;
      final newStock = previousStock - entry.value;
      totalConsumedCost += entry.value * insumo.averageCost;

      await repository.updateInsumoStock(insumo.id, newStock);
      await _checkParAlert(insumo, newStock);

      final movement = InventoryMovement(
        id: '${timestamp.millisecondsSinceEpoch}-${insumo.id}-consume',
        insumoId: insumo.id,
        type: MovementType.production,
        quantity: -entry.value,
        previousStock: previousStock,
        newStock: newStock,
        timestamp: timestamp,
        reason: reason,
      );
      await repository.saveMovement(movement);
      movements.add(movement);
    }

    final producedInsumo = await repository.getInsumoById(producedInsumoId);
    if (producedInsumo != null) {
      final previousStock = producedInsumo.stock;
      final newStock = previousStock + quantity;
      await repository.updateInsumoStock(producedInsumo.id, newStock);

      final producedMovement = InventoryMovement(
        id: '${timestamp.millisecondsSinceEpoch}-${producedInsumo.id}-receipt',
        insumoId: producedInsumo.id,
        type: MovementType.production,
        quantity: quantity,
        previousStock: previousStock,
        newStock: newStock,
        timestamp: timestamp,
        reason:
            '$reason | consumedCost=${totalConsumedCost.toStringAsFixed(2)}',
      );
      await repository.saveMovement(producedMovement);
      movements.add(producedMovement);
    }

    return movements;
  }

  @override
  Future<void> recordAdjustment(
    String insumoId,
    double quantityDelta,
    String reason, {
    String? movementId,
  }) async {
    if (quantityDelta == 0) {
      throw ArgumentError('Adjustment delta must be non-zero');
    }

    final insumo = await repository.getInsumoById(insumoId);
    if (insumo == null) return;

    final newStock = insumo.stock + quantityDelta;
    await repository.updateInsumoStock(insumoId, newStock);

    if (quantityDelta < 0) {
      await _checkParAlert(insumo, newStock);
    } else if (newStock >= (insumo.parLevel ?? 0)) {
      _alertedInsumos.remove(insumoId);
    }

    await repository.saveMovement(
      InventoryMovement(
        id: movementId ?? DateTime.now().millisecondsSinceEpoch.toString(),
        insumoId: insumoId,
        type: MovementType.adjustment,
        quantity: quantityDelta,
        previousStock: insumo.stock,
        newStock: newStock,
        timestamp: DateTime.now(),
        reason: reason,
      ),
    );
  }

  @override
  Future<List<InventoryMovement>> getSaleMovements(
    String productId,
    double quantity, {
    String? recipeVersionId,
  }) async {
    return await _generateMovements(
      productId,
      quantity,
      MovementType.sale,
      0,
      recipeVersionId: recipeVersionId,
    );
  }

  @override
  Future<List<InventoryMovement>> getReversalMovements(
    String productId,
    double quantity,
    String reason, {
    String? recipeVersionId,
  }) async {
    return await _generateMovements(
      productId,
      quantity,
      MovementType.reversal,
      0,
      reason: reason,
      recipeVersionId: recipeVersionId,
    );
  }

  /// Private method to build movements with bulk loading and FIFO
  Future<void> _buildMovements(
    String productId,
    double multiplier,
    MovementType moveType,
    int depth, {
    String? reason,
  }) async {
    final Map<String, double> insumoQuantities = {};
    await _gatherInsumoQuantities(
      productId,
      multiplier,
      depth,
      insumoQuantities,
      visited: <String>{},
    );

    if (insumoQuantities.isEmpty) return;

    final insumos = await repository.getInsumosByIds(
      insumoQuantities.keys.toList(),
    );
    final insumoMap = {for (var i in insumos) i.id: i};

    for (final entry in insumoQuantities.entries) {
      final insumoId = entry.key;
      final totalQty = entry.value;
      final insumo = insumoMap[insumoId];

      if (insumo != null) {
        final isReversal = moveType == MovementType.reversal;
        final discountAmount = isReversal ? -totalQty : totalQty;
        final newStock = insumo.stock - discountAmount;

        List<BatchDeduction>? batchDeductions;
        if (insumo.isPerishable &&
            !isReversal &&
            moveType == MovementType.sale) {
          batchDeductions = await getBatchesForConsumption(insumo.id, totalQty);
        }

        await repository.updateInsumoStock(insumo.id, newStock);

        if (!isReversal) {
          await _checkParAlert(insumo, newStock);
        } else if (newStock >= (insumo.parLevel ?? 0)) {
          _alertedInsumos.remove(insumo.id);
        }

        await repository.saveMovement(
          InventoryMovement(
            id: '${DateTime.now().millisecondsSinceEpoch}-${insumo.id}',
            insumoId: insumo.id,
            type: moveType,
            quantity: -discountAmount,
            previousStock: insumo.stock,
            newStock: newStock,
            timestamp: DateTime.now(),
            reason:
                reason ??
                '${moveType.name.toUpperCase()} of $productId (x$multiplier)',
            batchDeductions: batchDeductions,
          ),
        );
      }
    }
  }

  Future<List<InventoryMovement>> _generateMovements(
    String productId,
    double multiplier,
    MovementType moveType,
    int depth, {
    String? reason,
    String? recipeVersionId,
  }) async {
    final Map<String, double> insumoQuantities = {};
    await _gatherInsumoQuantities(
      productId,
      multiplier,
      depth,
      insumoQuantities,
      recipeVersionId: recipeVersionId,
      visited: <String>{},
    );

    if (insumoQuantities.isEmpty) return [];

    final insumos = await repository.getInsumosByIds(
      insumoQuantities.keys.toList(),
    );
    final insumoMap = {for (var i in insumos) i.id: i};
    final List<InventoryMovement> movements = [];

    for (final entry in insumoQuantities.entries) {
      final insumoId = entry.key;
      final totalQty = entry.value;
      final insumo = insumoMap[insumoId];

      if (insumo != null) {
        final isReversal = moveType == MovementType.reversal;
        final discountAmount = isReversal ? -totalQty : totalQty;
        final newStock = insumo.stock - discountAmount;

        List<BatchDeduction>? batchDeductions;
        if (insumo.isPerishable &&
            !isReversal &&
            moveType == MovementType.sale) {
          batchDeductions = await getBatchesForConsumption(insumo.id, totalQty);
        }

        movements.add(
          InventoryMovement(
            id: '${DateTime.now().microsecondsSinceEpoch}-${insumo.id}',
            insumoId: insumo.id,
            type: moveType,
            quantity: -discountAmount,
            previousStock: insumo.stock,
            newStock: newStock,
            timestamp: DateTime.now(),
            reason:
                reason ??
                '\${moveType.name.toUpperCase()} of $productId (x$multiplier)',
            batchDeductions: batchDeductions,
          ),
        );
      }
    }
    return movements;
  }

  /// Recursively gathers insumo quantities by exploding the BOM.
  ///
  /// When [recipeVersionId] is provided (top-level only), the explosion uses
  /// the historical versioned recipe document instead of the mutable simple
  /// recipe table — this preserves UC-05 historical cost binding.
  ///
  /// Throws [StateError] on cycle detection or depth overflow instead of
  /// silently truncating, so inventory corruption from malformed recipes is
  /// surfaced explicitly.
  Future<void> _gatherInsumoQuantities(
    String productId,
    double multiplier,
    int depth,
    Map<String, double> insumoQuantities, {
    String? recipeVersionId,
    required Set<String> visited,
  }) async {
    if (depth > _maxBomDepth) {
      throw StateError(
        'BOM explosion depth overflow for product $productId at depth $depth '
        '(max $_maxBomDepth). Recipe graph is too deep or malformed.',
      );
    }

    if (visited.contains(productId)) {
      throw StateError(
        'Circular recipe detected: product $productId appears twice in the '
        'BOM explosion chain ${visited.join(' -> ')} -> $productId. '
        'A recipe must not contain itself directly or transitively.',
      );
    }

    // Resolve components: prefer the versioned document when a version id is
    // bound (top-level historical binding). Sub-recipes fall back to the
    // simple recipe table in this slice — full multi-level versioned BOM is
    // deferred (see batch_02_recipes.md).
    List<_BomLine> lines;
    if (recipeVersionId != null && depth == 0) {
      final document = await repository.getRecipeVersionDocumentById(
        recipeVersionId,
      );
      if (document == null) {
        throw StateError(
          'Recipe version $recipeVersionId not found for product $productId. '
          'Historical version binding references a missing document.',
        );
      }
      // Guard: a bound recipeVersionId must belong to the product being
      // sold/reversed. The document is loaded by id only; without this
      // check a stale or tampered recipeVersionId could apply another
      // product's BOM (and therefore the wrong insumo deductions) to
      // the current sale line. Fail before any movement is generated.
      if (document.productId != productId) {
        throw StateError(
          'Recipe version $recipeVersionId belongs to product '
          '${document.productId}, not $productId. Refusing to apply '
          'movements for a mismatched historical version binding.',
        );
      }
      lines = document.components
          .map(
            (c) => _BomLine(
              ingredientId: c.ingredientId,
              ingredientType: _parseIngredientType(c.ingredientType),
              quantity: c.netQuantity,
            ),
          )
          .toList(growable: false);
    } else {
      final recipeItems = await repository.getRecipeByProductId(productId);
      if (recipeItems.isEmpty) return;
      lines = recipeItems
          .map(
            (r) => _BomLine(
              ingredientId: r.ingredientId,
              ingredientType: r.ingredientType,
              quantity: r.quantity,
            ),
          )
          .toList(growable: false);
    }

    final childVisited = {...visited, productId};
    for (final line in lines) {
      final totalQty = line.quantity * multiplier;

      if (line.ingredientType == IngredientType.insumo) {
        insumoQuantities[line.ingredientId] =
            (insumoQuantities[line.ingredientId] ?? 0) + totalQty;
      } else if (line.ingredientType == IngredientType.product) {
        // Recurse for sub-recipe (simple recipe table in this slice).
        await _gatherInsumoQuantities(
          line.ingredientId,
          totalQty,
          depth + 1,
          insumoQuantities,
          visited: childVisited,
        );
      }
    }
  }

  IngredientType _parseIngredientType(String raw) {
    switch (raw.trim().toLowerCase()) {
      case 'insumo':
        return IngredientType.insumo;
      case 'sub_recipe':
      case 'product':
        return IngredientType.product;
      default:
        throw StateError(
          'Unknown ingredient type "$raw" in recipe version component.',
        );
    }
  }

  Future<void> _checkParAlert(Insumo insumo, double newStock) async {
    if (insumo.parLevel != null && newStock < insumo.parLevel!) {
      if (!_alertedInsumos.contains(insumo.id)) {
        alertService.notifyLowStock(insumo.name, newStock, insumo.parLevel!);
        _alertedInsumos.add(insumo.id);
      }
    }
  }
}

/// Internal normalized representation of a single BOM line used by the
/// explosion recursion, regardless of whether it came from the simple recipe
/// table or a versioned recipe document.
class _BomLine {
  const _BomLine({
    required this.ingredientId,
    required this.ingredientType,
    required this.quantity,
  });

  final String ingredientId;
  final IngredientType ingredientType;
  final double quantity;
}
