import 'package:flutter/foundation.dart';
import '../../../../domain/models/inventory/batch.dart';
import '../../../../domain/models/inventory/insumo.dart';
import '../../../../domain/repositories/inventory/inventory_repository.dart';
import '../../../../domain/services/inventory/movement_engine.dart';
import 'merma_taxonomy.dart';

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

  List<Batch> _batchPreview = [];
  List<Batch> get batchPreview => _batchPreview;

  String? _selectedBatchId;
  String? get selectedBatchId => _selectedBatchId;

  Batch? get selectedBatch => _batchPreview.cast<Batch?>().firstWhere(
    (batch) => batch?.id == _selectedBatchId,
    orElse: () => null,
  );

  ShrinkageViewModel(this.repository, this.movementEngine);

  Future<void> loadInsumos() async {
    _isLoading = true;
    notifyListeners();
    _insumos = await repository.getActiveInsumos();
    _isLoading = false;
    notifyListeners();
  }

  Future<void> previewAdjustment(String insumoId) async {
    _batchPreview = await repository.getBatchesByInsumoId(insumoId);
    _selectedBatchId = null;
    notifyListeners();
  }

  void selectBatch(String? batchId) {
    _selectedBatchId = batchId;
    notifyListeners();
  }

  double projectedAdjustmentValue(double quantity) {
    final batch = selectedBatch;
    if (batch == null) {
      return 0;
    }

    return quantity * batch.cost;
  }

  Future<void> recordShrinkage({
    required String insumoId,
    required double quantity,
    required String shrinkageType,
    required String observation,
  }) async {
    final canonicalReason = normalizeMermaReason(shrinkageType);
    if (canonicalReason == null) {
      throw ArgumentError('Invalid shrinkage type');
    }
    final requiredObservation = requireMermaObservation(observation);

    _isLoading = true;
    notifyListeners();
    try {
      final insumo = _insumos.firstWhere((item) => item.id == insumoId);
      if (_batchPreview.isNotEmpty && _selectedBatchId == null) {
        throw StateError(
          'A batch selection is required before recording shrinkage',
        );
      }

      final valuationNio = quantity * insumo.averageCost;
      _forensicNotice = valuationNio > highValueAdjustmentThresholdNio
          ? 'Ajuste de alto valor. Se notificó al administrador.'
          : null;

      final selectedBatchNumber = selectedBatch?.batchNumber;
      final reasonParts = <String>[
        canonicalReason,
        'observation:$requiredObservation',
        if (selectedBatchNumber != null) 'batch:$selectedBatchNumber',
      ];
      final reason = reasonParts.join(' | ');

      await movementEngine.recordShrinkage(insumoId, quantity, reason);
      await loadInsumos();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }
}
