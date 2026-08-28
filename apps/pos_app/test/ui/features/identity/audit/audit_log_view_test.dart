import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:pos_app/domain/models/audit_log.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/ui/features/identity/audit/audit_log_view.dart';
import 'package:pos_app/ui/features/identity/audit/audit_log_view_model.dart';

class _FakeAuditRepository implements AuditRepository {
  final List<AuditLog> testLogs;

  _FakeAuditRepository(this.testLogs);

  @override
  Future<List<AuditLog>> getLocalLogs({DateTime? start, DateTime? end, String? userId}) async {
    return testLogs;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  final List<AuditLog> sampleLogs = [
    AuditLog(
      id: 1,
      sequenceNo: 1,
      prevHash: 'GENESIS',
      entryHash: 'hash-1',
      action: 'SALE_COMPLETED',
      userId: 'cajero_01',
      deviceId: 'SUNMI-V2S-01',
      timestamp: DateTime(2026, 8, 27, 10, 30),
      metadata: '{"invoiceNumber": "001-001-01-00000001", "total": 150.0}',
    ),
    AuditLog(
      id: 2,
      sequenceNo: 2,
      prevHash: 'hash-1',
      entryHash: 'hash-2',
      action: 'INVOICE_VOIDED',
      userId: 'supervisor_01',
      deviceId: 'SUNMI-V2S-01',
      timestamp: DateTime(2026, 8, 27, 11, 0),
      metadata: '{"reason": "DGI technical voiding"}',
    ),
    AuditLog(
      id: 3,
      sequenceNo: 3,
      prevHash: 'hash-2',
      entryHash: 'hash-3',
      action: 'USER_LOGIN',
      userId: 'cajero_02',
      deviceId: 'POS-DESKTOP-01',
      timestamp: DateTime(2026, 8, 27, 11, 15),
      metadata: '{"role": "CASHIER"}',
    ),
  ];

  Widget buildTestWidget(AuditLogViewModel viewModel) {
    return ChangeNotifierProvider<AuditLogViewModel>.value(
      value: viewModel,
      child: const MaterialApp(
        home: AuditLogView(),
      ),
    );
  }

  group('AuditLogView UI/UX & Responsiveness', () {
    testWidgets('renders log list, action badges and category chips on Sunmi V2s handheld (360x720dp)', (tester) async {
      tester.view.physicalSize = const Size(360, 720);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      final repo = _FakeAuditRepository(sampleLogs);
      final viewModel = AuditLogViewModel(repo);

      await tester.pumpWidget(buildTestWidget(viewModel));
      await tester.pumpAndSettle();

      expect(find.text('Registro de Auditoría'), findsOneWidget);
      expect(find.text('SALE_COMPLETED'), findsOneWidget);
      expect(find.text('INVOICE_VOIDED'), findsOneWidget);
      expect(find.text('VENTA'), findsOneWidget);
      expect(find.text('ANULACIÓN'), findsOneWidget);

      // Tap to inspect metadata modal
      await tester.tap(find.text('INVOICE_VOIDED'));
      await tester.pumpAndSettle();

      expect(find.text('METADATOS REGISTRADOS:'), findsOneWidget);
      expect(find.textContaining('DGI technical voiding'), findsOneWidget);
      expect(find.text('CERRAR'), findsOneWidget);

      await tester.tap(find.text('CERRAR'));
      await tester.pumpAndSettle();
    });

    testWidgets('filters logs by search query and category chips', (tester) async {
      final repo = _FakeAuditRepository(sampleLogs);
      final viewModel = AuditLogViewModel(repo);

      await tester.pumpWidget(buildTestWidget(viewModel));
      await tester.pumpAndSettle();

      // 1. Filter by category chip ANULACIONES
      await tester.tap(find.text('ANULACIONES'));
      await tester.pumpAndSettle();

      expect(find.text('INVOICE_VOIDED'), findsOneWidget);
      expect(find.text('SALE_COMPLETED'), findsNothing);

      // 2. Clear category, filter by search query
      await tester.tap(find.text('TODOS'));
      await tester.pumpAndSettle();

      final searchField = find.byType(TextField);
      await tester.enterText(searchField, 'cajero_01');
      await tester.pumpAndSettle();

      expect(find.text('SALE_COMPLETED'), findsOneWidget);
      expect(find.text('INVOICE_VOIDED'), findsNothing);
    });
  });
}
