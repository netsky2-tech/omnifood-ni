import 'package:flutter/foundation.dart';
import '../../../../domain/models/inventory/insumo.dart';
import '../../../../domain/repositories/inventory/inventory_repository.dart';
import '../../../../domain/services/inventory/movement_engine.dart';

const shrinkageTypes = <String>[
  'VENCIMIENTO',
  'DESECHO_COCINA',
  'DETERIORO_BODEGA',
  'CORTESIA_DEGUSTACION',
];

const highValueAdjustmentThresholdNio = 1500.0;

class ShrinkageViewModel with ChangeNotifier {
  final InventoryRepository repository;
  final MovementEngine movementEngine;

  List<Insumo> _insumos = [];
  List<Insumo> get insumos => _insumos;

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  String? _forensicNotice;
  String? get forensicNotice => _forensicNotice;

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
    required String shrinkageType,
  }) async {
    if (!shrinkageTypes.contains(shrinkageType)) {
      throw ArgumentError('Invalid shrinkage type');
    }

    _isLoading = true;
    notifyListeners();
    try {
      final insumo = _insumos.firstWhere((item) => item.id == insumoId);
      final valuationNio = quantity * insumo.averageCost;
      _forensicNotice = valuationNio > highValueAdjustmentThresholdNio
          ? 'Ajuste de alto valor. Se notificó al administrador.'
          : null;

      await movementEngine.recordShrinkage(insumoId, quantity, shrinkageType);
      await loadInsumos();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }
}
