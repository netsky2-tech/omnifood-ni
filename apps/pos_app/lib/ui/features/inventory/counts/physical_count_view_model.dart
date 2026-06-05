import 'dart:collection';

import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';
import 'package:pos_app/domain/models/inventory/count_session_document.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/services/inventory/movement_engine.dart';

typedef PhysicalCountClock = DateTime Function();

class PhysicalCountViewModel extends ChangeNotifier {
  PhysicalCountViewModel(
    this._repository,
    this._movementEngine, {
    PhysicalCountClock? clock,
  }) : _clock = clock ?? DateTime.now;

  final InventoryRepository _repository;
  final MovementEngine _movementEngine;
  final PhysicalCountClock _clock;

  final List<CountSessionDocument> _sessions = <CountSessionDocument>[];
  List<Insumo> _availableInsumos = <Insumo>[];
  String? _selectedSessionId;
  bool _isLoading = false;
  String? _errorMessage;
  String? _statusMessage;

  UnmodifiableListView<CountSessionDocument> get sessions =>
      UnmodifiableListView<CountSessionDocument>(_sessions);

  List<Insumo> get availableInsumos => List<Insumo>.unmodifiable(_availableInsumos);

  CountSessionDocument? get selectedSession {
    if (_sessions.isEmpty) {
      return null;
    }
    if (_selectedSessionId == null) {
      return _sessions.first;
    }
    for (final session in _sessions) {
      if (session.id == _selectedSessionId) {
        return session;
      }
    }
    return _sessions.first;
  }

  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;
  String? get statusMessage => _statusMessage;

  Future<void> loadInitialData() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final insumos = await _repository.getActiveInsumos();
      final sessions = await _repository.getCountSessionDocuments();
      sessions.sort((left, right) => right.updatedAt.compareTo(left.updatedAt));

      _availableInsumos = insumos;
      _sessions
        ..clear()
        ..addAll(sessions);
      _selectedSessionId ??= _sessions.isEmpty ? null : _sessions.first.id;
      _statusMessage ??=
          'Modo local: cada sesión congela su baseline en SQLite y sincroniza el documento BOH después.';
    } catch (error) {
      _errorMessage = 'No se pudo cargar el workspace local de conteos: $error';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> startSession({
    required String warehouseId,
    required String warehouseName,
  }) async {
    final now = _clock();
    final session = CountSessionDocument(
      id: 'count-${now.microsecondsSinceEpoch}',
      warehouseId: warehouseId,
      warehouseName: warehouseName,
      cutoffAt: now,
      status: CountSessionStatus.open,
      createdAt: now,
      updatedAt: now,
      lines: _availableInsumos
          .map(
            (insumo) => CountSessionLineDocument(
              id: '${now.microsecondsSinceEpoch}-${insumo.id}',
              insumoId: insumo.id,
              insumoName: insumo.name,
              uom: insumo.consumptionUom,
              theoreticalQuantity: insumo.stock,
            ),
          )
          .toList(growable: false),
    );

    await _repository.saveCountSessionDocument(session);
    _selectedSessionId = session.id;
    await loadInitialData();
  }

  void selectSession(String sessionId) {
    _selectedSessionId = sessionId;
    notifyListeners();
  }

  double calculateVariance({
    required double theoreticalQuantity,
    required double countedQuantity,
  }) =>
      countedQuantity - theoreticalQuantity;

  Future<void> recordCount({
    required String sessionId,
    required String lineId,
    required double countedQuantity,
    String notes = '',
    bool disputed = false,
  }) async {
    if (countedQuantity < 0) {
      throw ArgumentError('Counted quantity must be zero or positive');
    }

    final session = _requireSession(sessionId);
    final updatedLines = session.lines.map((line) {
      if (line.id != lineId) {
        return line;
      }

      final updatedEntries = List<CountLineEntryDocument>.from(line.entries)
        ..add(
          CountLineEntryDocument(
            countedQuantity: countedQuantity,
            countedAt: _clock(),
            notes: notes.trim().isEmpty ? null : notes.trim(),
            actorLabel: 'Operador local',
            disputed: disputed,
          ),
        );

      return line.copyWith(
        approvedEntryIndex: disputed ? line.approvedEntryIndex : updatedEntries.length - 1,
        entries: updatedEntries,
      );
    }).toList(growable: false);

    await _repository.saveCountSessionDocument(
      session.copyWith(
        status: updatedLines.any((line) => line.hasDispute)
            ? CountSessionStatus.recount
            : CountSessionStatus.counting,
        updatedAt: _clock(),
        lines: updatedLines,
        isSynced: false,
      ),
    );

    await loadInitialData();
  }

  Future<void> requestApproval(String sessionId) async {
    final session = _requireSession(sessionId);
    await _repository.saveCountSessionDocument(
      session.copyWith(
        status: CountSessionStatus.approvalPending,
        updatedAt: _clock(),
        isSynced: false,
      ),
    );
    await loadInitialData();
  }

  Future<void> approveSession(String sessionId) async {
    final session = _requireSession(sessionId);
    final updatedLines = session.lines
        .map((line) => line.approvedEntryIndex != null || line.entries.isEmpty
            ? line
            : line.copyWith(approvedEntryIndex: line.entries.length - 1))
        .toList(growable: false);

    await _repository.saveCountSessionDocument(
      session.copyWith(
        status: CountSessionStatus.approved,
        updatedAt: _clock(),
        lines: updatedLines,
        isSynced: false,
      ),
    );
    await loadInitialData();
  }

  Future<void> postSession(String sessionId) async {
    final session = _requireSession(sessionId);
    final movementReferences = <String>[];

    for (final line in session.lines) {
      final approvedCount = line.approvedCountedQuantity;
      if (approvedCount == null) {
        continue;
      }

      final variance = calculateVariance(
        theoreticalQuantity: line.theoreticalQuantity,
        countedQuantity: approvedCount,
      );
      if (variance == 0) {
        continue;
      }

      final movementId = '${session.id}:${line.id}';
      await _movementEngine.recordAdjustment(
        line.insumoId,
        variance,
        buildPostingReason(sessionId: session.id, lineId: line.id),
        movementId: movementId,
      );
      movementReferences.add(movementId);
    }

    if (movementReferences.isEmpty) {
      throw ArgumentError('No variance to compensate');
    }

    _statusMessage =
        'Sesión posteada a las ${DateFormat('HH:mm').format(_clock())}. Pendiente de replay BOH.';
    await _repository.saveCountSessionDocument(
      session.copyWith(
        status: CountSessionStatus.posted,
        updatedAt: _clock(),
        postedAt: _clock(),
        movementReferences: movementReferences,
        isSynced: false,
      ),
    );
    await loadInitialData();
  }

  String buildPostingReason({
    required String sessionId,
    required String lineId,
  }) {
    return 'COUNT_SESSION:$sessionId|LINE:$lineId|AJUSTE_CONTEO';
  }

  CountSessionDocument _requireSession(String sessionId) {
    for (final session in _sessions) {
      if (session.id == sessionId) {
        return session;
      }
    }
    throw ArgumentError('Count session not found');
  }
}
