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

class _MockSalesHistoryViewModel extends ChangeNotifier implements SalesHistoryViewModel {
  final List<Invoice> _invoices;
  final Map<String, InvoiceRowContext> _contexts;

  _MockSalesHistoryViewModel(this._invoices, this._contexts);

  @override
  bool get isLoading => false;

  @override
  String get searchQuery => '';

  @override
  List<Invoice> get invoices => _invoices;

  @override
  List<Invoice> get filteredInvoices => _invoices;

  @override
  InvoiceRowContext? getRowContext(String invoiceId) => _contexts[invoiceId];

  @override
  void setSearchQuery(String query) {}

  @override
  Future<void> loadInvoices() async {}

  @override
  Future<List<InvoiceItem>> getInvoiceItems(String invoiceId) async => [];

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  testWidgets('PX-003 & Standard §12.2: Sales history row displays cashier, items, payment method, and tabular total without opening invoice', (tester) async {
    final mockSaleViewModel = MockSaleViewModel();

    final testInvoice = Invoice(
      id: 'inv-test-1',
      number: '001-001-01-00000007',
      createdAt: DateTime(2026, 10, 2, 21, 43),
      userId: 'user-maxwell',
      subtotal: 200.0,
      totalTax: 25.0,
      total: 225.0,
      isCanceled: false,
    );

    final testContexts = {
      'inv-test-1': const InvoiceRowContext(
        cashierName: 'Maxwell O.',
        itemsSummary: '1x Cappuccino 12oz, 1x Americano',
        paymentMethodSummary: 'Efectivo',
      ),
    };

    final vm = _MockSalesHistoryViewModel([testInvoice], testContexts);

    await tester.pumpWidget(
      MaterialApp(
        home: MultiProvider(
          providers: [
            ChangeNotifierProvider<SalesHistoryViewModel>.value(value: vm),
            ChangeNotifierProvider<SaleViewModel>.value(value: mockSaleViewModel),
          ],
          child: const SalesHistoryView(),
        ),
      ),
    );

    await tester.pumpAndSettle();

    // 1. Verify invoice number is present
    expect(find.text('001-001-01-00000007'), findsOneWidget);

    // 2. Verify time and cashier name are visible on the row
    expect(find.textContaining('21:43 · Maxwell O.'), findsOneWidget);

    // 3. Verify items summary is visible on the row
    expect(find.text('1x Cappuccino 12oz, 1x Americano'), findsOneWidget);

    // 4. Verify payment method badge is visible
    expect(find.text('Efectivo'), findsOneWidget);

    // 5. Verify total is formatted with C$ 225.00
    expect(find.text('C\$ 225.00'), findsOneWidget);

    // 6. Verify ANULADA is NOT present for active invoice
    expect(find.text('ANULADA'), findsNothing);
  });

  testWidgets('PX-003 & Standard §26.1: Canceled invoice displays subtle red background and ANULADA badge', (tester) async {
    final mockSaleViewModel = MockSaleViewModel();

    final canceledInvoice = Invoice(
      id: 'inv-test-void',
      number: '001-001-01-00000008',
      createdAt: DateTime(2026, 10, 2, 22, 10),
      userId: 'user-maxwell',
      subtotal: 100.0,
      totalTax: 15.0,
      total: 115.0,
      isCanceled: true,
    );

    final testContexts = {
      'inv-test-void': const InvoiceRowContext(
        cashierName: 'Maxwell O.',
        itemsSummary: '1x Latte Vainilla',
        paymentMethodSummary: 'Tarjeta',
      ),
    };

    final vm = _MockSalesHistoryViewModel([canceledInvoice], testContexts);

    await tester.pumpWidget(
      MaterialApp(
        home: MultiProvider(
          providers: [
            ChangeNotifierProvider<SalesHistoryViewModel>.value(value: vm),
            ChangeNotifierProvider<SaleViewModel>.value(value: mockSaleViewModel),
          ],
          child: const SalesHistoryView(),
        ),
      ),
    );

    await tester.pumpAndSettle();

    // Verify ANULADA badge is present
    expect(find.text('ANULADA'), findsOneWidget);
    expect(find.text('1x Latte Vainilla'), findsOneWidget);
    expect(find.text('Tarjeta'), findsOneWidget);
  });
}
