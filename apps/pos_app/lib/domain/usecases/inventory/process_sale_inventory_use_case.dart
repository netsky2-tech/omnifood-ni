import '../../services/inventory/movement_engine.dart';
import '../../models/sales/invoice_item.dart';

class ProcessSaleInventoryUseCase {
  final MovementEngine engine;

  ProcessSaleInventoryUseCase(this.engine);

  Future<void> execute(List<InvoiceItem> items) async {
    for (final item in items) {
      await engine.recordSale(item.productId, item.quantity);
    }
  }
}
