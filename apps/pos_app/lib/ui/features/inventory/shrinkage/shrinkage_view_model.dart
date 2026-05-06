import 'package:flutter/foundation.dart';
import '../../../../domain/models/inventory/insumo.dart';
import '../../../../domain/repositories/inventory/inventory_repository.dart';
import '../../../../domain/services/inventory/movement_engine.dart';

import '../../../../domain/models/inventory/inventory_movement.dart';

class ShrinkageViewModel with ChangeNotifier {
  final InventoryRepository repository;
  final MovementEngine movementEngine;

  List<Insumo> _insumos = [];
  List<Insumo> get insumos => _insumos;

  List<InventoryMovement> _recentMermas = [];
  List<InventoryMovement> get recentMermas => _recentMermas;

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  String? _errorMessage;
  String? get errorMessage => _errorMessage;

  ShrinkageViewModel(this.repository, this.movementEngine);

  Future<void> loadInsumos() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();
    try {
      _insumos = await repository.getActiveInsumos();
      _recentMermas = await repository.getRecentMovementsByType(MovementType.shrinkage, 10);
    } catch (e) {
      _errorMessage = 'Error al cargar datos';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> recordShrinkage({
    required String? insumoId,
    required String quantityStr,
    required String reason,
  }) async {
    _errorMessage = null;

    if (insumoId == null) {
      _errorMessage = 'Seleccione un insumo';
      notifyListeners();
      return false;
    }

    final quantity = double.tryParse(quantityStr) ?? 0;
    if (quantity <= 0) {
      _errorMessage = 'Ingrese una cantidad válida';
      notifyListeners();
      return false;
    }

    if (reason.trim().isEmpty) {
      _errorMessage = 'Ingrese un motivo';
      notifyListeners();
      return false;
    }

    try {
      _isLoading = true;
      notifyListeners();
      await movementEngine.recordShrinkage(insumoId, quantity, reason);
      await loadInsumos();
      return true;
    } catch (e) {
      _errorMessage = 'Error al registrar merma: $e';
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  void clearError() {
    _errorMessage = null;
    notifyListeners();
  }
}
