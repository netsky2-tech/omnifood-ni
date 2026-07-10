import '../../models/inventory/batch_deduction.dart';
import '../../models/inventory/insumo.dart';
import '../../models/inventory/inventory_movement.dart';
import '../../models/inventory/recipe.dart';
import '../../models/inventory/recipe_version_document.dart';
import '../../models/inventory/uom_conversion.dart';
import '../../repositories/inventory/inventory_repository.dart';
import '../alerts/alert_service.dart';
import 'movement_engine.dart';
import 'uom_conversion_calculator.dart';

class MovementEngineImpl implements MovementEngine {
  final InventoryRepository repository;
  final AlertService alertService;
  final Set<String> _alertedInsumos = {};
  static const int _maxBomDepth = 5;
  // Slice 2.2: tolerance for the netQuantity == gross*(1-shrink/100) invariant,
  // expressed at the inventory 4dp scale.
  static const double _netQuantityTolerance = 0.0001;

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
        unitCostNio: insumo.averageCost,
        sourceDocumentType: 'INSUMO_MERMA',
        sourceDocumentId: insumoId,
      ),
    );
  }

  @override
  Future<void> recordProductShrinkage({
    required String productId,
    required double quantity,
    required String reason,
  }) async {
    if (quantity <= 0) throw ArgumentError('Quantity must be positive');

    final timestamp = DateTime.now();
    final Map<String, double> insumoQuantities = {};
    await _gatherInsumoQuantities(
      productId,
      quantity,
      0,
      insumoQuantities,
      visited: <String>{},
    );

    if (insumoQuantities.isEmpty) {
      throw StateError('Product $productId has no recipe to record shrinkage');
    }

    final insumos = await repository.getInsumosByIds(
      insumoQuantities.keys.toList(growable: false),
    );
    final insumoMap = {for (final insumo in insumos) insumo.id: insumo};

    for (final entry in insumoQuantities.entries) {
      final insumo = insumoMap[entry.key];
      if (insumo == null) {
        continue;
      }

      final newStock = insumo.stock - entry.value;
      await repository.updateInsumoStock(insumo.id, newStock);
      await _checkParAlert(insumo, newStock);

      await repository.saveMovement(
        InventoryMovement(
          id: '${timestamp.microsecondsSinceEpoch}-${insumo.id}-product-merma',
          insumoId: insumo.id,
          type: MovementType.shrinkage,
          quantity: -entry.value,
          previousStock: insumo.stock,
          newStock: newStock,
          timestamp: timestamp,
          reason: reason,
          unitCostNio: insumo.averageCost,
          sourceDocumentType: 'PRODUCT_MERMA',
          sourceDocumentId: productId,
        ),
      );
    }
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
  Future<ProductionCloseResult> recordProductionClose({
    required String recipeProductId,
    required String producedInsumoId,
    required String productionDocumentId,
    String? recipeVersionId,
    required double plannedQuantity,
    required double actualQuantity,
    required String outcome,
    required String reason,
  }) async {
    final result = await buildProductionClose(
      recipeProductId: recipeProductId,
      producedInsumoId: producedInsumoId,
      productionDocumentId: productionDocumentId,
      recipeVersionId: recipeVersionId,
      plannedQuantity: plannedQuantity,
      actualQuantity: actualQuantity,
      outcome: outcome,
      reason: reason,
    );

    for (final movement in result.movements) {
      await repository.updateInsumoStock(movement.insumoId, movement.newStock);
      await repository.saveMovement(movement);
    }

    return result;
  }

  @override
  Future<ProductionCloseResult> buildProductionClose({
    required String recipeProductId,
    required String producedInsumoId,
    required String productionDocumentId,
    String? recipeVersionId,
    required double plannedQuantity,
    required double actualQuantity,
    required String outcome,
    required String reason,
  }) async {
    if (plannedQuantity <= 0) {
      throw ArgumentError(
        'Planned production quantity must be greater than zero',
      );
    }
    final normalizedOutcome = outcome.trim().toUpperCase();
    final isCompleted = normalizedOutcome == 'COMPLETED';
    if (!isCompleted &&
        normalizedOutcome != 'FAILED' &&
        normalizedOutcome != 'INTERRUPTED') {
      throw ArgumentError(
        'Production outcome must be COMPLETED, FAILED, or INTERRUPTED',
      );
    }
    if (isCompleted && actualQuantity <= 0) {
      throw ArgumentError(
        'Completed production quantity must be greater than zero',
      );
    }

    final closeQuantity = isCompleted ? actualQuantity : plannedQuantity;
    final timestamp = DateTime.now();
    final oneLevelInputs = await _resolveProductionCloseInputs(
      recipeProductId: recipeProductId,
      recipeVersionId: recipeVersionId,
      closeQuantity: closeQuantity,
    );
    if (oneLevelInputs.isEmpty) {
      throw StateError(
        'Product $recipeProductId has no one-level insumo recipe',
      );
    }

    final inputIds = oneLevelInputs
        .map((item) => item.ingredientId)
        .toList(growable: false);
    final inputInsumos = await repository.getInsumosByIds(inputIds);
    final inputInsumoMap = {
      for (final insumo in inputInsumos) insumo.id: insumo,
    };
    final movements = <InventoryMovement>[];
    double totalConsumedCost = 0;

    for (final item in oneLevelInputs) {
      final insumo = inputInsumoMap[item.ingredientId];
      if (insumo == null) {
        throw StateError(
          'Recipe component ${item.ingredientId} is missing locally',
        );
      }
      final consumedQuantity = item.quantity;
      final previousStock = insumo.stock;
      final newStock = previousStock - consumedQuantity;
      totalConsumedCost += consumedQuantity * insumo.averageCost;

      final movement = InventoryMovement(
        id: '${timestamp.microsecondsSinceEpoch}-${insumo.id}-production-out',
        insumoId: insumo.id,
        type: MovementType.production,
        quantity: -consumedQuantity,
        previousStock: previousStock,
        newStock: newStock,
        timestamp: timestamp,
        reason: isCompleted ? reason : 'DESECHO_COCINA',
        unitCostNio: insumo.averageCost,
        sourceDocumentType: 'PRODUCTION_CLOSE',
        sourceDocumentId: productionDocumentId,
      );
      movements.add(movement);
    }

    final producedUnitCost = isCompleted
        ? totalConsumedCost / actualQuantity
        : 0.0;
    if (isCompleted) {
      final producedInsumo = await repository.getInsumoById(producedInsumoId);
      if (producedInsumo == null) {
        throw StateError(
          'Produced insumo $producedInsumoId is missing locally',
        );
      }
      final previousStock = producedInsumo.stock;
      final newStock = previousStock + actualQuantity;
      final movement = InventoryMovement(
        id: '${timestamp.microsecondsSinceEpoch}-${producedInsumo.id}-production-in',
        insumoId: producedInsumo.id,
        type: MovementType.production,
        quantity: actualQuantity,
        previousStock: previousStock,
        newStock: newStock,
        timestamp: timestamp,
        reason: reason,
        unitCostNio: producedUnitCost,
        sourceDocumentType: 'PRODUCTION_CLOSE',
        sourceDocumentId: productionDocumentId,
      );
      movements.add(movement);
    }

    return ProductionCloseResult(
      movements: movements,
      totalConsumedCostNio: totalConsumedCost,
      producedUnitCostNio: producedUnitCost,
    );
  }

  Future<List<_BomLine>> _resolveProductionCloseInputs({
    required String recipeProductId,
    required String? recipeVersionId,
    required double closeQuantity,
  }) async {
    if (recipeVersionId == null || recipeVersionId.trim().isEmpty) {
      final recipeItems = await repository.getRecipeByProductId(
        recipeProductId,
      );
      return recipeItems
          .where((item) => item.ingredientType == IngredientType.insumo)
          .map(
            (item) => _BomLine(
              ingredientId: item.ingredientId,
              ingredientType: item.ingredientType,
              quantity: item.quantity * closeQuantity,
            ),
          )
          .toList(growable: false);
    }

    final document = await repository.getRecipeVersionDocumentById(
      recipeVersionId,
    );
    if (document == null) {
      throw StateError(
        'Recipe version $recipeVersionId not found for product $recipeProductId. '
        'Cannot close production with a missing version binding.',
      );
    }
    if (document.productId != recipeProductId) {
      throw StateError(
        'Recipe version $recipeVersionId belongs to product '
        '${document.productId}, not $recipeProductId. Refusing production close.',
      );
    }

    _validateVersionedDocumentQuantities(document, recipeVersionId);
    final conversionFactors = await _resolveUomConversionFactors(
      document,
      recipeVersionId,
    );
    final portionMultiplier = closeQuantity / document.yieldQuantity;
    final lines = <_BomLine>[];
    for (var i = 0; i < document.components.length; i++) {
      final component = document.components[i];
      final ingredientType = _parseIngredientType(component.ingredientType);
      if (ingredientType != IngredientType.insumo) {
        continue;
      }
      lines.add(
        _BomLine(
          ingredientId: component.ingredientId,
          ingredientType: ingredientType,
          quantity: UomConversionCalculator.roundToInventoryScale(
            component.grossQuantity * conversionFactors[i] * portionMultiplier,
          ),
        ),
      );
    }
    return lines;
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
    final bool isVersionedTopLevel = recipeVersionId != null && depth == 0;
    List<_BomLine> lines;
    // Multiplier applied to each line's quantity. For the simple recipe table
    // the line quantity is already per-portion, so the multiplier is the sale
    // quantity. For a versioned top-level document the component grossQuantity
    // is the amount needed to produce the WHOLE yieldQuantity batch, so each
    // line is scaled by saleQuantity / yieldQuantity.
    final double portionMultiplier;

    if (isVersionedTopLevel) {
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
      // Slice 2.2: validate quantity integrity (yield > 0, gross > 0, shrink
      // in [0,100), net == gross*(1-shrink/100) within 4dp) before any
      // movement is generated. A malformed historical document must never
      // silently produce wrong insumo deductions.
      _validateVersionedDocumentQuantities(document, recipeVersionId);
      // Slice 2.2: resolve UOM compatibility per insumo leaf component. Each
      // component's quantity is converted to the insumo base consumption UOM
      // (factor 1 when already in base UOM; the registered conversion factor
      // otherwise; StateError when truly incompatible). Missing componentUom
      // defaults to the insumo base consumption UOM for backward compatibility
      // with documents synced/stored before this slice.
      final conversionFactors = await _resolveUomConversionFactors(
        document,
        recipeVersionId,
      );
      portionMultiplier = multiplier / document.yieldQuantity;
      // Slice 2.2 review blocker: the conversion factor is resolved PER
      // COMPONENT (indexed), not per insumo id, so duplicate components that
      // reference the same insumo with different componentUom values each
      // carry their own factor BEFORE aggregation (aggregate after
      // conversion, not before).
      lines = <_BomLine>[];
      for (var i = 0; i < document.components.length; i++) {
        final c = document.components[i];
        lines.add(
          _BomLine(
            ingredientId: c.ingredientId,
            ingredientType: _parseIngredientType(c.ingredientType),
            // Slice 2.2: stock/cost consumption is driven by the GROSS
            // quantity (the amount physically consumed), scaled by the
            // yield factor — not the net (post-shrink) quantity.
            quantity: c.grossQuantity,
            conversionFactor: conversionFactors[i],
          ),
        );
      }
    } else {
      final recipeItems = await repository.getRecipeByProductId(productId);
      if (recipeItems.isEmpty) return;
      portionMultiplier = multiplier;
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
      // Slice 2.2: keep the versioned top-level path (and any converted line)
      // deterministic at the inventory NUMERIC(14,4) scale so gross/yield/UOM
      // scaling never accumulates float drift across the explosion.
      final double totalQty;
      if (isVersionedTopLevel || line.conversionFactor != 1.0) {
        totalQty = UomConversionCalculator.roundToInventoryScale(
          line.quantity * line.conversionFactor * portionMultiplier,
        );
      } else {
        totalQty = line.quantity * portionMultiplier;
      }

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

  /// Slice 2.2: validates the quantity integrity of a versioned recipe
  /// document before any movement is generated.
  ///
  /// Rules:
  /// - `yieldQuantity > 0`
  /// - per component: `grossQuantity > 0`, `technicalShrinkPct` in `[0, 100)`,
  ///   and `netQuantity` matches `grossQuantity * (1 - technicalShrinkPct/100)`
  ///   within a 4dp tolerance.
  ///
  /// Throws [StateError] on the first violation so a malformed historical
  /// document can never silently drive wrong insumo deductions.
  void _validateVersionedDocumentQuantities(
    RecipeVersionDocument document,
    String versionId,
  ) {
    if (document.yieldQuantity <= 0) {
      throw StateError(
        'Recipe version $versionId has yieldQuantity ${document.yieldQuantity}; '
        'must be > 0. Refusing to generate movements from an invalid document.',
      );
    }
    for (final c in document.components) {
      if (c.grossQuantity <= 0) {
        throw StateError(
          'Recipe version $versionId component ${c.ingredientId} has '
          'grossQuantity ${c.grossQuantity}; must be > 0.',
        );
      }
      if (c.technicalShrinkPct < 0 || c.technicalShrinkPct >= 100) {
        throw StateError(
          'Recipe version $versionId component ${c.ingredientId} has '
          'technicalShrinkPct ${c.technicalShrinkPct}; must be in [0, 100).',
        );
      }
      final expectedNet = UomConversionCalculator.roundToInventoryScale(
        c.grossQuantity * (1 - c.technicalShrinkPct / 100),
      );
      if ((c.netQuantity - expectedNet).abs() > _netQuantityTolerance) {
        throw StateError(
          'Recipe version $versionId component ${c.ingredientId} netQuantity '
          '${c.netQuantity} does not match gross*(1-shrink/100) = $expectedNet '
          'within $_netQuantityTolerance tolerance.',
        );
      }
    }
  }

  /// Slice 2.2: resolves, per component of a versioned document, the
  /// conversion factor from that component's UOM to the insumo base
  /// consumption UOM.
  ///
  /// Returns a [List] of factors ALIGNED WITH [document.components] (one
  /// factor per component, by index). Each BOM line carries its OWN factor so
  /// duplicate components that reference the same insumo with different
  /// `componentUom` values are converted independently BEFORE aggregation
  /// (Slice 2.2 review blocker — a per-insumo factor map would reuse the
  /// wrong factor for one of the duplicate lines, corrupting stock).
  ///
  /// Compatibility rule (per insumo component):
  /// - missing/empty `componentUom` → treated as the insumo base consumption
  ///   UOM (factor 1, backward compatible with pre-2.2 documents).
  /// - `componentUom` == insumo `consumptionUom` (case/whitespace-insensitive)
  ///   → factor 1.
  /// - otherwise → a registered `UomConversion` with a matching `unitName`
  ///   (case/whitespace-insensitive) and a positive `factor` must exist; its
  ///   `factor` (base units per component unit) is used.
  /// - a missing local insumo → throws [StateError]. A versioned document must
  ///   never silently skip a missing insumo, otherwise partial movements would
  ///   corrupt stock (Slice 2.2 review blocker).
  ///
  /// Sub-recipe (product) components keep factor 1 (their UOM is resolved
  /// recursively via the simple recipe table). Throws [StateError] for a
  /// missing insumo or a truly incompatible insumo component before any
  /// movement is generated.
  Future<List<double>> _resolveUomConversionFactors(
    RecipeVersionDocument document,
    String versionId,
  ) async {
    final insumoComponentIds = document.components
        .where(
          (c) =>
              _parseIngredientType(c.ingredientType) == IngredientType.insumo,
        )
        .map((c) => c.ingredientId)
        .toSet()
        .toList(growable: false);
    final Map<String, Insumo> insumoById;
    if (insumoComponentIds.isEmpty) {
      insumoById = const {};
    } else {
      final insumos = await repository.getInsumosByIds(insumoComponentIds);
      insumoById = {for (final i in insumos) i.id: i};
    }

    // One factor per component, aligned with document.components order.
    final factors = List<double>.filled(document.components.length, 1.0);
    for (var i = 0; i < document.components.length; i++) {
      final c = document.components[i];
      if (_parseIngredientType(c.ingredientType) != IngredientType.insumo) {
        // Sub-recipe components recurse via the simple recipe table; no UOM
        // conversion at this level. Factor stays 1.0 (unused for insumo
        // aggregation).
        continue;
      }
      final insumo = insumoById[c.ingredientId];
      if (insumo == null) {
        // Slice 2.2 review blocker: a versioned document must never silently
        // skip a missing insumo. Partial movement generation would corrupt
        // stock, so fail before any movement is generated.
        throw StateError(
          'Recipe version $versionId component ${c.ingredientId} references '
          'a missing local insumo. Refusing to generate partial movements '
          'from an incomplete versioned document.',
        );
      }
      final normalizedComponentUom = _normalizeUom(c.componentUom);
      final normalizedBaseUom = _normalizeUom(insumo.consumptionUom);
      if (normalizedComponentUom.isEmpty ||
          normalizedComponentUom == normalizedBaseUom) {
        factors[i] = 1.0;
        continue;
      }
      final conversions = await repository.getConversionsByInsumoId(insumo.id);
      UomConversion? match;
      for (final conv in conversions) {
        if (_normalizeUom(conv.unitName) == normalizedComponentUom &&
            conv.factor > 0) {
          match = conv;
          break;
        }
      }
      if (match == null) {
        throw StateError(
          'Recipe version $versionId component ${c.ingredientId} UOM '
          '"${c.componentUom}" is incompatible with insumo base consumption '
          'UOM "${insumo.consumptionUom}" and no registered conversion '
          'exists. Refusing to generate movements from an incompatible '
          'document.',
        );
      }
      factors[i] = match.factor;
    }
    return factors;
  }

  /// Slice 2.2: normalizes a UOM label for comparison by trimming surrounding
  /// whitespace and lowercasing, so `kg`, ` KG ` and `Kg` all match.
  String _normalizeUom(String? uom) {
    if (uom == null) return '';
    return uom.trim().toLowerCase();
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
    // Slice 2.2: factor converting this line's quantity to the insumo base
    // consumption UOM (1.0 for the simple recipe table and for versioned
    // components already expressed in the base UOM).
    this.conversionFactor = 1.0,
  });

  final String ingredientId;
  final IngredientType ingredientType;
  final double quantity;
  final double conversionFactor;
}
