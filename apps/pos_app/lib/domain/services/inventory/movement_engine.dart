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

  /// Records BOH shrinkage for a prepared product as ingredient deltas.
  Future<void> recordProductShrinkage({
    required String productId,
    required double quantity,
    required String reason,
  });

  /// Records a local-first production close using the active recipe graph.
  Future<List<InventoryMovement>> recordProduction({
    required String recipeProductId,
    required String producedInsumoId,
    required double quantity,
    required String reason,
  });

  /// Records a one-level local-first production close.
  Future<ProductionCloseResult> recordProductionClose({
    required String recipeProductId,
    required String producedInsumoId,
    required String productionDocumentId,
    String? recipeVersionId,
    required double plannedQuantity,
    required double actualQuantity,
    required String outcome,
    required String reason,
  });

  /// Builds a one-level production close without writing to persistence.
  Future<ProductionCloseResult> buildProductionClose({
    required String recipeProductId,
    required String producedInsumoId,
    required String productionDocumentId,
    String? recipeVersionId,
    required double plannedQuantity,
    required double actualQuantity,
    required String outcome,
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
  /// When [recipeVersionId] is provided, the top-level BOM explosion uses that
  /// historical recipe version instead of the mutable active recipe (UC-05).
  Future<List<InventoryMovement>> getSaleMovements(
    String productId,
    double quantity, {
    String? recipeVersionId,
  });

  /// Generates reversal movements without recording them.
  /// When [recipeVersionId] is provided, the explosion mirrors the original
  /// sale's version binding so the reversal matches the historical BOM.
  Future<List<InventoryMovement>> getReversalMovements(
    String productId,
    double quantity,
    String reason, {
    String? recipeVersionId,
  });

  Future<List<BatchDeduction>> getBatchesForConsumption(
    String insumoId,
    double quantity,
  );
}

class ProductionCloseResult {
  const ProductionCloseResult({
    required this.movements,
    required this.totalConsumedCostNio,
    required this.producedUnitCostNio,
  });

  final List<InventoryMovement> movements;
  final double totalConsumedCostNio;
  final double producedUnitCostNio;
}
