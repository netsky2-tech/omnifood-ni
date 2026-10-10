import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/data/models/sales/payment_entity.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/ui/features/cash/cash_shift_view_model.dart';
import 'package:pos_app/ui/features/cash/card_voucher_reconciliation_view_model.dart';
import 'package:pos_app/ui/features/cash/widgets/close_shift_dialog.dart';
import 'package:provider/provider.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// Identity stub for the reconcile-time identity fix: only [getCurrentUser]
/// matters here. Mutable [user] so each test decides whether the identity
/// source reports a logged-in operator or nobody.
class IdentityStubAuthRepository implements AuthRepository {
  IdentityStubAuthRepository(this.user);

  User? user;

  @override
  Future<User?> getCurrentUser() async => user;

  @override
  dynamic noSuchMethod(Invocation invocation) => UnimplementedError();
}

/// Reconcile-time identity: the reconciliation flow must stamp the acting
/// user id resolved from the identity source (the same per-action resolver
/// open/close use), and must REFUSE every identity-stamped write when no
/// acting user can be resolved — the backend contract
/// (@IsNotEmpty reconciledByUserId) rejects an empty operator id, and a
/// reconciliation without a known operator is an audit hole.
///
/// NOTE on sqflite_ffi + flutter_test: same constraint documented in
/// voucher_reconciliation_parent_refresh_test.dart — DB chains started
/// inside the test body must run inside [tester.runAsync].
void main() {
  late AppDatabase database;
  late IdentityStubAuthRepository identityStub;
  late CashShiftViewModel parentVm;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();

    await database.invoiceDao.insertInvoice(
      InvoiceEntity(
        id: 'inv-ident-01',
        number: '001-001-01-00000222',
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
        idempotencyKey: 'idemp-ident-1',
        payloadHash: 'hash-ident-1',
        bcnOfficialRate: 36.6241,
        commercialRate: 36.50,
        totalUsd: 25.21,
      ),
    );

    final now = DateTime.now().millisecondsSinceEpoch;
    await database.paymentDao.insertPayments([
      PaymentEntity(
        id: 'pay-ident-1',
        invoiceId: 'inv-ident-01',
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
        id: 'pay-ident-2',
        invoiceId: 'inv-ident-01',
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

    // Production wiring (main.dart): currentUserId is NOT passed; identity
    // comes from the injected AuthRepository at action time.
    identityStub = IdentityStubAuthRepository(null);
    parentVm = CashShiftViewModel(
      sessionDao: database.cashierSessionDao,
      movementDao: database.cashMovementDao,
      paymentDao: database.paymentDao,
      authRepository: identityStub,
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

  group('CardVoucherReconciliationViewModel identity guard (direct VM)', () {
    test(
        'reconcileVoucher with NO resolvable operator refuses, writes nothing and never notifies the parent',
        () async {
      var parentRefreshCount = 0;
      final vm = CardVoucherReconciliationViewModel(
        paymentDao: database.paymentDao,
        currentUserId: '',
        onVoucherResolved: () async {
          parentRefreshCount++;
        },
      );
      await vm.loadPendingVouchers();
      expect(vm.pendingCount, 2);

      final result = await vm.reconcileVoucher(
        paymentId: 'pay-ident-1',
        voucherCode: '654321',
      );

      expect(result, isFalse);
      expect(
        vm.errorMessage,
        contains('No se pudo identificar al usuario que concilia'),
      );
      // No write: both vouchers are still PENDIENTE in the database.
      final stillPending =
          await database.paymentDao.getPendingCardPayments();
      expect(stillPending.length, 2);
      expect(
        stillPending.firstWhere((p) => p.id == 'pay-ident-1').voucherCode,
        'PENDIENTE',
      );
      // Issue #74 invariant: the parent-refresh callback fires only on
      // success — zero times on the refusal.
      expect(parentRefreshCount, 0);
    });

    test(
        'overrideMissingVoucher with NO resolvable operator refuses even with a valid supervisor',
        () async {
      var parentRefreshCount = 0;
      final vm = CardVoucherReconciliationViewModel(
        paymentDao: database.paymentDao,
        currentUserId: '',
        onVoucherResolved: () async {
          parentRefreshCount++;
        },
      );
      await vm.loadPendingVouchers();
      expect(vm.pendingCount, 2);

      final result = await vm.overrideMissingVoucher(
        paymentId: 'pay-ident-1',
        reason: 'Ticket de datáfono salió en blanco',
        supervisorId: 'sup-01',
      );

      expect(result, isFalse);
      expect(
        vm.errorMessage,
        contains('No se pudo identificar al usuario que registra el override'),
      );
      final stillPending =
          await database.paymentDao.getPendingCardPayments();
      expect(stillPending.length, 2);
      expect(parentRefreshCount, 0);
    });

    test(
        'reconcileVoucher with a resolvable operator persists that id and notifies the parent exactly once',
        () async {
      var parentRefreshCount = 0;
      final vm = CardVoucherReconciliationViewModel(
        paymentDao: database.paymentDao,
        currentUserId: 'cajero-42',
        onVoucherResolved: () async {
          parentRefreshCount++;
        },
      );
      await vm.loadPendingVouchers();
      expect(vm.pendingCount, 2);

      final result = await vm.reconcileVoucher(
        paymentId: 'pay-ident-1',
        voucherCode: '654321',
      );

      expect(result, isTrue);
      expect(parentRefreshCount, 1);
      final pendingAfter =
          await database.paymentDao.getPendingCardPayments();
      expect(pendingAfter.length, 1);
    });
  });

  group('Voucher reconciliation identity through the real entry point', () {
    testWidgets(
        'with NO resolvable acting user, reconciling does NOT write the row and shows the refusal',
        (tester) async {
      expect(parentVm.pendingVouchersCount, 2);
      identityStub.user = null;

      var parentRefreshCount = 0;
      parentVm.addListener(() => parentRefreshCount++);

      await openDialog(tester);
      expect(find.text('Reconciliación de Vouchers'), findsOneWidget);

      await tester.enterText(
          find.byKey(const Key('voucher_code_input_pay-ident-1')), '654321');
      await tester.pumpAndSettle();
      await tapWithRealIo(
        tester,
        () => tester.tap(find.byKey(const Key('btn_reconcile_pay-ident-1'))),
      );

      // Refusal is visible to the operator, in Spanish.
      expect(
        find.textContaining('No se pudo identificar al usuario que concilia'),
        findsOneWidget,
      );
      // Dialog stays open, voucher still pending.
      expect(find.text('Reconciliación de Vouchers'), findsOneWidget);
      expect(parentVm.pendingVouchersCount, 2);

      // The row was NOT written: still PENDIENTE in the database.
      final stillPending = (await tester.runAsync(
        () => database.paymentDao.getPendingCardPayments(),
      ))!;
      expect(stillPending.length, 2);
      final row = stillPending.firstWhere((p) => p.id == 'pay-ident-1');
      expect(row.reconciliationStatus, 'PENDIENTE');
      expect(row.voucherCode, 'PENDIENTE');

      // Zero parent refreshes on the refusal (Issue #74 invariant).
      expect(parentRefreshCount, 0);
    });

    testWidgets(
        'with a resolvable acting user, reconciling persists THAT user id in reconciledByUserId and refreshes the parent exactly once',
        (tester) async {
      expect(parentVm.pendingVouchersCount, 2);
      identityStub.user = const User(
        id: 'cajero-42',
        name: 'María López',
        role: UserRole.cashier,
        isActive: true,
      );

      var parentRefreshCount = 0;
      parentVm.addListener(() => parentRefreshCount++);

      await openDialog(tester);
      expect(find.text('Reconciliación de Vouchers'), findsOneWidget);

      await tester.enterText(
          find.byKey(const Key('voucher_code_input_pay-ident-1')), '654321');
      await tester.pumpAndSettle();
      await tapWithRealIo(
        tester,
        () => tester.tap(find.byKey(const Key('btn_reconcile_pay-ident-1'))),
      );

      // Parent saw the live drop: exactly one refresh callback.
      expect(parentVm.pendingVouchersCount, 1);
      expect(parentRefreshCount, 1);

      // The persisted row carries the RESOLVED operator id, not the raw
      // constructor field (which stays empty in the production wiring).
      final pendingAfter = (await tester.runAsync(
        () => database.paymentDao.getPendingCardPayments(),
      ))!;
      expect(pendingAfter.length, 1);
      final remaining = pendingAfter.first;
      expect(remaining.id, 'pay-ident-2');
      final reconciledRow = (await tester.runAsync(
        () => database.paymentDao.getPaymentsByInvoiceId('inv-ident-01'),
      ))!;
      final reconciled =
          reconciledRow.firstWhere((p) => p.id == 'pay-ident-1');
      expect(reconciled.reconciliationStatus, 'CONCILIADO');
      expect(reconciled.reconciledByUserId, 'cajero-42');
    });
  });

  group('CashShiftViewModel.resolveActingUserId', () {
    test('identity source wins over the constructor fallback', () async {
      identityStub.user = const User(
        id: 'cajero-42',
        name: 'María López',
        role: UserRole.cashier,
        isActive: true,
      );
      expect(await parentVm.resolveActingUserId(), 'cajero-42');
    });

    test(
        'null when the identity source reports no logged-in user, even with a non-empty constructor value',
        () async {
      identityStub.user = null;
      final vm = CashShiftViewModel(
        sessionDao: database.cashierSessionDao,
        movementDao: database.cashMovementDao,
        paymentDao: database.paymentDao,
        currentUserId: 'cajero-01',
        authRepository: identityStub,
      );
      expect(await vm.resolveActingUserId(), isNull);
    });

    test(
        'falls back to the constructor value only when no identity source was injected',
      () async {
      final vm = CashShiftViewModel(
        sessionDao: database.cashierSessionDao,
        movementDao: database.cashMovementDao,
        paymentDao: database.paymentDao,
        currentUserId: 'cajero-01',
      );
      expect(await vm.resolveActingUserId(), 'cajero-01');
    });
  });
}
