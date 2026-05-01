import 'package:flutter/foundation.dart';
import '../../../../domain/models/inventory/insumo.dart';
import '../../../../domain/models/inventory/warehouse.dart';
import '../../../../domain/repositories/inventory/inventory_repository.dart';

class InsumoViewModel with ChangeNotifier {
  final InventoryRepository repository;

  List<Insumo> _insumos = [];
  List<Insumo> get insumos => _insumos;

  List<Warehouse> _warehouses = [];
  List<Warehouse> get warehouses => _warehouses;

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  InsumoViewModel(this.repository);

  Future<void> loadInitialData() async {
    _isLoading = true;
    notifyListeners();

    _insumos = await repository.getActiveInsumos();
    _warehouses = await repository.getActiveWarehouses();

    _isLoading = false;
    notifyListeners();
  }

  Future<void> saveInsumo({
    String? id,
    required String name,
    required String consumptionUom,
    required double stock,
    required double averageCost,
    double? parLevel,
    String? warehouseId,
    required bool isPerishable,
  }) async {
    final insumo = Insumo(
      id: id ?? DateTime.now().millisecondsSinceEpoch.toString(),
      name: name,
      consumptionUom: consumptionUom,
      stock: stock,
      averageCost: averageCost,
      parLevel: parLevel,
      warehouseId: warehouseId,
      isPerishable: isPerishable,
    );

    await repository.saveInsumo(insumo);
    await loadInitialData();
  }
}
