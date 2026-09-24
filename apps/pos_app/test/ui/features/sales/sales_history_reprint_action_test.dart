import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/data/adapters/printer/mock_printer_adapter.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/daos/sales/cashier_session_dao.dart';
import 'package:pos_app/data/daos/sales/invoice_dao.dart';
import 'package:pos_app/data/daos/sales/invoice_item_dao.dart';
import 'package:pos_app/data/daos/sales/payment_dao.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/usecases/sales/void_decision.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/presentation/features/sales/view_models/sales_history_view_model.dart';
import 'package:pos_app/ui/features/sales/sales_history_view.dart';
import 'package:provider/provider.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/daos/local_config_dao.dart';

import 'sale_view_security_flows_test.mocks.dart';

/// B1r slice 2 (D-13, #547): the REIMPRIMIR surface. Per-permission
/// visibility (any invoice row, canceled included), reason dialog with the
/// controlled codes, print-honest SnackBards.
void main() {
  late MockSaleViewModel mockSaleViewModel;
  late _FakeSalesHistoryViewModel fakeHistoryViewModel;
  bool reprintAccepted = true;

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
    reprintAccepted = true;
    when(mockSaleViewModel.canReprint).thenReturn(true);
    when(mockSaleViewModel.reprintInvoice(any, any,
        reasonDetail: anyNamed('reasonDetail'))).thenAnswer((_) async {
      when(mockSaleViewModel.lastReprintPrintSucceeded).thenReturn(true);
      return reprintAccepted;
    });
  });

  Future<void> pumpPanel(
    WidgetTester tester, {
    bool isCanceled = false,
  }) async {
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<SalesHistoryViewModel>.value(
            value: fakeHistoryViewModel,
          ),
          ChangeNotifierProvider<SaleViewModel>.value(value: mockSaleViewModel),
        ],
        child: MaterialApp(
          home: InvoiceDetailScreen(
            invoice: buildInvoice(isCanceled: isCanceled),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  group('AC: REIMPRIMIR follows the reprint permission', () {
    for (final entry in {
      'OWNER': true,
      'MANAGER': true,
      'CASHIER': true,
      'WAITER': false,
    }.entries) {
      testWidgets('${entry.key}: enabled=${entry.value}', (tester) async {
        when(mockSaleViewModel.canReprint).thenReturn(entry.value);
        await pumpPanel(tester);

        final button = find.byKey(const Key('reprint_invoice_button'));
        expect(button, findsOneWidget);
        final outlined = tester.widget<OutlinedButton>(button);
        expect(outlined.onPressed, entry.value ? isNotNull : isNull);
      });
    }

    testWidgets('a canceled invoice still offers REIMPRIMIR (ANULADO + '
        'REIMPRESIÓN coexistence, #547)', (tester) async {
      await pumpPanel(tester, isCanceled: true);

      final button = find.byKey(const Key('reprint_invoice_button'));
      expect(button, findsOneWidget);
      expect(find.text('ANULADA'), findsOneWidget);
    });
  });

  group('reprint reason dialog', () {
    Future<void> openDialog(WidgetTester tester) async {
      await pumpPanel(tester);
      await tester.tap(find.byKey(const Key('reprint_invoice_button')));
      await tester.pumpAndSettle();
    }

    testWidgets('confirm is disabled until a code is selected', (tester) async {
      await openDialog(tester);

      final confirm = find.byKey(const Key('confirm_reprint_button'));
      expect(
        tester.widget<ElevatedButton>(confirm).onPressed,
        isNull,
        reason: 'no reason selected: the client-side mirror of the '
            'repository boundary keeps REIMPRIMIR disabled',
      );
      await tester.tap(find.text('Papel atascado'));
      await tester.pumpAndSettle();
      expect(
        tester.widget<ElevatedButton>(confirm).onPressed,
        isNotNull,
      );
      verifyNever(mockSaleViewModel.reprintInvoice(any, any,
          reasonDetail: anyNamed('reasonDetail')));
    });

    testWidgets(
        'confirm invokes the view model exactly once with code + detail',
        (tester) async {
      await openDialog(tester);
      await tester.tap(find.text('Verificación'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextField, 'Detalle (opcional)'),
        'Copia para el contador',
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('confirm_reprint_button')));
      await tester.pumpAndSettle();

      verify(mockSaleViewModel.reprintInvoice(
        'inv-1',
        'VERIFICACION',
        reasonDetail: 'Copia para el contador',
      )).called(1);
    });

    testWidgets('success closes the dialog and claims the print honestly',
        (tester) async {
      await openDialog(tester);
      await tester.tap(find.text('El cliente perdió su ticket'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('confirm_reprint_button')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('confirm_reprint_button')), findsNothing,
          reason: 'the dialog closed on success');
      expect(
        find.text('Comprobante REIMPRESIÓN impreso.'),
        findsOneWidget,
      );
    });

    testWidgets('print failure claims the print honestly', (tester) async {
      when(mockSaleViewModel.reprintInvoice(any, any,
          reasonDetail: anyNamed('reasonDetail'))).thenAnswer((_) async {
        when(mockSaleViewModel.lastReprintPrintSucceeded).thenReturn(false);
        return true;
      });
      await openDialog(tester);
      await tester.tap(find.text('Otro'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('confirm_reprint_button')));
      await tester.pumpAndSettle();

      expect(
        find.text('Comprobante REIMPRESIÓN no pudo imprimirse.'),
        findsOneWidget,
      );
      expect(
        find.text('Comprobante REIMPRESIÓN impreso.'),
        findsNothing,
      );
    });

    testWidgets('denial keeps the dialog open with the reason preserved',
        (tester) async {
      // The VM never throws: the engine denial surfaces as false + the
      // specific Spanish message (the widget contract under test).
      when(mockSaleViewModel.reprintInvoice(any, any,
              reasonDetail: anyNamed('reasonDetail')))
          .thenAnswer((_) async => false);
      when(mockSaleViewModel.errorMessage)
          .thenReturn(reprintSnapshotUnavailableMessage);
      await openDialog(tester);
      await tester.tap(find.text('Otro'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('confirm_reprint_button')));
      await tester.pumpAndSettle();

      // Dialog stays open; the actionable Spanish message is shown.
      expect(find.byKey(const Key('confirm_reprint_button')), findsOneWidget);
      expect(
        find.text(reprintSnapshotUnavailableMessage),
        findsOneWidget,
      );
      expect(
        tester
            .widget<RadioListTile<String>>(
              find.ancestor(
                of: find.text('Otro'),
                matching: find.byType(RadioListTile<String>),
              ),
            )
            .groupValue,
        'OTRO',
        reason: 'the typed selection is preserved on denial',
      );
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
