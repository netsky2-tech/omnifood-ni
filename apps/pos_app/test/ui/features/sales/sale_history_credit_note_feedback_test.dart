import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:provider/provider.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/presentation/features/sales/view_models/sales_history_view_model.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/ui/features/sales/sales_history_view.dart';
import 'sale_view_security_flows_test.mocks.dart';

/// D-14 / #553 Part 1: the POS no longer offers credit-note issuance. The
/// Backoffice (B1c-2) is the emitter for cross-day corrections; until DSI-6
/// re-enables POS-side issuance behind reauthentication evidence, the
/// affordance is ABSENT for every role — a hidden-by-role button would imply
/// some role may still use it, and a disabled never-enabling control would
/// be noise beside the real action (ANULAR).
///
/// AC-13 regression guard (from 6dcadf13, reworked as absence tests): no
/// credit-note affordance can show any success message — in particular the
/// legacy 'Nota de Crédito emitida correctamente' string asserted an
/// upstream acceptance the POS never observed. With no affordance, it can
/// never appear.
void main() {
  late MockSaleViewModel mockSaleViewModel;
  late _FakeSalesHistoryViewModel fakeHistoryViewModel;

  Invoice buildInvoice({bool isCanceled = false}) => Invoice(
        id: 'inv-1',
        number: '001-001-01-00000001',
        createdAt: DateTime(2026, 8, 27, 10, 30),
        userId: 'cashier-1',
        subtotal: 100.0,
        totalTax: 15.0,
        total: 115.0,
        isCanceled: isCanceled,
      );

  setUp(() {
    mockSaleViewModel = MockSaleViewModel();
    fakeHistoryViewModel = _FakeSalesHistoryViewModel(const []);
  });

  Future<void> pumpDetailScreen(
    WidgetTester tester, {
    UserRole role = UserRole.cashier,
    bool isCanceled = false,
  }) async {
    when(mockSaleViewModel.canVoidInvoice).thenReturn(role != UserRole.waiter);
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<SalesHistoryViewModel>.value(
            value: fakeHistoryViewModel,
          ),
          ChangeNotifierProvider<SaleViewModel>.value(value: mockSaleViewModel),
        ],
        child: MaterialApp(
          home: InvoiceDetailScreen(invoice: buildInvoice(isCanceled: isCanceled)),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  group('D-14: the credit-note action is absent for every role', () {
    for (final role in UserRole.values) {
      testWidgets('$role: no REALIZAR DEVOLUCIÓN affordance on the panel',
          (tester) async {
        await pumpDetailScreen(tester, role: role);

        expect(find.text('REALIZAR DEVOLUCIÓN'), findsNothing);
        expect(find.text('Confirmar Devolución'), findsNothing);
        // The dialog cannot be reached, so the view model's parked method is
        // never invoked from the widget tree.
        verifyNever(mockSaleViewModel.processReturn(any, any));
      });
    }

    testWidgets(
        'a canceled invoice shows no correction affordance either (AC-3)',
        (tester) async {
      await pumpDetailScreen(tester, role: UserRole.owner, isCanceled: true);

      expect(find.text('REALIZAR DEVOLUCIÓN'), findsNothing);
      expect(find.text('ANULAR FACTURA'), findsNothing);
      expect(find.text('ANULADA'), findsOneWidget);
      verifyNever(mockSaleViewModel.processReturn(any, any));
    });

    testWidgets('AC-13: no credit-note success copy can ever be shown',
        (tester) async {
      await pumpDetailScreen(tester, role: UserRole.owner);

      // No affordance exists, so no path can render a credit-note success
      // message — the legacy acceptance string least of all.
      expect(find.textContaining('Nota de Crédito'), findsNothing);
      expect(find.textContaining('emitida correctamente'), findsNothing);
      verifyNever(mockSaleViewModel.processReturn(any, any));
    });
  });
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
