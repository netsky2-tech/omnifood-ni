import 'package:flutter/foundation.dart';
import '../../../../domain/services/inventory/movement_engine.dart';

class SaleViewModel with ChangeNotifier {
  final MovementEngine movementEngine;

  SaleViewModel(this.movementEngine);

  Future<void> completeSale(String productId, int quantity) async {
    await movementEngine.recordSale(productId, quantity);
    notifyListeners();
  }
}
