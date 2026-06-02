import 'dart:async';

import 'package:pos_app/domain/models/inventory/forensic_alert.dart';

import '../../domain/services/alerts/alert_service.dart';

class AlertServiceImpl implements AlertService {
  final _controller = StreamController<AlertMessage>.broadcast();
  final _sessionAlertsController = StreamController<List<ForensicAlert>>.broadcast();
  final List<ForensicAlert> _sessionAlerts = <ForensicAlert>[];

  @override
  Stream<AlertMessage> get alertStream => _controller.stream;

  @override
  Stream<List<ForensicAlert>> get sessionAlertsStream => _sessionAlertsController.stream;

  @override
  List<ForensicAlert> get sessionAlerts => List<ForensicAlert>.unmodifiable(_sessionAlerts);

  @override
  void publishAlert(ForensicAlert alert) {
    _sessionAlerts.insert(0, alert);
    _sessionAlertsController.add(sessionAlerts);
  }

  @override
  void notifyLowStock(String insumoName, double currentStock, double parLevel) {
    publishAlert(
      ForensicAlert(
        id: 'low-stock-${DateTime.now().microsecondsSinceEpoch}',
        alertType: 'LOW_STOCK',
        severity: currentStock <= 0 ? 'critical' : 'high',
        message: 'Stock bajo en $insumoName.',
        createdAt: DateTime.now(),
        metadata: <String, dynamic>{
          'item': insumoName,
          'currentStock': currentStock,
          'parLevel': parLevel,
          'originDocument': 'session-low-stock',
          'movementType': 'LOW_STOCK_THRESHOLD',
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
}
