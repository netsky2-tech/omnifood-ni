import 'movement_engine_impl.dart';

abstract class MovementEngine {
  /// Records a sale and discounts stock based on the product's recipe.
  Future<void> recordSale(String productId, double quantity);

  /// Records a purchase and updates stock and average cost.
  Future<void> recordPurchase(String insumoId, double quantity, double cost);

  /// Records manual shrinkage.
  Future<void> recordShrinkage(String insumoId, double quantity, String reason);

  /// Records a reversal (DGI compliance) when a sale is canceled.
  Future<void> recordReversal(String productId, double quantity, String reason);

  Future<List<BatchDeduction>> getBatchesForConsumption(String insumoId, double quantity);
}
