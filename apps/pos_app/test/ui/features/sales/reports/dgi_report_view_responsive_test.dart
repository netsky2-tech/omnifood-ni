import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:pos_app/domain/models/sales/cashier_session.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/ui/features/sales/reports/dgi_report_view.dart';
import 'package:pos_app/ui/features/sales/reports/dgi_report_view_model.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/data/database/app_database.dart';

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

class _FakeDgiReportViewModel extends DgiReportViewModel {
  final List<CashierSession> _testSessions;
  final List<Invoice> _testInvoices;
  final List<Payment> _testPayments;

  _FakeDgiReportViewModel(
    this._testSessions,
    this._testInvoices,
    this._testPayments,
  ) : super(
          _FakeSalesRepository(invoices: _testInvoices, payments: _testPayments),
          _FakeAppDatabase(),
        );

  @override
  List<CashierSession> get sessions => _testSessions;

  @override
  bool get isLoading => false;

  @override
  Future<void> loadSessions() async {
    if (_testSessions.isNotEmpty && selectedSession == null) {
      await selectSession(_testSessions.first);
    }
  }

  @override
  Future<void> selectSession(CashierSession? session) async {
    if (session == null) {
      super.selectSession(null);
      return;
    }
    await super.selectSession(session);
  }
}

class _FakeAppDatabase implements AppDatabase {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
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
    Invoice(
      id: 'inv-2',
      number: '001-001-01-00000002',
      createdAt: DateTime(2026, 8, 27, 10, 0),
      userId: 'cashier-1',
      subtotal: 50.0,
      totalTax: 7.5,
      total: 57.5,
      isCanceled: true,
    ),
  ];

  final List<Payment> testPayments = [
    Payment(
      id: 'pay-1',
      invoiceId: 'inv-1',
      amount: 115.0,
      method: PaymentMethod.cash,
      createdAt: DateTime(2026, 8, 27, 9, 0),
    ),
  ];

  Widget buildTestWidget(DgiReportViewModel vm) {
    return ChangeNotifierProvider<DgiReportViewModel>.value(
      value: vm,
      child: const MaterialApp(
        home: DgiReportView(),
      ),
    );
  }

  group('DgiReportView Responsive Layout', () {
    testWidgets('renders desktop sidebar and report on wide screens (> 600dp)', (tester) async {
      tester.view.physicalSize = const Size(1280, 800);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      final vm = _FakeDgiReportViewModel(testSessions, testInvoices, testPayments);
      await tester.pumpWidget(buildTestWidget(vm));
      await tester.pumpAndSettle();

      expect(find.text('HISTORIAL DE SESIONES'), findsOneWidget);
      expect(find.text('Arqueo de Caja (Reporte X)'), findsOneWidget);
      expect(find.text('Ventas Brutas'), findsOneWidget);
      expect(find.text('C\$ 115.00'), findsWidgets);
      expect(find.text('IVA (15%)'), findsOneWidget);
      expect(find.text('C\$ 15.00'), findsOneWidget);
      expect(find.text('Ventas Netas'), findsOneWidget);
      expect(find.text('C\$ 100.00'), findsOneWidget);
    });

    testWidgets('renders adaptive dropdown and stacked KPI cards on Sunmi V2s handheld (360x720dp)', (tester) async {
      tester.view.physicalSize = const Size(360, 720);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      final vm = _FakeDgiReportViewModel(testSessions, testInvoices, testPayments);
      await tester.pumpWidget(buildTestWidget(vm));
      await tester.pumpAndSettle();

      // Mobile session selector
      expect(find.text('SESIÓN / ARQUEO'), findsOneWidget);

      // Report details rendered without overflow
      expect(find.text('Arqueo de Caja (Reporte X)'), findsOneWidget);
      expect(find.text('IMPRIMIR REPORTE'), findsOneWidget);
      expect(find.text('Ventas Brutas'), findsOneWidget);
      expect(find.text('C\$ 115.00'), findsWidgets);
      expect(find.text('IVA (15%)'), findsOneWidget);
      expect(find.text('C\$ 15.00'), findsOneWidget);
      expect(find.text('Ventas Netas'), findsOneWidget);
      expect(find.text('C\$ 100.00'), findsOneWidget);

      // Verify print preview modal opens cleanly
      await tester.tap(find.text('IMPRIMIR REPORTE'));
      await tester.pumpAndSettle();

      expect(find.text('Vista Previa de Impresión'), findsOneWidget);
      expect(find.text('CERRAR'), findsOneWidget);

      await tester.tap(find.text('CERRAR'));
      await tester.pumpAndSettle();
    });
  });
}
