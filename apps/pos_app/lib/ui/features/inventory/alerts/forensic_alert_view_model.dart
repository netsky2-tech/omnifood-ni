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
  late final StreamSubscription<List<ForensicAlert>> _subscription;

  AlertStatusFilter _filter = AlertStatusFilter.active;

  List<ForensicAlert> get alerts => List<ForensicAlert>.unmodifiable(_alerts);
  AlertStatusFilter get filter => _filter;

  List<ForensicAlert> get visibleAlerts {
    switch (_filter) {
      case AlertStatusFilter.active:
        return alerts.where((alert) => alert.status == 'active').toList(growable: false);
      case AlertStatusFilter.acknowledged:
        return alerts.where((alert) => alert.status == 'acknowledged').toList(growable: false);
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

  Future<void> acknowledgeAlert(
    String alertId, {
    required String note,
    required String actorLabel,
  }) async {
    await _alertService.acknowledgeAlert(
      alertId,
      note: note,
      actorLabel: actorLabel,
    );
    if (_filter == AlertStatusFilter.active) {
      _filter = AlertStatusFilter.all;
    }
    notifyListeners();
  }

  Future<void> resolveAlert(
    String alertId, {
    required String note,
    required String actorLabel,
  }) async {
    await _alertService.resolveAlert(
      alertId,
      note: note,
      actorLabel: actorLabel,
    );
    if (_filter == AlertStatusFilter.active) {
      _filter = AlertStatusFilter.all;
    }
    notifyListeners();
  }

  void setFilter(AlertStatusFilter nextFilter) {
    if (_filter == nextFilter) {
      return;
    }

    _filter = nextFilter;
    notifyListeners();
  }

  String statusFor(ForensicAlert alert) =>
      switch (alert.status) {
        'acknowledged' => 'Reconocida',
        'resolved' => 'Resuelta',
        'superseded' => 'Reemplazada',
        _ => 'Activa',
      };

  @override
  void dispose() {
    _subscription.cancel();
    super.dispose();
  }
}
