import '../../models/inventory/inventory_movement.dart';
import '../../services/inventory/movement_engine.dart';
import '../../models/sales/invoice_item.dart';

class ReverseSaleInventoryUseCase {
  final MovementEngine engine;

  ReverseSaleInventoryUseCase(this.engine);

  Future<List<InventoryMovement>> execute(List<InvoiceItem> items, String reason) async {
    final List<InventoryMovement> allMovements = [];
    for (final item in items) {
      final movements = await engine.getReversalMovements(item.productId, item.quantity, reason);
      allMovements.addAll(movements);
    }
    return allMovements;
  }
}
