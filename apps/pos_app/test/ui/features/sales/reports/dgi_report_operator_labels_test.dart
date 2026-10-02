import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/sales/cashier_session.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/ui/features/sales/reports/dgi_report_view.dart';
import 'package:pos_app/ui/features/sales/reports/dgi_report_view_model.dart';

class _FakeSalesRepository implements SalesRepository {
  final List<Invoice> invoices;
  final List<Payment> payments;

  _FakeSalesRepository({required this.invoices, required this.payments});

  @override
  Future<List<Invoice>> getInvoicesBySessionId(String sessionId) async => invoices;

  @override
  Future<List<Payment>> getPaymentsBySessionId(String sessionId) async => payments;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeAppDatabase implements AppDatabase {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// Extends the real view model so the D-14 name resolution
/// (seedUserNames -> userNameFor -> resolver) runs for real; only the
/// database-backed session/repo plumbing is faked.
class _FakeDgiReportViewModel extends DgiReportViewModel {
  final List<CashierSession> _testSessions;
  final List<Invoice> _testInvoices;
  final List<Payment> _testPayments;

  _FakeDgiReportViewModel(this._testSessions, this._testInvoices, this._testPayments)
      : super(
          _FakeSalesRepository(invoices: _testInvoices, payments: _testPayments),
          _FakeAppDatabase(),
        );

  @override
  List<CashierSession> get sessions => _testSessions;

  @override
  bool get isLoading => false;

  @override
  Future<Map<String, String>> loadUserNameMap() async =>
      {'cashier-1': 'María Pérez'};

  @override
  Future<void> loadSessions() async {
    seedUserNames(await loadUserNameMap());
    if (_testSessions.isNotEmpty && selectedSession == null) {
      await selectSession(_testSessions.first);
    }
  }
}

void main() {
  final testSessions = [
    CashierSession(
      id: 'session-12345678',
      userId: 'cashier-1',
      openedAt: DateTime(2026, 8, 27, 8, 0),
      tipoModelo: CashSessionModel.cajaCentral,
      openingBalance: 1000.0,
      isClosed: false,
    ),
  ];

  final testInvoices = [
    Invoice(
      id: 'inv-1',
      number: '001-001-01-00000001',
      createdAt: DateTime(2026, 8, 27, 9, 0),
      userId: 'cashier-1',
      subtotal: 100.0,
      totalTax: 15.0,
      total: 115.0,
      isCanceled: false,
    ),
  ];

  final testPayments = [
    Payment(
      id: 'pay-1',
      invoiceId: 'inv-1',
      amount: 115.0,
      method: PaymentMethod.cash,
      createdAt: DateTime(2026, 8, 27, 9, 0),
    ),
    Payment(
      id: 'pay-2',
      invoiceId: 'inv-1',
      amount: 20.0,
      method: PaymentMethod.qr,
      createdAt: DateTime(2026, 8, 27, 9, 5),
    ),
  ];

  Widget buildTestWidget(DgiReportViewModel vm) {
    return ChangeNotifierProvider<DgiReportViewModel>.value(
      value: vm,
      child: const MaterialApp(home: DgiReportView()),
    );
  }

  group('DGI report operator attribution (D-14)', () {
    test('print string names the cashier and formats the timestamps', () async {
      final vm = _FakeDgiReportViewModel(testSessions, testInvoices, testPayments);
      await vm.loadSessions();

      final report = vm.generatePrintString();

      expect(report, contains('Cajero: María Pérez'));
      expect(report, isNot(contains('Sesión ID')));
      expect(report, isNot(contains('session-')));
      expect(report, isNot(contains('cashier-1')));
      // Same-class display defect: raw DateTime.toString() on the print.
      expect(report, matches(RegExp(r'Apertura: \d{2}/\d{2}/\d{4} \d{2}:\d{2}')));
    });

    test('session label is dd/MM HH:mm + cashier name + status', () async {
      final vm = _FakeDgiReportViewModel(testSessions, testInvoices, testPayments);
      await vm.loadSessions();

      expect(
        vm.sessionLabel(testSessions.first),
        '27/08 08:00 · María Pérez (ACTIVA)',
      );
    });

    test('session label falls back honestly when the user is unresolved', () async {
      final vm = _FakeDgiReportViewModel(testSessions, testInvoices, testPayments);
      await vm.loadSessions();

      final ghost = CashierSession(
        id: 'session-ghost',
        userId: 'deleted-user',
        openedAt: DateTime(2026, 8, 27, 8, 0),
        isClosed: true,
      );
      expect(
        vm.sessionLabel(ghost),
        '27/08 08:00 · Operador no disponible (Cerrada)',
      );
    });

    test('printed payment methods use the Spanish labels and keep the amount column aligned',
        () async {
      final vm = _FakeDgiReportViewModel(testSessions, testInvoices, testPayments);
      await vm.loadSessions();

      final report = vm.generatePrintString();
      final lines = report.split('\n');
      final cashLine = lines.firstWhere((l) => l.contains('EFECTIVO'));
      final qrLine = lines.firstWhere((l) => l.contains('CÓDIGO QR'));

      expect(cashLine.contains('CASH '), isFalse);
      // The amount column must still line up: CÓDIGO QR (9 chars) fits in
      // the 15-char pad, so the $ markers share a column with EFECTIVO.
      expect(qrLine.indexOf(r'$'), cashLine.indexOf(r'$'));
    });

    testWidgets('handheld picker shows the human session label, never the id',
        (tester) async {
      tester.view.physicalSize = const Size(360, 720);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      final vm = _FakeDgiReportViewModel(testSessions, testInvoices, testPayments);
      await tester.pumpWidget(buildTestWidget(vm));
      await tester.pumpAndSettle();

      expect(find.textContaining('María Pérez'), findsWidgets);
      expect(find.textContaining('session-'), findsNothing);

      // Print preview carries the human label too.
      await tester.tap(find.text('IMPRIMIR REPORTE'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Cajero: María Pérez'), findsOneWidget);
      await tester.tap(find.text('CERRAR'));
      await tester.pumpAndSettle();
    });

    testWidgets('desktop sidebar shows the human session label, never the id',
        (tester) async {
      tester.view.physicalSize = const Size(1280, 800);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      final vm = _FakeDgiReportViewModel(testSessions, testInvoices, testPayments);
      await tester.pumpWidget(buildTestWidget(vm));
      await tester.pumpAndSettle();

      expect(find.textContaining('María Pérez'), findsWidgets);
      expect(find.textContaining('session-'), findsNothing);
      // Same-class display defect in the sidebar subtitle.
      expect(
        find.textContaining(RegExp(r'Abierta: \d{2}/\d{2}/\d{4} \d{2}:\d{2}')),
        findsWidgets,
      );
    });
  });
}
