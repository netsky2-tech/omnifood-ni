import 'package:pos_app/domain/models/inventory/forensic_alert.dart';

abstract class AlertService {
  Stream<AlertMessage> get alertStream;
  Stream<List<ForensicAlert>> get sessionAlertsStream;
  List<ForensicAlert> get sessionAlerts;

  void publishAlert(ForensicAlert alert);
  Future<void> acknowledgeAlert(
    String alertId, {
    required String note,
    required String actorLabel,
  });
  Future<void> resolveAlert(
    String alertId, {
    required String note,
    required String actorLabel,
  });
  Future<void> hydrateInbox();
  void notifyLowStock(
    String insumoName,
    double currentStock,
    double parLevel, {
    String? sourceMovementId,
    String? sourceDocumentId,
    String? sourceDocumentType,
  });
}

class AlertMessage {
  final String message;
  final DateTime timestamp;

  AlertMessage(this.message) : timestamp = DateTime.now();
}
