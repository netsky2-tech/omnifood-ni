import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/data/models/sales/payment_entity.dart';
import 'package:pos_app/ui/features/cash/cash_shift_view_model.dart';
import 'package:pos_app/ui/features/cash/card_voucher_reconciliation_view_model.dart';
import 'package:pos_app/ui/features/cash/widgets/close_shift_dialog.dart';
import 'package:provider/provider.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// Issue #74: reconciling (or overriding) vouchers ONE BY ONE inside the
/// reconciliation dialog must refresh the parent CashShiftViewModel's
/// pending-voucher count WHILE the dialog stays open — the badge, the
/// 'Vouchers (n)' label and the Corte Z fiscal gate must not wait for the
/// dialog to be dismissed.
///
/// NOTE on sqflite_ffi + flutter_test: Floor's async work never completes in
/// the fake-async widget zone. setUp (real async) may build/seed the
/// database, but any DB chain started inside the test body (the dialog's
/// create-time load, button handlers) must be started inside
/// [tester.runAsync], then frames are settled outside it.
void main() {
  late AppDatabase database;
  late CashShiftViewModel parentVm;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();

    await database.invoiceDao.insertInvoice(
      InvoiceEntity(
        id: 'inv-parent-01',
        number: '001-001-01-00000111',
        createdAt: DateTime.now().millisecondsSinceEpoch,
        userId: 'cajero-01',
        subtotal: 800.0,
        totalTax: 120.0,
        total: 920.0,
        isCanceled: false,
        syncStatus: 'pending',
        paymentStatus: 'paid',
        type: 'regular',
        terminalId: 'pos-01',
        sourceSequence: 1,
        idempotencyKey: 'idemp-parent-1',
        payloadHash: 'hash-parent-1',
        bcnOfficialRate: 36.6241,
        commercialRate: 36.50,
        totalUsd: 25.21,
      ),
    );

    final now = DateTime.now().millisecondsSinceEpoch;
    await database.paymentDao.insertPayments([
      PaymentEntity(
        id: 'pay-pr-1',
        invoiceId: 'inv-parent-01',
        method: 'card',
        amount: 400.0,
        amountNio: 400.0,
        voucherCode: 'PENDIENTE',
        reconciliationStatus: 'PENDIENTE',
        bankPos: 'BAC',
        cardBrand: 'VISA',
        createdAt: now - 5000,
      ),
      PaymentEntity(
        id: 'pay-pr-2',
        invoiceId: 'inv-parent-01',
        method: 'card',
        amount: 520.0,
        amountNio: 520.0,
        voucherCode: 'PENDIENTE',
        reconciliationStatus: 'PENDIENTE',
        bankPos: 'BANPRO',
        cardBrand: 'MASTERCARD',
        createdAt: now,
      ),
    ]);

    parentVm = CashShiftViewModel(
      sessionDao: database.cashierSessionDao,
      movementDao: database.cashMovementDao,
      paymentDao: database.paymentDao,
      currentUserId: 'cajero-01',
    );
    await parentVm.refreshPendingVouchersCount();
  });

  tearDown(() async {
    await database.close();
  });

  Widget harness(CashShiftViewModel vm) {
    return MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (context) => Center(
            child: ElevatedButton(
              key: const Key('btn_open_reconciliation'),
              onPressed: () => openVoucherReconciliationDialog(context, vm),
              child: const Text('open reconciliation'),
            ),
          ),
        ),
      ),
    );
  }

  /// Opens the dialog through the REAL entry point and makes the child VM's
  /// pending list available. The create-time load chain hangs in the
  /// fake-async zone (see the file-level note), so the idempotent
  /// [CardVoucherReconciliationViewModel.loadPendingVouchers] re-read is
  /// driven through runAsync; the frames are then settled outside it.
  Future<CardVoucherReconciliationViewModel> openDialog(
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(harness(parentVm));
    await tester.tap(find.byKey(const Key('btn_open_reconciliation')));
    await tester.pumpAndSettle();

    final childVm = Provider.of<CardVoucherReconciliationViewModel>(
      tester.element(find.text('Reconciliación de Vouchers')),
      listen: false,
    );
    await tester.runAsync(childVm.loadPendingVouchers);
    await tester.pumpAndSettle();
    return childVm;
  }

  /// Runs [action] (e.g. a button tap whose handler hits the DB) so its
  /// async chain progresses in real time, waits for the chain to finish,
  /// then settles the scheduled frames outside runAsync.
  Future<void> tapWithRealIo(
    WidgetTester tester,
    Future<void> Function() action,
  ) async {
    await tester.runAsync(() async {
      await action();
      await Future<void>.delayed(const Duration(milliseconds: 200));
    });
    await tester.pumpAndSettle();
  }

  group('Voucher reconciliation live parent refresh (Issue #74)', () {
    testWidgets(
        'reconciling ONE of two vouchers updates parent count without closing the dialog',
        (tester) async {
      expect(parentVm.pendingVouchersCount, 2);
      expect(parentVm.hasPendingVouchers, isTrue);

      await openDialog(tester);

      // Dialog is open with both vouchers.
      expect(find.text('Reconciliación de Vouchers'), findsOneWidget);
      expect(
          find.byKey(const Key('voucher_code_input_pay-pr-1')), findsOneWidget);
      expect(
          find.byKey(const Key('voucher_code_input_pay-pr-2')), findsOneWidget);

      // Reconcile exactly ONE voucher.
      await tester.enterText(
          find.byKey(const Key('voucher_code_input_pay-pr-1')), '654321');
      await tester.pumpAndSettle();
      await tapWithRealIo(
        tester,
        () => tester.tap(find.byKey(const Key('btn_reconcile_pay-pr-1'))),
      );

      // THE FIX: dialog is STILL OPEN and the parent already sees the drop.
      expect(find.text('Reconciliación de Vouchers'), findsOneWidget);
      expect(parentVm.pendingVouchersCount, 1);
      expect(parentVm.hasPendingVouchers, isTrue);

      // Reconcile the second one: count reaches 0 live, fiscal gate clears.
      await tester.enterText(
          find.byKey(const Key('voucher_code_input_pay-pr-2')), '778899');
      await tester.pumpAndSettle();
      await tapWithRealIo(
        tester,
        () => tester.tap(find.byKey(const Key('btn_reconcile_pay-pr-2'))),
      );

      expect(find.text('Reconciliación de Vouchers'), findsOneWidget);
      expect(find.textContaining('Todos los vouchers han sido conciliados'),
          findsOneWidget);
      expect(parentVm.pendingVouchersCount, 0);
      expect(parentVm.hasPendingVouchers, isFalse);
    });

    testWidgets(
        'overriding ONE of two vouchers (missing voucher) updates parent count without closing the dialog',
        (tester) async {
      expect(parentVm.pendingVouchersCount, 2);

      await openDialog(tester);

      expect(find.text('Reconciliación de Vouchers'), findsOneWidget);

      // Open the override dialog for voucher 2 (no DB work in this handler).
      await tester.tap(find.byKey(const Key('btn_override_pay-pr-2')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('btn_submit_override')), findsOneWidget);

      await tester.enterText(
          find.byKey(const Key('override_reason_field')),
          'Ticket de datáfono salió en blanco');
      await tester.pumpAndSettle();
      await tester.enterText(
          find.byKey(const Key('override_supervisor_field')), 'sup-01');
      await tester.pumpAndSettle();

      // Submit the override: the override modal closes but the
      // reconciliation dialog must STILL be open, and the parent count must
      // already be fresh.
      await tapWithRealIo(
        tester,
        () => tester.tap(find.byKey(const Key('btn_submit_override'))),
      );

      expect(find.byKey(const Key('btn_submit_override')), findsNothing);
      expect(find.text('Reconciliación de Vouchers'), findsOneWidget);

      // THE FIX: parent count dropped live, without dismissing anything.
      expect(parentVm.pendingVouchersCount, 1);
      expect(parentVm.hasPendingVouchers, isTrue);
    });

    testWidgets(
        'a rejected authorization code does NOT change the parent count',
        (tester) async {
      expect(parentVm.pendingVouchersCount, 2);

      await openDialog(tester);

      // 'PENDIENTE' is rejected by the view model before any DB write: no
      // refresh, the parent count must stay at 2.
      await tester.enterText(
          find.byKey(const Key('voucher_code_input_pay-pr-1')), 'PENDIENTE');
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('btn_reconcile_pay-pr-1')));
      await tester.pumpAndSettle();

      expect(find.text('Reconciliación de Vouchers'), findsOneWidget);
      expect(parentVm.pendingVouchersCount, 2);
      expect(parentVm.hasPendingVouchers, isTrue);
      expect(find.textContaining('Debe ingresar un código de autorización válido'),
          findsOneWidget);
    });
  });
}
