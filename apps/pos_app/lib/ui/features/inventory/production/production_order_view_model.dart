import 'package:flutter/foundation.dart';
import 'package:pos_app/domain/models/inventory/production_order.dart';

class ProductionOrderViewModel extends ChangeNotifier {
  final List<ProductionOrder> _orders = <ProductionOrder>[];
  bool _isLoading = false;

  List<ProductionOrder> get orders => List<ProductionOrder>.unmodifiable(_orders);
  bool get isLoading => _isLoading;

  Future<void> load(List<ProductionOrder> items) async {
    _isLoading = true;
    notifyListeners();
    _orders
      ..clear()
      ..addAll(items);
    _isLoading = false;
    notifyListeners();
  }
}
