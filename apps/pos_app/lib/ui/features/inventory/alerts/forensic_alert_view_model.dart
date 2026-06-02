import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:pos_app/domain/models/inventory/forensic_alert.dart';
import 'package:pos_app/domain/services/alerts/alert_service.dart';

enum AlertStatusFilter { active, acknowledged, all }

class ForensicAlertViewModel extends ChangeNotifier {
  ForensicAlertViewModel(this._alertService) {
    _alerts.addAll(_alertService.sessionAlerts);
    _subscription = _alertService.sessionAlertsStream.listen((nextAlerts) {
      _alerts
        ..clear()
        ..addAll(nextAlerts);
      notifyListeners();
    });
  }

  final AlertService _alertService;
  final List<ForensicAlert> _alerts = <ForensicAlert>[];
  final Set<String> _acknowledgedAlertIds = <String>{};
  late final StreamSubscription<List<ForensicAlert>> _subscription;

  AlertStatusFilter _filter = AlertStatusFilter.active;

  List<ForensicAlert> get alerts => List<ForensicAlert>.unmodifiable(_alerts);
  AlertStatusFilter get filter => _filter;

  List<ForensicAlert> get visibleAlerts {
    switch (_filter) {
      case AlertStatusFilter.active:
        return alerts.where((alert) => !_acknowledgedAlertIds.contains(alert.id)).toList(growable: false);
      case AlertStatusFilter.acknowledged:
        return alerts.where((alert) => _acknowledgedAlertIds.contains(alert.id)).toList(growable: false);
      case AlertStatusFilter.all:
        return alerts;
    }
  }

  void replaceAlerts(List<ForensicAlert> nextAlerts) {
    _alerts
      ..clear()
      ..addAll(nextAlerts);
    notifyListeners();
  }

  void acknowledgeAlert(String alertId) {
    if (_acknowledgedAlertIds.add(alertId)) {
      if (_filter == AlertStatusFilter.active) {
        _filter = AlertStatusFilter.all;
      }
      notifyListeners();
    }
  }

  void setFilter(AlertStatusFilter nextFilter) {
    if (_filter == nextFilter) {
      return;
    }

    _filter = nextFilter;
    notifyListeners();
  }

  String statusFor(ForensicAlert alert) =>
      _acknowledgedAlertIds.contains(alert.id) ? 'Reconocida' : 'Activa';

  @override
  void dispose() {
    _subscription.cancel();
    super.dispose();
  }
}
