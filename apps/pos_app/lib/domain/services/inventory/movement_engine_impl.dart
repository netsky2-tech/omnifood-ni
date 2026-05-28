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

  MovementEngineImpl(this.repository, this.alertService);

  @override
  Future<void> recordSale(String productId, int quantity) async {
    await _buildMovements(productId, quantity.toDouble(), MovementType.sale, 0);
  }

  @override
  Future<void> recordReversal(String productId, int quantity, String reason) async {
    await _buildMovements(productId, quantity.toDouble(), MovementType.reversal, 0, reason: reason);
  }

  @override
  Future<List<BatchDeduction>> getBatchesForConsumption(String insumoId, double quantity) async {
    final batches = await repository.getBatchesByInsumoId(insumoId);
    final List<BatchDeduction> deductions = [];
    double remainingToDeduct = quantity;

    for (final batch in batches) {
      if (remainingToDeduct <= 0) break;

      final canDeduct = batch.remainingStock;
      final amountToDeduct = remainingToDeduct > canDeduct ? canDeduct : remainingToDeduct;

      deductions.add(BatchDeduction(batchId: batch.id, quantity: amountToDeduct));
      remainingToDeduct -= amountToDeduct;
    }

    return deductions;
  }

  @override
  Future<void> recordPurchase(String insumoId, double quantity, double cost) async {
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

    await repository.saveMovement(InventoryMovement(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      insumoId: insumoId,
      type: MovementType.purchase,
      quantity: quantity,
      previousStock: insumo.stock,
      newStock: newStock,
      timestamp: DateTime.now(),
      reason: 'Purchase',
    ));
  }

  @override
  Future<void> recordShrinkage(String insumoId, double quantity, String reason) async {
    if (quantity <= 0) throw ArgumentError('Quantity must be positive');

    final insumo = await repository.getInsumoById(insumoId);
    if (insumo == null) return;

    final newStock = insumo.stock - quantity;
    await repository.updateInsumoStock(insumoId, newStock);
    await _checkParAlert(insumo, newStock);

    await repository.saveMovement(InventoryMovement(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      insumoId: insumoId,
      type: MovementType.shrinkage,
      quantity: -quantity,
      previousStock: insumo.stock,
      newStock: newStock,
      timestamp: DateTime.now(),
      reason: reason,
    ));
  }

  @override
  Future<List<InventoryMovement>> getSaleMovements(String productId, double quantity) async {
    return await _generateMovements(productId, quantity, MovementType.sale, 0);
  }

  @override
  Future<List<InventoryMovement>> getReversalMovements(String productId, double quantity, String reason) async {
    return await _generateMovements(productId, quantity, MovementType.reversal, 0, reason: reason);
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
    await _gatherInsumoQuantities(productId, multiplier, depth, insumoQuantities);

    if (insumoQuantities.isEmpty) return;

    final insumos = await repository.getInsumosByIds(insumoQuantities.keys.toList());
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
        if (insumo.isPerishable && !isReversal && moveType == MovementType.sale) {
          batchDeductions = await getBatchesForConsumption(insumo.id, totalQty);
        }

        await repository.updateInsumoStock(insumo.id, newStock);
        
        if (!isReversal) {
          await _checkParAlert(insumo, newStock);
        } else if (newStock >= (insumo.parLevel ?? 0)) {
          _alertedInsumos.remove(insumo.id);
        }

        await repository.saveMovement(InventoryMovement(
          id: '${DateTime.now().millisecondsSinceEpoch}-${insumo.id}',
          insumoId: insumo.id,
          type: moveType,
          quantity: -discountAmount,
          previousStock: insumo.stock,
          newStock: newStock,
          timestamp: DateTime.now(),
          reason: reason ?? '${moveType.name.toUpperCase()} of $productId (x$multiplier)',
          batchDeductions: batchDeductions,
        ));
      }
    }
  }

  Future<List<InventoryMovement>> _generateMovements(
    String productId,
    double multiplier,
    MovementType moveType,
    int depth, {
    String? reason,
  }) async {
    final Map<String, double> insumoQuantities = {};
    await _gatherInsumoQuantities(productId, multiplier, depth, insumoQuantities);

    if (insumoQuantities.isEmpty) return [];

    final insumos = await repository.getInsumosByIds(insumoQuantities.keys.toList());
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
        if (insumo.isPerishable && !isReversal && moveType == MovementType.sale) {
          batchDeductions = await getBatchesForConsumption(insumo.id, totalQty);
        }

        movements.add(InventoryMovement(
          id: '\${DateTime.now().millisecondsSinceEpoch}-\${insumo.id}',
          insumoId: insumo.id,
          type: moveType,
          quantity: -discountAmount,
          previousStock: insumo.stock,
          newStock: newStock,
          timestamp: DateTime.now(),
          reason: reason ?? '\${moveType.name.toUpperCase()} of $productId (x$multiplier)',
          batchDeductions: batchDeductions,
        ));
      }
    }
    return movements;
  }

  Future<void> _gatherInsumoQuantities(
    String productId,
    double multiplier,
    int depth,
    Map<String, double> insumoQuantities,
  ) async {
    if (depth > 5) return; // Recursion protection

    final recipeItems = await repository.getRecipeByProductId(productId);
    if (recipeItems.isEmpty) return;

    for (final item in recipeItems) {
      final totalQty = item.quantity * multiplier;

      if (item.ingredientType == IngredientType.insumo) {
        insumoQuantities[item.ingredientId] = (insumoQuantities[item.ingredientId] ?? 0) + totalQty;
      } else if (item.ingredientType == IngredientType.product) {
        // Recurse for sub-recipe
        await _gatherInsumoQuantities(item.ingredientId, totalQty, depth + 1, insumoQuantities);
      }
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
