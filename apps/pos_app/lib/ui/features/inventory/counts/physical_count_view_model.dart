import 'dart:collection';

import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/services/inventory/movement_engine.dart';

typedef PhysicalCountClock = DateTime Function();

@immutable
class PhysicalCountHistoryEntry {
  const PhysicalCountHistoryEntry({
    required this.id,
    required this.insumoId,
    required this.insumoName,
    required this.expectedQuantity,
    required this.countedQuantity,
    required this.variance,
    required this.uom,
    required this.reason,
    required this.notes,
    required this.appliedAt,
    required this.appliedAtLabel,
  });

  final String id;
  final String insumoId;
  final String insumoName;
  final double expectedQuantity;
  final double countedQuantity;
  final double variance;
  final String uom;
  final String reason;
  final String notes;
  final DateTime appliedAt;
  final String appliedAtLabel;
}

class PhysicalCountViewModel extends ChangeNotifier {
  PhysicalCountViewModel(
    this._repository,
    this._movementEngine, {
    PhysicalCountClock? clock,
  }) : _clock = clock ?? DateTime.now;

  static const String _reasonPrefix = 'Conteo físico';

  final InventoryRepository _repository;
  final MovementEngine _movementEngine;
  final PhysicalCountClock _clock;

  final List<PhysicalCountHistoryEntry> _history = <PhysicalCountHistoryEntry>[];
  List<Insumo> _availableInsumos = <Insumo>[];
  bool _isLoading = false;
  String? _errorMessage;
  String? _statusMessage;

  UnmodifiableListView<PhysicalCountHistoryEntry> get history =>
      UnmodifiableListView<PhysicalCountHistoryEntry>(_history);

  List<Insumo> get availableInsumos => List<Insumo>.unmodifiable(_availableInsumos);
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;
  String? get statusMessage => _statusMessage;

  Future<void> loadInitialData() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final insumos = await _repository.getActiveInsumos();
      final movements = await _repository.getAllMovements();
      final insumoMap = <String, Insumo>{for (final insumo in insumos) insumo.id: insumo};
      final adjustments = movements
          .where((movement) => movement.type == MovementType.adjustment)
          .map((movement) => _toHistoryEntry(movement, insumoMap[movement.insumoId]))
          .toList(growable: false)
        ..sort((left, right) => right.appliedAt.compareTo(left.appliedAt));

      _availableInsumos = insumos;
      _history
        ..clear()
        ..addAll(adjustments);
      _statusMessage ??=
          'Modo local: cada conteo aplica un movimiento compensatorio sólo en SQLite/Kardex de esta terminal.';
    } catch (error) {
      _errorMessage = 'No se pudo cargar el historial local de conteos: $error';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  double theoreticalQuantityFor(String insumoId) {
    for (final insumo in _availableInsumos) {
      if (insumo.id == insumoId) {
        return insumo.stock;
      }
    }
    return 0;
  }

  double calculateVariance({
    required double theoreticalQuantity,
    required double countedQuantity,
  }) {
    return countedQuantity - theoreticalQuantity;
  }

  Future<void> applyPhysicalCount({
    required String insumoId,
    required double countedQuantity,
    required String reason,
    String notes = '',
  }) async {
    if (insumoId.trim().isEmpty) {
      throw ArgumentError('Insumo is required');
    }
    if (countedQuantity < 0) {
      throw ArgumentError('Counted quantity must be zero or positive');
    }

    final normalizedReason = reason.trim();
    if (normalizedReason.isEmpty) {
      throw ArgumentError('Reason is required');
    }

    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final insumo = await _repository.getInsumoById(insumoId);
      if (insumo == null) {
        throw ArgumentError('Insumo not found');
      }

      final variance = calculateVariance(
        theoreticalQuantity: insumo.stock,
        countedQuantity: countedQuantity,
      );
      if (variance == 0) {
        throw ArgumentError('No variance to compensate');
      }

      final normalizedNotes = notes.trim();
      await _movementEngine.recordAdjustment(
        insumoId,
        variance,
        buildAdjustmentReason(reason: normalizedReason, notes: normalizedNotes),
      );

      _statusMessage =
          'Ajuste compensatorio aplicado localmente a las ${DateFormat('HH:mm').format(_clock())}. Pendiente de conciliación BOH global.';
      await loadInitialData();
    } catch (error) {
      _errorMessage = 'No se pudo aplicar el conteo físico: $error';
      rethrow;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  String buildAdjustmentReason({
    required String reason,
    String notes = '',
  }) {
    final normalizedReason = reason.trim();
    final normalizedNotes = notes.trim();
    if (normalizedNotes.isEmpty) {
      return '$_reasonPrefix | Motivo: $normalizedReason';
    }
    return '$_reasonPrefix | Motivo: $normalizedReason | Notas: $normalizedNotes';
  }

  PhysicalCountHistoryEntry _toHistoryEntry(
    InventoryMovement movement,
    Insumo? insumo,
  ) {
    final dateFormat = DateFormat('yyyy-MM-dd HH:mm');
    final detail = _parseReason(movement.reason ?? _reasonPrefix);

    return PhysicalCountHistoryEntry(
      id: movement.id,
      insumoId: movement.insumoId,
      insumoName: insumo?.name ?? movement.insumoId,
      expectedQuantity: movement.previousStock,
      countedQuantity: movement.newStock,
      variance: movement.quantity,
      uom: insumo?.consumptionUom ?? '',
      reason: detail.reason,
      notes: detail.notes,
      appliedAt: movement.timestamp,
      appliedAtLabel: dateFormat.format(movement.timestamp.toLocal()),
    );
  }

  ({String reason, String notes}) _parseReason(String rawReason) {
    final parts = rawReason.split('|').map((part) => part.trim()).toList(growable: false);
    var reason = rawReason.trim();
    var notes = '';

    for (final part in parts) {
      if (part.startsWith('Motivo:')) {
        reason = part.replaceFirst('Motivo:', '').trim();
      }
      if (part.startsWith('Notas:')) {
        notes = part.replaceFirst('Notas:', '').trim();
      }
    }

    return (reason: reason, notes: notes);
  }
}
