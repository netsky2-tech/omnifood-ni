import '../../models/inventory/inventory_movement.dart';
import '../../services/inventory/movement_engine.dart';
import '../../models/sales/invoice_item.dart';

class ProcessSaleInventoryUseCase {
  final MovementEngine engine;

  ProcessSaleInventoryUseCase(this.engine);

  Future<List<InventoryMovement>> execute(List<InvoiceItem> items) async {
    final List<InventoryMovement> allMovements = [];
    for (final item in items) {
      final movements = await engine.getSaleMovements(item.productId, item.quantity);
      allMovements.addAll(movements);
    }
    return allMovements;
  }
}
