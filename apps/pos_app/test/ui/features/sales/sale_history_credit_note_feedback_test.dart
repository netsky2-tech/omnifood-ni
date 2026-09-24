import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:provider/provider.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/presentation/features/sales/view_models/sales_history_view_model.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/ui/features/sales/sales_history_view.dart';
import 'sale_view_security_flows_test.mocks.dart';

/// AC-13 regression guard: the credit-note dialog must report the outcome it
/// actually observed. A locally-created credit note is NOT an accepted one,
/// so the success copy must claim only local registration pending sync, and
/// a failure must keep the dialog open (the typed reason must not be lost).
///
/// The legacy string 'Nota de Crédito emitida correctamente' asserted an
/// upstream acceptance the POS never observed; its absence is asserted in
/// every scenario below.
void main() {
  late MockSaleViewModel mockSaleViewModel;
  late _FakeSalesHistoryViewModel fakeHistoryViewModel;

  const testItem = InvoiceItem(
    id: 'item-1',
    invoiceId: 'inv-1',
    productId: 'prod-1',
    productName: 'Café Espresso',
    quantity: 2,
    unitPrice: 50.0,
    originalTaxRate: 0.15,
    appliedTaxRate: 0.15,
    taxAmount: 15.0,
    total: 115.0,
  );

  Invoice buildInvoice() => Invoice(
        id: 'inv-1',
        number: '001-001-01-00000001',
        createdAt: DateTime(2026, 8, 27, 10, 30),
        userId: 'cashier-1',
        subtotal: 100.0,
        totalTax: 15.0,
        total: 115.0,
        isCanceled: false,
      );

  setUp(() {
    mockSaleViewModel = MockSaleViewModel();
    fakeHistoryViewModel = _FakeSalesHistoryViewModel([testItem]);
  });

  Future<void> pumpDetailScreen(WidgetTester tester) async {
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<SalesHistoryViewModel>.value(
            value: fakeHistoryViewModel,
          ),
          ChangeNotifierProvider<SaleViewModel>.value(value: mockSaleViewModel),
        ],
        child: MaterialApp(
          home: InvoiceDetailScreen(invoice: buildInvoice()),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('REALIZAR DEVOLUCIÓN'));
    await tester.pumpAndSettle();
  }

  Future<void> tapProcess(WidgetTester tester) async {
    await tester.tap(find.text('PROCESAR'));
    await tester.pump(); // start the async callback
    await tester.pump(const Duration(milliseconds: 400)); // snackbar animation
  }

  testWidgets(
    'role-denied processReturn shows the error, keeps the dialog open, and never shows the legacy success copy',
    (tester) async {
      when(mockSaleViewModel.errorMessage).thenReturn('Acceso denegado.');
      when(mockSaleViewModel.processReturn(any, any)).thenAnswer(
        (_) async => false,
      );

      await pumpDetailScreen(tester);
      await tapProcess(tester);

      // The dialog stays open so the typed reason is not lost.
      expect(find.text('Confirmar Devolución'), findsOneWidget);
      expect(find.text('Devolución de cliente'), findsOneWidget);
      // The Spanish error is surfaced.
      expect(find.text('Acceso denegado.'), findsOneWidget);
      // AC-13 regression guard: neither the legacy nor the honest success
      // copy may appear on a failure path.
      expect(find.textContaining('emitida correctamente'), findsNothing);
      expect(
        find.text('Nota de Crédito registrada. Pendiente de validación al sincronizar.'),
        findsNothing,
      );
      // A failed local operation must not refresh the history list.
      expect(fakeHistoryViewModel.loadInvoicesCalls, 0);
    },
  );

  testWidgets(
    'not-found processReturn shows the error, keeps the dialog open, and never shows the legacy success copy',
    (tester) async {
      when(mockSaleViewModel.errorMessage)
          .thenReturn('Factura no encontrada: 001-001-01-00000001');
      when(mockSaleViewModel.processReturn(any, any)).thenAnswer(
        (_) async => false,
      );

      await pumpDetailScreen(tester);
      await tapProcess(tester);

      expect(find.text('Confirmar Devolución'), findsOneWidget);
      expect(find.text('Devolución de cliente'), findsOneWidget);
      expect(
        find.text('Factura no encontrada: 001-001-01-00000001'),
        findsOneWidget,
      );
      expect(find.textContaining('emitida correctamente'), findsNothing);
      expect(
        find.text('Nota de Crédito registrada. Pendiente de validación al sincronizar.'),
        findsNothing,
      );
      expect(fakeHistoryViewModel.loadInvoicesCalls, 0);
    },
  );

  testWidgets(
    'successful processReturn shows the pending-validation wording, closes the dialog, and never shows the legacy success copy',
    (tester) async {
      when(mockSaleViewModel.processReturn(any, any)).thenAnswer(
        (_) async => true,
      );

      await pumpDetailScreen(tester);
      await tapProcess(tester);

      // The note was registered locally only: the confirmation must claim
      // pending validation, never upstream acceptance.
      expect(
        find.text('Nota de Crédito registrada. Pendiente de validación al sincronizar.'),
        findsOneWidget,
      );
      // AC-13 regression guard: the old string asserting acceptance is gone.
      expect(find.textContaining('emitida correctamente'), findsNothing);
      expect(find.text('Confirmar Devolución'), findsNothing);
      expect(fakeHistoryViewModel.loadInvoicesCalls, 1);
    },
  );
}

class _FakeSalesHistoryViewModel extends ChangeNotifier
    implements SalesHistoryViewModel {
  _FakeSalesHistoryViewModel(this._testItems);

  final List<InvoiceItem> _testItems;
  int loadInvoicesCalls = 0;

  @override
  bool get isLoading => false;

  @override
  List<Invoice> get invoices => [];

  @override
  List<Invoice> get filteredInvoices => invoices;

  @override
  String get searchQuery => '';

  @override
  void setSearchQuery(String query) {}

  @override
  Future<void> loadInvoices() async {
    loadInvoicesCalls++;
  }

  @override
  Future<List<InvoiceItem>> getInvoiceItems(String invoiceId) async =>
      _testItems;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
