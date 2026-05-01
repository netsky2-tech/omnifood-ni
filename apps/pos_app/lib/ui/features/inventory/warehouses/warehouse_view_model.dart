import 'package:flutter/foundation.dart';
import '../../../../domain/models/inventory/warehouse.dart';
import '../../../../domain/repositories/inventory/inventory_repository.dart';

class WarehouseViewModel with ChangeNotifier {
  final InventoryRepository repository;

  List<Warehouse> _warehouses = [];
  List<Warehouse> get warehouses => _warehouses;

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  WarehouseViewModel(this.repository);

  Future<void> loadWarehouses() async {
    _isLoading = true;
    notifyListeners();

    _warehouses = await repository.getActiveWarehouses();

    _isLoading = false;
    notifyListeners();
  }

  Future<void> saveWarehouse({
    String? id,
    required String name,
    String? description,
  }) async {
    final warehouse = Warehouse(
      id: id ?? DateTime.now().millisecondsSinceEpoch.toString(),
      name: name,
      description: description,
    );

    await repository.saveWarehouse(warehouse);
    await loadWarehouses();
  }
}
