import '../../models/inventory/batch_deduction.dart';
import '../../models/inventory/inventory_movement.dart';

abstract class MovementEngine {
  /// Records a sale and discounts stock based on the product's recipe.
  Future<void> recordSale(String productId, int quantity);

  /// Records a purchase and updates stock and average cost.
  Future<void> recordPurchase(
    String insumoId,
    double quantity,
    double cost, {
    String? movementId,
    String? reason,
  });

  /// Records manual shrinkage.
  Future<void> recordShrinkage(String insumoId, double quantity, String reason);

  /// Records a local-first production close using the active recipe graph.
  Future<List<InventoryMovement>> recordProduction({
    required String recipeProductId,
    required String producedInsumoId,
    required double quantity,
    required String reason,
  });

  /// Records a compensating inventory adjustment from a physical count.
  Future<void> recordAdjustment(
    String insumoId,
    double quantityDelta,
    String reason, {
    String? movementId,
  });

  /// Records a reversal (DGI compliance) when a sale is canceled.
  Future<void> recordReversal(String productId, int quantity, String reason);

  /// Generates sale movements without recording them (for transaction blocks).
  Future<List<InventoryMovement>> getSaleMovements(String productId, double quantity);

  /// Generates reversal movements without recording them.
  Future<List<InventoryMovement>> getReversalMovements(String productId, double quantity, String reason);

  Future<List<BatchDeduction>> getBatchesForConsumption(String insumoId, double quantity);
}
