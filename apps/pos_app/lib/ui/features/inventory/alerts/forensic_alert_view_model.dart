import 'package:flutter/foundation.dart';
import 'package:pos_app/domain/models/inventory/forensic_alert.dart';

class ForensicAlertViewModel extends ChangeNotifier {
  final List<ForensicAlert> _alerts = <ForensicAlert>[];

  List<ForensicAlert> get alerts => List<ForensicAlert>.unmodifiable(_alerts);

  void replaceAlerts(List<ForensicAlert> nextAlerts) {
    _alerts
      ..clear()
      ..addAll(nextAlerts);
    notifyListeners();
  }
}
