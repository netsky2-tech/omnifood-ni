abstract class AlertService {
  Stream<AlertMessage> get alertStream;
  void notifyLowStock(String insumoName, double currentStock, double parLevel);
}

class AlertMessage {
  final String message;
  final DateTime timestamp;

  AlertMessage(this.message) : timestamp = DateTime.now();
}
