import 'package:flutter/foundation.dart';
import '../../../../domain/models/inventory/insumo.dart';
import '../../../../domain/repositories/inventory/inventory_repository.dart';
import '../../../../domain/services/inventory/movement_engine.dart';

class ShrinkageViewModel with ChangeNotifier {
  final InventoryRepository repository;
  final MovementEngine movementEngine;

  List<Insumo> _insumos = [];
  List<Insumo> get insumos => _insumos;

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  ShrinkageViewModel(this.repository, this.movementEngine);

  Future<void> loadInsumos() async {
    _isLoading = true;
    notifyListeners();
    _insumos = await repository.getActiveInsumos();
    _isLoading = false;
    notifyListeners();
  }

  Future<void> recordShrinkage({
    required String insumoId,
    required double quantity,
    required String reason,
  }) async {
    await movementEngine.recordShrinkage(insumoId, quantity, reason);
    await loadInsumos();
  }
}
