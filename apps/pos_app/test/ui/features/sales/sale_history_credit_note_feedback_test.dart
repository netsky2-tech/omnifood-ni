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

/// H5 (batch 8 slice 8a): the credit-note affordance is RESTORED on the
/// invoice detail screen, visible ONLY to the roles that can issue a note
/// (owner/manager — mirroring the hard gate inside processReturn, which
/// stays as defense-in-depth). The AC-13 honesty rule from 6dcadf13 is
/// preserved: the success copy never claims upstream acceptance and now
/// splits issuance from print outcome — the POS can only honestly claim a
/// LOCAL issuance plus the observed print result (H8).
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
    when(mockSaleViewModel.canReprint).thenReturn(role != UserRole.waiter);
    when(mockSaleViewModel.canIssueCreditNote)
        .thenReturn(role == UserRole.owner || role == UserRole.manager);
    when(mockSaleViewModel.companyTaxRegime).thenReturn(null);
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

  group('H5: the credit-note affordance is role-gated (owner/manager only)', () {
    testWidgets('owner sees EMITIR NOTA DE CRÉDITO on an active regular sale',
        (tester) async {
      await pumpDetailScreen(tester, role: UserRole.owner);

      expect(find.byKey(const Key('credit_note_button')), findsOneWidget);
      expect(find.text('EMITIR NOTA DE CRÉDITO'), findsOneWidget);
    });

    testWidgets('manager sees EMITIR NOTA DE CRÉDITO on an active regular sale',
        (tester) async {
      await pumpDetailScreen(tester, role: UserRole.manager);

      expect(find.byKey(const Key('credit_note_button')), findsOneWidget);
    });

    for (final role in [UserRole.cashier, UserRole.waiter]) {
      testWidgets('$role: no credit-note affordance on the panel',
          (tester) async {
        await pumpDetailScreen(tester, role: role);

        expect(find.byKey(const Key('credit_note_button')), findsNothing);
        expect(find.text('EMITIR NOTA DE CRÉDITO'), findsNothing);
        // The dialog cannot be reached, so the guarded method is never
        // invoked from the widget tree.
        verifyNever(mockSaleViewModel.processReturn(any, any));
      });
    }

    testWidgets(
        'a canceled invoice shows no credit-note affordance either (AC-3)',
        (tester) async {
      await pumpDetailScreen(tester, role: UserRole.owner, isCanceled: true);

      expect(find.byKey(const Key('credit_note_button')), findsNothing);
      expect(find.byKey(const Key('void_invoice_button')), findsNothing);
      expect(find.text('ANULADA'), findsOneWidget);
      verifyNever(mockSaleViewModel.processReturn(any, any));
    });
  });

  group('H5: the credit-note confirmation dialog (NHILOS §23)', () {
    testWidgets('states object, scope and permanent consequence; the reason '
        'is mandatory before the explicit verb enables', (tester) async {
      await pumpDetailScreen(tester, role: UserRole.owner);

      await tester.tap(find.byKey(const Key('credit_note_button')));
      await tester.pumpAndSettle();

      // §23.1: object (origin invoice number), scope, consequence,
      // irreversibility.
      expect(find.text('Factura afectada: 001-001-01-00000001'),
          findsOneWidget);
      expect(find.textContaining('todos los artículos'), findsOneWidget);
      expect(find.textContaining('permanente'), findsOneWidget);

      // §23.3: the confirm button is the explicit verb, disabled until the
      // mandatory reason is typed (the reason is persisted audit metadata —
      // no fabricated default).
      final confirmButton = tester.widget<ElevatedButton>(
        find.byKey(const Key('confirm_credit_note_button')),
      );
      expect(confirmButton.onPressed, isNull);

      await tester.enterText(
        find.byKey(const Key('credit_note_reason_field')),
        'Cliente desiste de la compra',
      );
      await tester.pumpAndSettle();

      final enabledButton = tester.widget<ElevatedButton>(
        find.byKey(const Key('confirm_credit_note_button')),
      );
      expect(enabledButton.onPressed, isNotNull);
    });

    testWidgets('invokes processReturn with the invoice number and the typed '
        'reason, then claims issuance and print separately', (tester) async {
      await pumpDetailScreen(tester, role: UserRole.owner);
      when(mockSaleViewModel.processReturn(any, any))
          .thenAnswer((_) async => 'cn-1');
      when(mockSaleViewModel.lastCreditNotePrintSucceeded).thenReturn(true);

      await tester.tap(find.byKey(const Key('credit_note_button')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const Key('credit_note_reason_field')),
        'Cliente desiste de la compra',
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('confirm_credit_note_button')));
      await tester.pumpAndSettle();

      verify(mockSaleViewModel.processReturn(
        '001-001-01-00000001',
        'Cliente desiste de la compra',
      )).called(1);
      // §19.2/§31 + H8 honesty split: LOCAL issuance claimed, print observed.
      expect(find.text('Nota de crédito emitida. Copia fiscal impresa.'),
          findsOneWidget);
      expect(find.textContaining('emitida correctamente'), findsNothing);
      // The list reloads: a credit note is a new fiscal document.
      expect(fakeHistoryViewModel.loadInvoicesCalls, 1);
    });

    testWidgets('a print failure never retracts the issuance (§30 honesty)',
        (tester) async {
      await pumpDetailScreen(tester, role: UserRole.owner);
      when(mockSaleViewModel.processReturn(any, any))
          .thenAnswer((_) async => 'cn-1');
      when(mockSaleViewModel.lastCreditNotePrintSucceeded).thenReturn(false);

      await tester.tap(find.byKey(const Key('credit_note_button')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const Key('credit_note_reason_field')),
        'Producto defectuoso',
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('confirm_credit_note_button')));
      await tester.pumpAndSettle();

      expect(find.textContaining('Nota de crédito emitida'), findsOneWidget);
      expect(find.textContaining('No se pudo imprimir la copia fiscal'),
          findsOneWidget);
      expect(fakeHistoryViewModel.loadInvoicesCalls, 1);
    });

    testWidgets('a denial keeps the dialog open and surfaces the guard copy',
        (tester) async {
      await pumpDetailScreen(tester, role: UserRole.owner);
      when(mockSaleViewModel.processReturn(any, any))
          .thenAnswer((_) async => null);
      when(mockSaleViewModel.errorMessage).thenReturn('Acceso denegado.');

      await tester.tap(find.byKey(const Key('credit_note_button')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const Key('credit_note_reason_field')),
        'Producto defectuoso',
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('confirm_credit_note_button')));
      await tester.pumpAndSettle();

      // The dialog stays open (nothing was issued) and the specific guard
      // message is surfaced.
      expect(find.byKey(const Key('confirm_credit_note_button')),
          findsOneWidget);
      expect(find.text('Acceso denegado.'), findsOneWidget);
      expect(fakeHistoryViewModel.loadInvoicesCalls, 0);
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
