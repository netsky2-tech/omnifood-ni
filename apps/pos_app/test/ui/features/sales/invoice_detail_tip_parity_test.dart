import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/services/printer/receipt_layout_formatter.dart';
import 'package:pos_app/domain/models/printer/receipt_document.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/presentation/features/sales/view_models/sales_history_view_model.dart';
import 'package:pos_app/ui/features/sales/sales_history_view.dart';
import 'package:provider/provider.dart';

import 'sale_view_security_flows_test.mocks.dart';

Invoice _invoice({double? tip}) => Invoice(
      id: 'inv-tip',
      number: '001-001-01-00000042',
      createdAt: DateTime(2026, 10, 22, 20, 15),
      userId: 'u-1',
      subtotal: 250,
      totalTax: 37.5,
      total: 287.5,
      paymentStatus: PaymentStatus.paid,
      syncStatus: SyncStatus.synced,
      tipAmountNio: tip,
      tipPercentage: tip == null ? null : 10,
    );

const _items = [
  InvoiceItem(
    id: 'item-1',
    invoiceId: 'inv-tip',
    productId: 'p-1',
    productName: 'Smash Burger Doble',
    quantity: 2,
    unitPrice: 125,
    originalTaxRate: 15,
    appliedTaxRate: 15,
    taxAmount: 37.5,
    total: 287.5,
  ),
];

/// NHILOS §24.2: screen detail and paper must show the same amounts, labels
/// and order. The receipt keeps the tip OUTSIDE the taxable total; the detail
/// therefore prints TOTAL CORDOBAS → PROPINA → TOTAL A PAGAR.
void main() {
  late MockSaleViewModel saleViewModel;

  setUp(() {
    saleViewModel = MockSaleViewModel();
    when(saleViewModel.companyTaxRegime).thenReturn(TaxRegime.regimenGeneral);
  });

  Future<void> pumpDetail(WidgetTester tester, Invoice invoice) async {
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<SalesHistoryViewModel>.value(
            value: _FakeHistory(),
          ),
          ChangeNotifierProvider<SaleViewModel>.value(value: saleViewModel),
        ],
        child: MaterialApp(
          home: Scaffold(body: InvoiceDetailsPanel(invoice: invoice)),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('a tipped sale shows the fiscal total, the tip and TOTAL A PAGAR',
      (tester) async {
    tester.view.physicalSize = const Size(1200, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await pumpDetail(tester, _invoice(tip: 28.75));

    expect(find.text('TOTAL CORDOBAS:'), findsOneWidget);
    expect(find.text('C\$ 287.50'), findsWidgets);
    expect(find.text('Propina:'), findsOneWidget);
    expect(find.text('C\$ 28.75'), findsOneWidget);
    expect(find.text('TOTAL A PAGAR:'), findsOneWidget);
    expect(find.text('C\$ 316.25'), findsOneWidget);
    expect(find.text('TOTAL:'), findsNothing);
  });

  testWidgets('the detail amounts equal the printed receipt amounts',
      (tester) async {
    tester.view.physicalSize = const Size(1200, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    final invoice = _invoice(tip: 28.75);
    await pumpDetail(tester, invoice);

    final paper = ReceiptLayoutFormatter.format80mm().formatReceiptDocumentText(
      ReceiptDocument.fromInvoice(
        invoice,
        items: _items,
        payments: const [],
        taxRegime: TaxRegime.regimenGeneral,
      ),
    );

    expect(paper, contains('TOTAL CORDOBAS:'));
    expect(paper, contains('C\$ 287.50'));
    expect(paper, contains('PROPINA (10%):'));
    expect(paper, contains('C\$ 28.75'));
    expect(paper, contains('TOTAL A PAGAR:'));
    expect(paper, contains('C\$ 316.25'));
  });

  testWidgets('an assigned Caja is shown exactly as the paper prints it',
      (tester) async {
    tester.view.physicalSize = const Size(1200, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    when(saleViewModel.terminalCajaLabel).thenReturn('BARRA');

    await pumpDetail(tester, _invoice());

    expect(find.text('Caja: BARRA'), findsOneWidget);
  });

  testWidgets('an unassigned Caja renders no line at all', (tester) async {
    tester.view.physicalSize = const Size(1200, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    when(saleViewModel.terminalCajaLabel).thenReturn(null);

    await pumpDetail(tester, _invoice());

    expect(find.textContaining('Caja:'), findsNothing);
  });

  testWidgets('a sale without tip keeps the single TOTAL line',
      (tester) async {
    tester.view.physicalSize = const Size(1200, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await pumpDetail(tester, _invoice());

    expect(find.text('TOTAL:'), findsOneWidget);
    expect(find.text('C\$ 287.50'), findsWidgets);
    expect(find.text('TOTAL A PAGAR:'), findsNothing);
    expect(find.text('Propina:'), findsNothing);
  });
}

class _FakeHistory extends ChangeNotifier implements SalesHistoryViewModel {
  @override
  bool get isLoading => false;

  @override
  List<Invoice> get invoices => const [];

  @override
  List<Invoice> get filteredInvoices => invoices;

  @override
  String get searchQuery => '';

  @override
  void setSearchQuery(String query) {}

  @override
  Future<void> loadInvoices() async {}

  @override
  Future<List<InvoiceItem>> getInvoiceItems(String invoiceId) async => _items;

  @override
  String userNameFor(String? userId) => 'Operador';

  @override
  Invoice? invoiceById(String id) => null;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
