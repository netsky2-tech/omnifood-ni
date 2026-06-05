import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/inventory/forensic_alert.dart';
import 'package:pos_app/presentation/services/alert_service_impl.dart';
import 'package:pos_app/ui/features/inventory/alerts/forensic_alert_view.dart';
import 'package:pos_app/ui/features/inventory/alerts/forensic_alert_view_model.dart';
import 'package:provider/provider.dart';

void main() {
  late AlertServiceImpl alertService;
  late ForensicAlertViewModel viewModel;

  Widget buildApp() {
    return MaterialApp(
      home: ChangeNotifierProvider<ForensicAlertViewModel>.value(
        value: viewModel,
        child: const ForensicAlertView(),
      ),
    );
  }

  setUp(() {
    alertService = AlertServiceImpl();
    viewModel = ForensicAlertViewModel(alertService);
  });

  tearDown(() {
    viewModel.dispose();
    alertService.dispose();
  });

  testWidgets('renders an explicit empty state when no session alerts exist', (tester) async {
    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    expect(find.text('Todavía no hay alertas BOH activas para esta tienda.'), findsOneWidget);
    expect(find.text('Bandeja persistente BOH.'), findsOneWidget);
  });

  testWidgets('renders alert details and acknowledges an alert from the screen', (tester) async {
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
          'originDocument': 'session-low-stock',
          'sourceMovementId': 'mov-1',
        },
      ),
    );

    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    expect(find.text('Stock bajo en Base de Café.'), findsOneWidget);
    expect(find.text('HIGH'), findsOneWidget);
    expect(find.text('LOW_STOCK'), findsOneWidget);
    expect(find.text('Activa'), findsOneWidget);

    await tester.tap(find.text('RECONOCER'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).last, 'Gerencia enterada');
    await tester.tap(find.text('CONFIRMAR RECONOCIMIENTO'));
    await tester.pumpAndSettle();

    expect(find.text('Reconocida'), findsOneWidget);
    expect(find.text('Movimiento origen: mov-1'), findsOneWidget);
    expect(find.text('Gerencia enterada'), findsOneWidget);

    await tester.tap(find.text('Reconocidas'));
    await tester.pumpAndSettle();

    expect(find.text('Stock bajo en Base de Café.'), findsOneWidget);
  });

  testWidgets('renders resolved alerts with traceability metadata', (tester) async {
    alertService.publishAlert(
      ForensicAlert(
        id: 'alert-2',
        alertType: 'COUNT_VARIANCE',
        severity: 'critical',
        message: 'Conteo con variación relevante.',
        createdAt: DateTime(2026, 6, 2, 10),
        status: 'resolved',
        note: 'Compensado con ajuste aprobado',
        actorLabel: 'auditor-1',
        sourceDocumentId: 'count-1',
        sourceDocumentType: 'COUNT_SESSION',
        metadata: const <String, dynamic>{
          'item': 'Leche',
        },
      ),
    );

    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    await tester.tap(find.text('Todas'));
    await tester.pumpAndSettle();

    expect(find.text('Resuelta'), findsOneWidget);
    expect(find.text('Documento origen: COUNT_SESSION · count-1'), findsOneWidget);
    expect(find.text('Compensado con ajuste aprobado'), findsOneWidget);
  });
}
