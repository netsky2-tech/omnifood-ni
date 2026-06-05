import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/inventory/forensic_alert.dart';
import 'package:pos_app/presentation/services/alert_service_impl.dart';
import 'package:pos_app/ui/features/inventory/alerts/forensic_alert_view_model.dart';

void main() {
  late AlertServiceImpl alertService;
  late ForensicAlertViewModel viewModel;

  setUp(() {
    alertService = AlertServiceImpl();
    viewModel = ForensicAlertViewModel(alertService);
  });

  tearDown(() {
    viewModel.dispose();
    alertService.dispose();
  });

  test('loads session alerts from the shared alert service', () async {
    alertService.publishAlert(
      ForensicAlert(
        id: 'alert-1',
        alertType: 'LOW_STOCK',
        severity: 'high',
        message: 'Stock bajo en Base de Café.',
        createdAt: DateTime(2026, 6, 1, 10),
        metadata: const <String, dynamic>{
          'item': 'Base de Café',
          'currentStock': 1.5,
          'parLevel': 3.0,
        },
      ),
    );

    await Future<void>.delayed(Duration.zero);

    expect(viewModel.alerts, hasLength(1));
    expect(viewModel.visibleAlerts.first.alertType, 'LOW_STOCK');
    expect(viewModel.statusFor(viewModel.visibleAlerts.first), 'Activa');
  });

  test('acknowledges an alert and exposes it through the acknowledged filter', () async {
    alertService.publishAlert(
      ForensicAlert(
        id: 'alert-2',
        alertType: 'FORENSIC_REVIEW',
        severity: 'critical',
        message: 'Ajuste manual de alto valor pendiente de revisión.',
        createdAt: DateTime(2026, 6, 1, 11),
      ),
    );

    await Future<void>.delayed(Duration.zero);
    await viewModel.acknowledgeAlert(
      'alert-2',
      note: 'Revisado por gerente',
      actorLabel: 'manager-1',
    );
    viewModel.setFilter(AlertStatusFilter.acknowledged);

    expect(viewModel.visibleAlerts, hasLength(1));
    expect(viewModel.statusFor(viewModel.visibleAlerts.first), 'Reconocida');
    expect(viewModel.visibleAlerts.first.note, 'Revisado por gerente');
    expect(viewModel.visibleAlerts.first.actorLabel, 'manager-1');
  });

  test('resolves an alert and keeps it visible in all filter with lifecycle metadata', () async {
    alertService.publishAlert(
      ForensicAlert(
        id: 'alert-3',
        alertType: 'LOW_STOCK',
        severity: 'high',
        message: 'Stock bajo en azúcar.',
        createdAt: DateTime(2026, 6, 1, 12),
      ),
    );

    await Future<void>.delayed(Duration.zero);
    await viewModel.resolveAlert(
      'alert-3',
      note: 'Compra registrada y stock recuperado',
      actorLabel: 'manager-2',
    );
    viewModel.setFilter(AlertStatusFilter.all);

    expect(viewModel.visibleAlerts, hasLength(1));
    expect(viewModel.statusFor(viewModel.visibleAlerts.first), 'Resuelta');
    expect(viewModel.visibleAlerts.first.note, contains('stock recuperado'));
  });
}
