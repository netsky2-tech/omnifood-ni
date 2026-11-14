import 'package:uuid/uuid.dart';
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
      // A UUID: this id travels to a cloud table whose key is `uuid`. A
      // timestamp id reads fine locally and is REFUSED by PostgreSQL the
      // moment an operation references it (a purchase recorded against a
      // locally created supplier failed the sync with a 500 that the
      // terminal retried forever).
      id: id ?? const Uuid().v4(),
      name: name,
      description: description,
    );

    await repository.saveWarehouse(warehouse);
    await loadWarehouses();
  }
}
