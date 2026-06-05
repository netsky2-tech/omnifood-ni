import 'dart:async';

import 'package:pos_app/domain/models/inventory/forensic_alert.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';

import '../../domain/services/alerts/alert_service.dart';

class AlertServiceImpl implements AlertService {
  AlertServiceImpl([this._inventoryRepository]);

  final _controller = StreamController<AlertMessage>.broadcast();
  final _sessionAlertsController = StreamController<List<ForensicAlert>>.broadcast();
  final List<ForensicAlert> _sessionAlerts = <ForensicAlert>[];
  final InventoryRepository? _inventoryRepository;

  @override
  Stream<AlertMessage> get alertStream => _controller.stream;

  @override
  Stream<List<ForensicAlert>> get sessionAlertsStream => _sessionAlertsController.stream;

  @override
  List<ForensicAlert> get sessionAlerts => List<ForensicAlert>.unmodifiable(_sessionAlerts);

  @override
  void publishAlert(ForensicAlert alert) {
    unawaited(_persistAlert(alert));
  }

  @override
  Future<void> hydrateInbox() async {
    if (_inventoryRepository == null) {
      _sessionAlertsController.add(sessionAlerts);
      return;
    }
    final persistedAlerts = await _inventoryRepository.getForensicAlerts();
    _sessionAlerts
      ..clear()
      ..addAll(persistedAlerts..sort((a, b) => b.createdAt.compareTo(a.createdAt)));
    _sessionAlertsController.add(sessionAlerts);
  }

  @override
  Future<void> acknowledgeAlert(
    String alertId, {
    required String note,
    required String actorLabel,
  }) async {
    await _transitionAlert(
      alertId,
      status: 'acknowledged',
      note: note,
      actorLabel: actorLabel,
    );
  }

  @override
  Future<void> resolveAlert(
    String alertId, {
    required String note,
    required String actorLabel,
  }) async {
    await _transitionAlert(
      alertId,
      status: 'resolved',
      note: note,
      actorLabel: actorLabel,
    );
  }

  @override
  void notifyLowStock(
    String insumoName,
    double currentStock,
    double parLevel, {
    String? sourceMovementId,
    String? sourceDocumentId,
    String? sourceDocumentType,
  }) {
    publishAlert(
      ForensicAlert(
        id: 'low-stock-$insumoName',
        alertType: 'LOW_STOCK',
        severity: currentStock <= 0 ? 'critical' : 'high',
        message: 'Stock bajo en $insumoName.',
        createdAt: DateTime.now(),
        sourceMovementId: sourceMovementId,
        sourceDocumentId: sourceDocumentId,
        sourceDocumentType: sourceDocumentType,
        metadata: <String, dynamic>{
          'item': insumoName,
          'currentStock': currentStock,
          'parLevel': parLevel,
          'originDocument': 'session-low-stock',
          'movementType': 'LOW_STOCK_THRESHOLD',
          // ignore: use_null_aware_elements
          if (sourceMovementId != null) 'sourceMovementId': sourceMovementId,
        },
      ),
    );
    _controller.add(
      AlertMessage('Alerta: Stock bajo en $insumoName (Actual: $currentStock)'),
    );
  }

  void dispose() {
    _controller.close();
    _sessionAlertsController.close();
  }

  Future<void> _persistAlert(ForensicAlert alert) async {
    final nextAlert = alert.copyWith(isSynced: alert.status == 'active');
    final existingIndex = _sessionAlerts.indexWhere((item) => item.id == nextAlert.id);
    if (existingIndex >= 0) {
      _sessionAlerts[existingIndex] = nextAlert;
    } else {
      _sessionAlerts.insert(0, nextAlert);
    }
    _sessionAlerts.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    _sessionAlertsController.add(sessionAlerts);
    if (_inventoryRepository != null) {
      await _inventoryRepository.saveForensicAlert(nextAlert);
    }
  }

  Future<void> _transitionAlert(
    String alertId, {
    required String status,
    required String note,
    required String actorLabel,
  }) async {
    final index = _sessionAlerts.indexWhere((alert) => alert.id == alertId);
    if (index < 0) {
      return;
    }

    final current = _sessionAlerts[index];
    final next = current.copyWith(
      status: status,
      note: note,
      actorLabel: actorLabel,
      actedAt: DateTime.now(),
      isSynced: false,
    );

    await _persistAlert(next);
  }
}
