import '../../models/inventory/insumo.dart';
import '../../models/inventory/inventory_movement.dart';
import '../../models/inventory/recipe.dart';
import '../../repositories/inventory/inventory_repository.dart';
import '../alerts/alert_service.dart';
import 'movement_engine.dart';

class MovementEngineImpl implements MovementEngine {
  final InventoryRepository repository;
  final AlertService alertService;

  MovementEngineImpl(this.repository, this.alertService);

  @override
  Future<void> recordSale(String productId, double quantity) async {
    final movements = await getSaleMovements(productId, quantity);
    if (movements.isNotEmpty) {
      await repository.processMovements(movements);
      for (final mov in movements) {
        final insumo = await repository.getInsumoById(mov.insumoId);
        if (insumo != null) {
          await _checkParAlert(insumo, mov.previousStock, mov.newStock);
        }
      }
    }
  }

  @override
  Future<List<InventoryMovement>> getSaleMovements(String productId, double quantity) async {
    final List<InventoryMovement> movements = [];
    final Map<String, double> runningStocks = {};
    await _buildMovements(productId, quantity, MovementType.sale, 0, movements, runningStocks);
    return movements;
  }

  @override
  Future<List<InventoryMovement>> getReversalMovements(String productId, double quantity, String reason) async {
    final List<InventoryMovement> movements = [];
    final Map<String, double> runningStocks = {};
    await _buildMovements(productId, quantity, MovementType.reversal, 0, movements, runningStocks, reason: reason);
    return movements;
  }

  @override
  Future<void> recordReversal(String productId, double quantity, String reason) async {
    final movements = await getReversalMovements(productId, quantity, reason);
    
    if (movements.isNotEmpty) {
      await repository.processMovements(movements);
      // Note: Non-volatile crossing check means no in-memory state to clear.
      // Alerts will naturally refire if stock crosses below PAR again.
    }
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

      deductions.add(BatchDeduction(id: batch.id, deducted: amountToDeduct));
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

    final movement = InventoryMovement(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      insumoId: insumoId,
      type: MovementType.purchase,
      quantity: quantity,
      previousStock: insumo.stock,
      newStock: newStock,
      timestamp: DateTime.now(),
      reason: 'Purchase',
    );

    // Purchase is complex because it updates cost too. 
    // For now we keep it separate or we could wrap it in a transaction if the repository supports it.
    await repository.updateInsumoStock(insumoId, newStock);
    await repository.updateInsumoCost(insumoId, newAverageCost);
    await repository.saveMovement(movement);

    // Note: Non-volatile crossing check means no in-memory state to clear.
    // Alerts will naturally refire if stock crosses below PAR again after replenishment.
  }

  @override
  Future<void> recordShrinkage(String insumoId, double quantity, String reason) async {
    if (quantity <= 0) throw ArgumentError('Quantity must be positive');
    
    final insumo = await repository.getInsumoById(insumoId);
    if (insumo == null) return;

    final previousStock = insumo.stock;
    final newStock = previousStock - quantity;
    final movement = InventoryMovement(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      insumoId: insumoId,
      type: MovementType.shrinkage,
      quantity: -quantity,
      previousStock: previousStock,
      newStock: newStock,
      timestamp: DateTime.now(),
      reason: reason,
    );

    await repository.processMovements([movement]);
    await _checkParAlert(insumo, previousStock, newStock);
  }

  Future<void> _buildMovements(
    String productId,
    double multiplier,
    MovementType moveType,
    int depth,
    List<InventoryMovement> collectedMovements,
    Map<String, double> runningStocks, {
    String? reason,
  }) async {
    if (depth > 5) return; // Recursion protection

    final recipeItems = await repository.getRecipeByProductId(productId);
    if (recipeItems.isEmpty) return;

    for (final item in recipeItems) {
      final totalQty = item.quantity * multiplier;

      if (item.ingredientType == IngredientType.insumo) {
        final insumo = await repository.getInsumoById(item.ingredientId);
        if (insumo != null) {
          final isReversal = moveType == MovementType.reversal;
          final discountAmount = isReversal ? -totalQty : totalQty;
          
          final currentStock = runningStocks[insumo.id] ?? insumo.stock;
          final newStock = currentStock - discountAmount;
          runningStocks[insumo.id] = newStock;

          collectedMovements.add(InventoryMovement(
            id: '${DateTime.now().millisecondsSinceEpoch}-${insumo.id}-${collectedMovements.length}',
            insumoId: insumo.id,
            type: moveType,
            quantity: -discountAmount,
            previousStock: currentStock,
            newStock: newStock,
            timestamp: DateTime.now(),
            reason: reason ?? '${moveType.name.toUpperCase()} of $productId (x$multiplier)',
          ));
        }
      } else if (item.ingredientType == IngredientType.product) {
        // Recurse for sub-recipe
        await _buildMovements(item.ingredientId, totalQty, moveType, depth + 1, collectedMovements, runningStocks, reason: reason);
      }
    }
  }

  Future<void> _checkParAlert(Insumo insumo, double previousStock, double newStock) async {
    final parLevel = insumo.parLevel;
    if (parLevel == null) return;
    
    // Non-volatile crossing check: alert fires only when stock transitions
    // from at-or-above PAR to below PAR
    if (previousStock >= parLevel && newStock < parLevel) {
      alertService.notifyLowStock(insumo.name, newStock, parLevel);
    }
  }
}

class BatchDeduction {
  final String id;
  final double deducted;
  BatchDeduction({required this.id, required this.deducted});
}
