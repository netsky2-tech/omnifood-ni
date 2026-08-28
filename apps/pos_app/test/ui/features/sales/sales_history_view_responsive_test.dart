import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/presentation/features/sales/view_models/sales_history_view_model.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/ui/features/sales/sales_history_view.dart';
import 'sale_view_security_flows_test.mocks.dart';

class _FakeSalesHistoryViewModel extends ChangeNotifier implements SalesHistoryViewModel {
  final List<Invoice> _testInvoices;
  final List<InvoiceItem> _testItems;

  _FakeSalesHistoryViewModel(this._testInvoices, this._testItems);

  String _searchQuery = '';
  @override
  String get searchQuery => _searchQuery;

  @override
  bool get isLoading => false;

  @override
  List<Invoice> get invoices => _testInvoices;

  @override
  List<Invoice> get filteredInvoices {
    if (_searchQuery.isEmpty) return _testInvoices;
    return _testInvoices.where((i) => i.number.toLowerCase().contains(_searchQuery.toLowerCase())).toList();
  }

  @override
  void setSearchQuery(String query) {
    _searchQuery = query;
    notifyListeners();
  }

  @override
  Future<void> loadInvoices() async {}

  @override
  Future<List<InvoiceItem>> getInvoiceItems(String invoiceId) async => _testItems;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  late MockSaleViewModel mockSaleViewModel;

  final sampleInvoices = [
    Invoice(
      id: 'inv-1',
      number: '001-001-01-00000001',
      createdAt: DateTime(2026, 8, 27, 10, 30),
      userId: 'cashier-1',
      subtotal: 100.0,
      totalTax: 15.0,
      total: 115.0,
      isCanceled: false,
    ),
    Invoice(
      id: 'inv-2',
      number: '001-001-01-00000002',
      createdAt: DateTime(2026, 8, 27, 11, 0),
      userId: 'cashier-1',
      subtotal: 50.0,
      totalTax: 7.5,
      total: 57.5,
      isCanceled: true,
    ),
  ];

  final List<InvoiceItem> sampleItems = [
    const InvoiceItem(
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
    ),
  ];

  setUp(() {
    mockSaleViewModel = MockSaleViewModel();
  });

  Widget buildTestWidget(SalesHistoryViewModel vm) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider<SalesHistoryViewModel>.value(value: vm),
        ChangeNotifierProvider<SaleViewModel>.value(value: mockSaleViewModel),
      ],
      child: const MaterialApp(
        home: SalesHistoryView(),
      ),
    );
  }

  group('SalesHistoryView Responsive Layout', () {
    testWidgets('renders master-detail split on desktop (> 600dp)', (tester) async {
      tester.view.physicalSize = const Size(1280, 800);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      final vm = _FakeSalesHistoryViewModel(sampleInvoices, sampleItems);
      await tester.pumpWidget(buildTestWidget(vm));
      await tester.pumpAndSettle();

      expect(find.text('001-001-01-00000001'), findsOneWidget);
      expect(find.text('001-001-01-00000002'), findsOneWidget);
      expect(find.text('ANULADA'), findsOneWidget);

      // Initial state shows empty prompt in right pane
      expect(find.text('Seleccione una factura'), findsOneWidget);

      // Tap an invoice to display detail in right pane
      await tester.tap(find.text('001-001-01-00000001'));
      await tester.pumpAndSettle();

      expect(find.text('Factura: 001-001-01-00000001'), findsOneWidget);
      expect(find.text('Café Espresso'), findsOneWidget);
      expect(find.text('REALIZAR DEVOLUCIÓN'), findsOneWidget);
    });

    testWidgets('renders single column and navigates to detail page on Sunmi V2s handheld (360x720dp)', (tester) async {
      tester.view.physicalSize = const Size(360, 720);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      final vm = _FakeSalesHistoryViewModel(sampleInvoices, sampleItems);
      await tester.pumpWidget(buildTestWidget(vm));
      await tester.pumpAndSettle();

      // List is displayed
      expect(find.text('001-001-01-00000001'), findsOneWidget);
      expect(find.text('001-001-01-00000002'), findsOneWidget);

      // Tap to open full page detail
      await tester.tap(find.text('001-001-01-00000001'));
      await tester.pumpAndSettle();

      expect(find.text('Factura: 001-001-01-00000001'), findsOneWidget);
      expect(find.text('Café Espresso'), findsOneWidget);
      expect(find.text('REALIZAR DEVOLUCIÓN'), findsOneWidget);

      // Back navigation
      await tester.tap(find.byType(BackButton));
      await tester.pumpAndSettle();

      expect(find.text('Historial de Ventas'), findsOneWidget);
    });
  });
}
