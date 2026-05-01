import 'dart:async';
import '../../domain/services/alerts/alert_service.dart';

class AlertServiceImpl implements AlertService {
  final _controller = StreamController<AlertMessage>.broadcast();

  @override
  Stream<AlertMessage> get alertStream => _controller.stream;

  @override
  void notifyLowStock(String insumoName, double currentStock, double parLevel) {
    _controller.add(
      AlertMessage('Alerta: Stock bajo en $insumoName (Actual: $currentStock)'),
    );
  }

  void dispose() {
    _controller.close();
  }
}
