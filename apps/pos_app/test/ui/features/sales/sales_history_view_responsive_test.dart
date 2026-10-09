import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/intl.dart';
import 'package:mockito/mockito.dart';
import 'package:provider/provider.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/presentation/features/sales/view_models/sales_history_view_model.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/ui/features/sales/sales_history_view.dart';
import 'sale_view_security_flows_test.mocks.dart';

class _FakeSalesHistoryViewModel extends ChangeNotifier implements SalesHistoryViewModel {
  final List<Invoice> _testInvoices;
  final List<InvoiceItem> _testItems;
  final Map<String, String> _userNames;
  final String? _loadErrorMessage;
  final int _rowContextFailureCount;
  int _visibleCount;

  _FakeSalesHistoryViewModel(this._testInvoices, this._testItems,
      {Map<String, String> userNames = const {},
      String? loadErrorMessage,
      int rowContextFailureCount = 0,
      int? visibleLimit})
      : _userNames = userNames,
        _loadErrorMessage = loadErrorMessage,
        _rowContextFailureCount = rowContextFailureCount,
        _visibleCount = visibleLimit ?? SalesHistoryViewModel.pageSize;

  String _searchQuery = '';
  @override
  String get searchQuery => _searchQuery;

  /// S3b: honest failure signal, mirrored from the real view model.
  @override
  bool get hasLoadError => _loadErrorMessage != null;

  @override
  String? get loadErrorMessage => _loadErrorMessage;

  @override
  int get rowContextFailureCount => _rowContextFailureCount;

  @override
  bool get isLoading => false;

  @override
  List<Invoice> get invoices => _testInvoices;

  @override
  List<Invoice> get filteredInvoices {
    Iterable<Invoice> result = _testInvoices;
    if (_filterDateFrom != null || _filterDateTo != null) {
      result = result.where(_isWithinDateRange);
    }
    if (_searchQuery.isNotEmpty) {
      result = result.where(
          (i) => i.number.toLowerCase().contains(_searchQuery.toLowerCase()));
    }
    return result.toList();
  }

  DateTime? _filterDateFrom;
  DateTime? _filterDateTo;

  bool _isWithinDateRange(Invoice invoice) {
    final day = DateTime(invoice.createdAt.year, invoice.createdAt.month,
        invoice.createdAt.day);
    final from = _filterDateFrom;
    if (from != null &&
        day.isBefore(DateTime(from.year, from.month, from.day))) {
      return false;
    }
    final to = _filterDateTo;
    if (to != null && day.isAfter(DateTime(to.year, to.month, to.day))) {
      return false;
    }
    return true;
  }

  @override
  DateTime? get filterDateFrom => _filterDateFrom;

  @override
  DateTime? get filterDateTo => _filterDateTo;

  @override
  void setDateRange(DateTime? from, DateTime? to) {
    _filterDateFrom = from;
    _filterDateTo = to;
    _visibleCount = SalesHistoryViewModel.pageSize;
    notifyListeners();
  }

  @override
  void clearDateRange() => setDateRange(null, null);

  /// S3b: mirrors the windowing contract — only [visibleInvoices] is what
  /// the list renders; totals stay over the FULL filtered set.
  @override
  List<Invoice> get visibleInvoices =>
      filteredInvoices.take(_visibleCount).toList(growable: false);

  @override
  bool get hasMoreVisibleInvoices => filteredInvoices.length > _visibleCount;

  @override
  void revealMoreVisible() {
    _visibleCount += SalesHistoryViewModel.pageSize;
    notifyListeners();
  }

  /// S3b: money excludes cancelled invoices (same fiscal rule as the real
  /// view model) so the totals-row test observes the real contract.
  @override
  SalesHistoryTotals get filteredTotals {
    var count = 0;
    var cancelled = 0;
    var subtotal = 0.0;
    var tax = 0.0;
    var total = 0.0;
    for (final invoice in filteredInvoices) {
      count++;
      if (invoice.isCanceled) {
        cancelled++;
        continue;
      }
      subtotal += invoice.subtotal;
      tax += invoice.totalTax;
      total += invoice.total;
    }
    return SalesHistoryTotals(
      invoiceCount: count,
      cancelledCount: cancelled,
      subtotalSum: subtotal,
      taxSum: tax,
      totalSum: total,
    );
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

  /// D-12: the detail screen re-reads the freshest snapshot via this member.
  @override
  Invoice? invoiceById(String id) {
    for (final invoice in _testInvoices) {
      if (invoice.id == id) return invoice;
    }
    return null;
  }

  /// D-14: mirrors the real view model's contract — resolves a stored user
  /// id to a person's name or the honest fallback, never the raw id.
  @override
  String userNameFor(String? userId) =>
      (userId != null && userId.isNotEmpty ? _userNames[userId] : null) ??
      'Operador no disponible';

  @override
  InvoiceRowContext? getRowContext(String invoiceId) => null;

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
      // D-14/#553: no credit-note affordance in the POS.
      expect(find.text('REALIZAR DEVOLUCIÓN'), findsNothing);
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
      // D-14/#553: no credit-note affordance in the POS.
      expect(find.text('REALIZAR DEVOLUCIÓN'), findsNothing);

      // Back navigation
      await tester.tap(find.byType(BackButton));
      await tester.pumpAndSettle();

      expect(find.text('Historial de Ventas'), findsOneWidget);
    });
  });

  group('SalesHistoryView operator attribution (D-14)', () {
    testWidgets('invoice detail shows the resolved operator name and never a raw user id',
        (tester) async {
      tester.view.physicalSize = const Size(360, 720);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      final vm = _FakeSalesHistoryViewModel(
        sampleInvoices,
        sampleItems,
        userNames: {'cashier-1': 'Ana Pérez'},
      );
      await tester.pumpWidget(buildTestWidget(vm));
      await tester.pumpAndSettle();

      await tester.tap(find.text('001-001-01-00000001'));
      await tester.pumpAndSettle();

      expect(find.text('Usuario: Ana Pérez'), findsOneWidget);
      // The operator's rule: never a device-observed UUID where a person's
      // name belongs.
      expect(
        find.textContaining(
            RegExp('[0-9a-f]{8}-[0-9a-f]{4}', caseSensitive: false)),
        findsNothing,
      );
      expect(find.textContaining('cashier-1'), findsNothing);
    });

    testWidgets('invoice detail shows the honest fallback when the user cannot be resolved',
        (tester) async {
      tester.view.physicalSize = const Size(360, 720);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      final vm = _FakeSalesHistoryViewModel(sampleInvoices, sampleItems);
      await tester.pumpWidget(buildTestWidget(vm));
      await tester.pumpAndSettle();

      await tester.tap(find.text('001-001-01-00000001'));
      await tester.pumpAndSettle();

      expect(find.text('Usuario: Operador no disponible'), findsOneWidget);
      expect(find.textContaining('cashier-1'), findsNothing);
    });
  });

  group('SalesHistoryView regime-aware IVA row (D-3)', () {
    testWidgets('omits the IVA row for CUOTA_FIJA tenants', (tester) async {
      tester.view.physicalSize = const Size(1280, 800);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      when(mockSaleViewModel.companyTaxRegime).thenReturn(TaxRegime.cuotaFija);
      when(mockSaleViewModel.canReprint).thenReturn(true);

      final vm = _FakeSalesHistoryViewModel(sampleInvoices, sampleItems);
      await tester.pumpWidget(buildTestWidget(vm));
      await tester.pumpAndSettle();

      await tester.tap(find.text('001-001-01-00000001'));
      await tester.pumpAndSettle();

      expect(find.text('Factura: 001-001-01-00000001'), findsOneWidget);
      expect(find.text('IVA:'), findsNothing);
      expect(find.text('IVA (15%):'), findsNothing);
    });

    testWidgets('shows a plain IVA label (no percentage literal) for REGIMEN_GENERAL tenants', (tester) async {
      tester.view.physicalSize = const Size(1280, 800);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      when(mockSaleViewModel.companyTaxRegime).thenReturn(TaxRegime.regimenGeneral);
      when(mockSaleViewModel.canReprint).thenReturn(true);

      final vm = _FakeSalesHistoryViewModel(sampleInvoices, sampleItems);
      await tester.pumpWidget(buildTestWidget(vm));
      await tester.pumpAndSettle();

      await tester.tap(find.text('001-001-01-00000001'));
      await tester.pumpAndSettle();

      expect(find.text('Factura: 001-001-01-00000001'), findsOneWidget);
      expect(find.text('IVA:'), findsOneWidget);
      expect(find.text('IVA (15%):'), findsNothing);
    });
  });

  // S3b: honest operational surfaces — failed read vs genuine empty,
  // filtered totals (cancelled NEVER in the money), the display window
  // ("ver más"), and the date-range filter with an unfiltered default.
  group('S3b honest surfaces', () {
    testWidgets('a FAILED READ renders the honest error and never the empty state',
        (tester) async {
      tester.view.physicalSize = const Size(360, 720);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      final vm = _FakeSalesHistoryViewModel(const [], const [],
          loadErrorMessage: SalesHistoryViewModel.loadFailureMessage);
      await tester.pumpWidget(buildTestWidget(vm));
      await tester.pumpAndSettle();

      // The defect under test: a failed invoice read must never look like
      // a quiet day.
      expect(
        find.text(SalesHistoryViewModel.loadFailureMessage),
        findsOneWidget,
      );
      expect(
        find.byKey(const Key('sales_history_load_error_banner')),
        findsOneWidget,
      );
      expect(find.byKey(const Key('sales_history_retry_button')),
          findsOneWidget);
      expect(find.text('Sin facturas encontradas'), findsNothing);
      expect(
        find.text('No hay facturas que coincidan con la búsqueda.'),
        findsNothing,
      );
    });

    testWidgets(
        'the totals row renders and a CANCELLED invoice does not inflate the money',
        (tester) async {
      tester.view.physicalSize = const Size(360, 720);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      // sampleInvoices: inv-1 active (100.00 / 15.00 / 115.00) and inv-2
      // cancelled (50.00 / 7.50 / 57.50).
      final vm = _FakeSalesHistoryViewModel(sampleInvoices, sampleItems);
      await tester.pumpWidget(buildTestWidget(vm));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('sales_history_totals_row')),
          findsOneWidget);
      expect(find.text('Facturas: 2'), findsOneWidget);
      expect(find.text('Subtotal: C\$ 100.00'), findsOneWidget);
      expect(find.text('IVA: C\$ 15.00'), findsOneWidget);
      expect(find.text('Total: C\$ 115.00'), findsOneWidget);
      // The cancelled count is separate and explicitly labelled as NOT
      // part of the money.
      expect(find.text('Anuladas: 1 (excluidas del dinero)'), findsOneWidget);
      // Neither the combined total (172.50) nor any other sum that would
      // include the cancelled invoice may appear.
      expect(find.textContaining('172.50'), findsNothing);
      expect(find.textContaining('22.50'), findsNothing);
    });

    testWidgets(
        'the "ver más" affordance appears past the display window and reveals more',
        (tester) async {
      tester.view.physicalSize = const Size(800, 7000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      final invoices = List.generate(
        60,
        (i) => Invoice(
          id: 'inv-$i',
          number: '00-00-00-${(i + 1).toString().padLeft(8, '0')}',
          createdAt: DateTime(2026, 8, 27, 10, i % 60),
          userId: 'c1',
          subtotal: 10,
          totalTax: 0,
          total: 10,
          isCanceled: false,
        ),
      );
      final vm = _FakeSalesHistoryViewModel(invoices, const []);
      await tester.pumpWidget(buildTestWidget(vm));
      await tester.pumpAndSettle();

      // Windowed: only the first 50 rows are rendered.
      expect(find.text('00-00-00-00000050'), findsOneWidget);
      expect(find.text('00-00-00-00000051'), findsNothing);
      expect(find.byKey(const Key('sales_history_reveal_more_button')),
          findsOneWidget);
      // Totals are over the FULL filtered set, never the window.
      expect(find.text('Facturas: 60'), findsOneWidget);

      await tester.tap(find.byKey(const Key('sales_history_reveal_more_button')));
      await tester.pumpAndSettle();

      expect(find.text('00-00-00-00000051'), findsOneWidget);
      expect(find.text('00-00-00-00000060'), findsOneWidget);
      expect(find.byKey(const Key('sales_history_reveal_more_button')),
          findsNothing);
    });

    testWidgets(
        'a degraded row-context read surfaces an honest count, not silence',
        (tester) async {
      tester.view.physicalSize = const Size(360, 720);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      final vm = _FakeSalesHistoryViewModel(
        sampleInvoices,
        sampleItems,
        rowContextFailureCount: 2,
      );
      await tester.pumpWidget(buildTestWidget(vm));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('sales_history_row_context_notice')),
          findsOneWidget);
      expect(
        find.text(
            '2 filas no pudieron mostrar su detalle (artículos y forma de pago).'),
        findsOneWidget,
      );
      // The rows themselves are still rendered — degraded, not hidden.
      expect(find.text('001-001-01-00000001'), findsOneWidget);
    });

    testWidgets(
        'the date control applies a range and the default stays UNFILTERED',
        (tester) async {
      tester.view.physicalSize = const Size(360, 720);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      final now = DateTime.now();
      final today = DateTime(now.year, now.month, now.day);
      final yesterday = today.subtract(const Duration(days: 1));
      final todayInvoice = Invoice(
        id: 'inv-today',
        number: '00-00-00-00001111',
        createdAt: today.add(const Duration(hours: 10)),
        userId: 'c1',
        subtotal: 10,
        totalTax: 0,
        total: 10,
        isCanceled: false,
      );
      final yesterdayInvoice = Invoice(
        id: 'inv-yesterday',
        number: '00-00-00-00002222',
        createdAt: yesterday.add(const Duration(hours: 10)),
        userId: 'c1',
        subtotal: 10,
        totalTax: 0,
        total: 10,
        isCanceled: false,
      );
      final vm = _FakeSalesHistoryViewModel(
          [todayInvoice, yesterdayInvoice], const []);
      await tester.pumpWidget(buildTestWidget(vm));
      await tester.pumpAndSettle();

      // Default on open: NO filter — the operator still sees everything.
      expect(find.text('Sin filtro de fecha'), findsOneWidget);
      expect(find.text('00-00-00-00001111'), findsOneWidget);
      expect(find.text('00-00-00-00002222'), findsOneWidget);

      await tester.tap(
          find.byKey(const Key('sales_history_date_filter_today')));
      await tester.pumpAndSettle();

      // The active range is shown and the list narrows to the fiscal day.
      final label = DateFormat('dd/MM/yyyy').format(today);
      expect(find.text('Filtro: $label'), findsOneWidget);
      expect(find.text('00-00-00-00001111'), findsOneWidget);
      expect(find.text('00-00-00-00002222'), findsNothing);

      await tester.tap(
          find.byKey(const Key('sales_history_date_filter_clear')));
      await tester.pumpAndSettle();

      // Clearing restores the unfiltered view.
      expect(find.text('Sin filtro de fecha'), findsOneWidget);
      expect(find.text('00-00-00-00002222'), findsOneWidget);
    });
  });
}
