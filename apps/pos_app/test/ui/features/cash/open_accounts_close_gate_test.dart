import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/models/sales/hold_ticket.dart';
import 'package:pos_app/domain/services/sales/table_order_service.dart';
import 'package:pos_app/domain/services/sales/waiter_settlement_service.dart';
import 'package:pos_app/ui/features/cash/cash_shift_view_model.dart';

/// T8 (cuentas abiertas, INV-16.5): the Corte Z close must hard-block while
/// open accounts exist — enforced in the ViewModel, re-checked fresh at
/// close time, and never burning a Z sequence number on a blocked attempt.
void main() {
  late AppDatabase database;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
  });

  tearDown(() async {
    await database.close();
  });

  /// VM with the loader wired exactly as production wires it (fromDatabase).
  CashShiftViewModel wiredVm() => CashShiftViewModel.fromDatabase(
        database: database,
        currentUserId: 'user-cajero-1',
        currentTerminalId: 'term-main',
      );

  /// Parks a 2-line / C$440 open account through the SAME service the
  /// held-accounts UI uses, so the test seeds what the operator would see.
  Future<HoldTicket> parkAccount({String name = 'Mesa 3'}) {
    return TableOrderService(database).parkOrder(
      name: name,
      items: const [
        CartItem(
          productId: 'p-1',
          productName: 'Bebida',
          quantity: 1,
          unitPrice: 220.0,
          taxRate: 0.15,
        ),
        CartItem(
          productId: 'p-2',
          productName: 'Snack',
          quantity: 1,
          unitPrice: 220.0,
          taxRate: 0.15,
        ),
      ],
    );
  }

  group('T8: hard block on open accounts', () {
    test(
        'closeShiftWithBlindCount throws OpenTablesPendingException, writes nothing and burns no Z',
        () async {
      final vm = wiredVm();
      await vm.init();
      await vm.openShift(initialFloatNio: 1000.0, initialFloatUsd: 0.0);
      final account = await parkAccount();

      OpenTablesPendingException? blocked;
      try {
        await vm.closeShiftWithBlindCount(
          countedNio: 1000.0,
          countedUsd: 0.0,
        );
        fail('closeShiftWithBlindCount must refuse while accounts are open');
      } on OpenTablesPendingException catch (e) {
        blocked = e;
      }

      // The existing domain vocabulary, carrying per-account detail.
      expect(blocked, isNotNull);
      expect(blocked!.openAccounts, hasLength(1));
      expect(blocked.openAccounts.single.name, 'Mesa 3');
      expect(blocked.openAccounts.single.items, hasLength(2));

      // Writes nothing: the session row is still open.
      final row = await database.cashierSessionDao
          .getActiveSessionForUserAndTerminal('user-cajero-1', 'term-main');
      expect(row, isNotNull);
      expect(row!.isClosed, isFalse);
      expect(vm.activeShift, isNotNull);
      expect(vm.activeShift!.isClosed, isFalse);
      expect(vm.lastClosedShift, isNull);

      // A blocked close must not burn a Z number.
      expect(await database.cashierSessionDao.countClosedSessions(), 0);

      // Resolving the account is the ONLY way through: after it is
      // resolved, the same close succeeds and takes Z = 1 (not 2).
      await TableOrderService(database).liquidateOrder(account.id);
      final closed = await vm.closeShiftWithBlindCount(
        countedNio: 1000.0,
        countedUsd: 0.0,
      );
      expect(closed, isTrue);
      expect(vm.lastClosedShift!.zReportSequence, 1);
    });

    test('close proceeds exactly as before when there are no open accounts',
        () async {
      final vm = wiredVm();
      await vm.init();
      await vm.openShift(initialFloatNio: 1000.0, initialFloatUsd: 50.0);

      final closed = await vm.closeShiftWithBlindCount(
        countedNio: 1000.0,
        countedUsd: 50.0,
      );

      expect(closed, isTrue);
      expect(vm.hasActiveShift, isFalse);
      expect(vm.lastClosedShift!.zReportSequence, 1);
    });

    test(
        'unwired loader: the close REFUSES instead of assuming zero accounts',
        () async {
      // R1-open-gate-default / R2-001 (native review, slice F5): a fiscal
      // gate must not depend on its wiring. The direct constructor no
      // longer defaults to "no open accounts" — an unverifiable account
      // state blocks the close, and "there are no open accounts" is only
      // ever an explicit loader answer.
      final vm = CashShiftViewModel(
        sessionDao: database.cashierSessionDao,
        movementDao: database.cashMovementDao,
        currentUserId: 'user-cajero-1',
        currentTerminalId: 'term-main',
      );
      await vm.init();
      await vm.openShift(initialFloatNio: 1000.0, initialFloatUsd: 0.0);

      final closed = await vm.closeShiftWithBlindCount(
        countedNio: 1000.0,
        countedUsd: 0.0,
      );

      expect(closed, isFalse);
      expect(vm.errorMessage,
          contains('No se pudieron verificar las cuentas abiertas'));
      // Fail closed also means write nothing.
      expect(vm.hasActiveShift, isTrue);
      expect(await database.cashierSessionDao.countClosedSessions(), 0);
      expect(vm.lastClosedShift, isNull);
    });

    test(
        'explicit-empty loader: close proceeds normally — "no open accounts" is a declaration, not a default',
        () async {
      // The direct constructor WITH an explicit loader is the harness
      // equivalent of production's fromDatabase wiring: the test DECLARES
      // the account state instead of inheriting it from a missing
      // dependency.
      final vm = CashShiftViewModel(
        sessionDao: database.cashierSessionDao,
        movementDao: database.cashMovementDao,
        currentUserId: 'user-cajero-1',
        currentTerminalId: 'term-main',
        openAccountsLoader: () async => const [],
      );
      await vm.init();
      await vm.openShift(initialFloatNio: 1000.0, initialFloatUsd: 0.0);

      final closed = await vm.closeShiftWithBlindCount(
        countedNio: 1000.0,
        countedUsd: 0.0,
      );

      expect(closed, isTrue);
      expect(vm.lastClosedShift!.zReportSequence, 1);
    });

    test(
        'stale-read defence: account parked AFTER the last refresh still blocks the close',
        () async {
      final vm = wiredVm();
      await vm.init(); // loader saw zero accounts here
      await vm.openShift(initialFloatNio: 1000.0, initialFloatUsd: 0.0);

      // Parked after init: the dialog-rendered figure would be stale.
      await parkAccount();

      // The close must NOT trust that stale figure — it re-queries here.
      OpenTablesPendingException? blocked;
      try {
        await vm.closeShiftWithBlindCount(
          countedNio: 1000.0,
          countedUsd: 0.0,
        );
      } on OpenTablesPendingException catch (e) {
        blocked = e;
      }
      expect(blocked, isNotNull);
      expect(blocked!.openAccounts.single.name, 'Mesa 3');

      // The same fresh figure is exposed for the UI / Corte X.
      await vm.init();
      expect(vm.openAccountsCount, 1);
      expect(vm.openAccountsTotalNio, 440.0);
      expect(vm.hasOpenAccounts, isTrue);
    });

    test(
        'init() with a failing loader never reports a verifiable empty list, and the close blocks',
        () async {
      // R1-stale-open-accounts-init / R3-002 / R4-001 (native review,
      // slice F5): three lenses converged on init() swallowing a loader
      // failure and leaving _openAccounts at its previous value. Fail
      // closed: a failed read is UNVERIFIED state, never "no accounts".
      final vm = CashShiftViewModel(
        sessionDao: database.cashierSessionDao,
        movementDao: database.cashMovementDao,
        currentUserId: 'user-cajero-1',
        currentTerminalId: 'term-main',
        openAccountsLoader: () async => throw StateError('db locked'),
      );

      await vm.init();

      expect(vm.errorMessage, isNotNull);
      expect(vm.openAccountsVerified, isFalse,
          reason: 'a failed read must not vouch for the account state');
      expect(vm.hasOpenAccounts, isTrue,
          reason: 'unverified must block, not pass as zero accounts');
      expect(vm.openAccounts, isEmpty);

      // A subsequent close attempt is BLOCKED by the same failing loader,
      // not allowed through.
      await vm.openShift(initialFloatNio: 1000.0, initialFloatUsd: 0.0);
      final closed = await vm.closeShiftWithBlindCount(
        countedNio: 1000.0,
        countedUsd: 0.0,
      );
      expect(closed, isFalse);
      expect(vm.errorMessage,
          contains('No se pudieron verificar las cuentas abiertas'));
      expect(vm.hasActiveShift, isTrue);
    });

    test(
        'a failed init() drops the previous account list instead of leaving it looking verified',
        () async {
      var calls = 0;
      final account = await parkAccount(name: 'Mesa 9');
      final vm = CashShiftViewModel(
        sessionDao: database.cashierSessionDao,
        movementDao: database.cashMovementDao,
        currentUserId: 'user-cajero-1',
        currentTerminalId: 'term-main',
        openAccountsLoader: () async {
          calls++;
          if (calls == 1) return [account];
          throw StateError('db locked');
        },
      );

      await vm.init();
      expect(vm.openAccountsVerified, isTrue);
      expect(vm.openAccounts.single.name, 'Mesa 9');

      // The refresh the close flow performs fails: the UI pre-gate must
      // not keep rendering the PREVIOUS list as if it were current.
      await vm.init();
      expect(vm.errorMessage, isNotNull);
      expect(vm.openAccountsVerified, isFalse,
          reason: 'stale list must not survive a failed refresh');
      expect(vm.openAccounts, isEmpty);
      expect(vm.hasOpenAccounts, isTrue,
          reason: 'a failed refresh must block, not pass as zero accounts');
    });
  });
}
