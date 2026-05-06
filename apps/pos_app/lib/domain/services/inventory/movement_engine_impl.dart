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
  Future<void> recordSale(String productId, double quantity) async {
    await _processRecipe(productId, quantity, MovementType.sale, 0);
  }

  @override
  Future<void> recordReversal(String productId, double quantity, String reason) async {
    await _processRecipe(productId, quantity, MovementType.reversal, 0, reason: reason);
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

    // Reset alert when stock is replenished
    if (newStock >= (insumo.parLevel ?? 0)) {
      _alertedInsumos.remove(insumoId);
    }
  }

  @override
  Future<void> recordShrinkage(String insumoId, double quantity, String reason) async {
    if (quantity <= 0) throw ArgumentError('Quantity must be positive');
    
    final insumo = await repository.getInsumoById(insumoId);
    if (insumo == null) return;

    final newStock = insumo.stock - quantity;
    final movement = InventoryMovement(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      insumoId: insumoId,
      type: MovementType.shrinkage,
      quantity: -quantity,
      previousStock: insumo.stock,
      newStock: newStock,
      timestamp: DateTime.now(),
      reason: reason,
    );

    await repository.processMovements([movement]);
    await _checkParAlert(insumo, newStock);
  }

  /// Private recursive method to handle recipes and sub-recipes
  Future<void> _processRecipe(
    String productId,
    double multiplier,
    MovementType moveType,
    int depth, {
    String? reason,
  }) async {
    final List<InventoryMovement> movements = [];
    final Map<String, double> runningStocks = {};
    
    await _buildMovements(productId, multiplier, moveType, depth, movements, runningStocks, reason: reason);
    
    if (movements.isNotEmpty) {
      await repository.processMovements(movements);
      
      // Post-transaction alerts
      for (final mov in movements) {
        final insumo = await repository.getInsumoById(mov.insumoId);
        if (insumo != null) {
          if (moveType != MovementType.reversal) {
            await _checkParAlert(insumo, mov.newStock);
          } else if (mov.newStock >= (insumo.parLevel ?? 0)) {
            _alertedInsumos.remove(insumo.id);
          }
        }
      }
    }
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

  Future<void> _checkParAlert(Insumo insumo, double newStock) async {
    if (insumo.parLevel != null && newStock < insumo.parLevel!) {
      if (!_alertedInsumos.contains(insumo.id)) {
        alertService.notifyLowStock(insumo.name, newStock, insumo.parLevel!);
        _alertedInsumos.add(insumo.id);
      }
    }
  }
}

class BatchDeduction {
  final String id;
  final double deducted;
  BatchDeduction({required this.id, required this.deducted});
}
