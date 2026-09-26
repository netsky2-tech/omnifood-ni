import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/ui/features/cash/cash_shift_view_model.dart';

/// Identity-source fake (issue #552): only [getCurrentUser] matters for the
/// cash-shift VM; every other repository capability is out of scope here.
class FakeIdentityAuthRepository implements AuthRepository {
  FakeIdentityAuthRepository(this.user);

  final User? user;

  @override
  Future<User?> getCurrentUser() async => user;

  @override
  dynamic noSuchMethod(Invocation invocation) => UnimplementedError();
}

void main() {
  late AppDatabase database;
  late CashShiftViewModel viewModel;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    viewModel = CashShiftViewModel.fromDatabase(
      database: database,
      currentUserId: 'user-cajero-1',
      currentUserName: 'Juan Pérez',
      currentTerminalId: 'term-main',
      currentUserRole: UserRole.cashier,
    );
  });

  tearDown(() async {
    await database.close();
  });

  group('CashShiftViewModel', () {
    test('initial state has no active shift and loads cleanly', () async {
      await viewModel.init();
      expect(viewModel.hasActiveShift, isFalse);
      expect(viewModel.activeShift, isNull);
      expect(viewModel.movements, isEmpty);
    });

    test('openShift opens a new shift with dual-currency float', () async {
      await viewModel.init();

      final success = await viewModel.openShift(
        initialFloatNio: 1200.0,
        initialFloatUsd: 40.0,
        notes: 'Apertura de turno matutino',
      );

      expect(success, isTrue);
      expect(viewModel.hasActiveShift, isTrue);
      expect(viewModel.activeShift, isNotNull);
      expect(viewModel.activeShift!.openingBalanceNio, 1200.0);
      expect(viewModel.activeShift!.openingBalanceUsd, 40.0);
      expect(viewModel.activeShift!.expectedNio, 1200.0);
      expect(viewModel.activeShift!.expectedUsd, 40.0);

      // Verify persisted in Floor
      final persisted = await database.cashierSessionDao.getActiveSession();
      expect(persisted, isNotNull);
      expect(persisted!.openingBalanceNio, 1200.0);
    });

    test('recordMovement adds a cash movement and updates expected balances in active shift', () async {
      await viewModel.init();
      await viewModel.openShift(
        initialFloatNio: 1000.0,
        initialFloatUsd: 50.0,
      );

      // 1. Record CASH_IN of C$ 500
      final inSuccess = await viewModel.recordMovement(
        type: 'CASH_IN',
        amountNio: 500.0,
        amountUsd: 0.0,
        reason: 'Ingreso cambio menudo',
      );
      expect(inSuccess, isTrue);
      expect(viewModel.activeShift!.expectedNio, 1500.0);
      expect(viewModel.activeShift!.expectedUsd, 50.0);
      expect(viewModel.movements, hasLength(1));

      // 2. Record PETTY_CASH of C$ 100
      final outSuccess = await viewModel.recordMovement(
        type: 'PETTY_CASH',
        amountNio: 100.0,
        amountUsd: 0.0,
        reason: 'Compra de bolsas',
        authorizedByUserId: 'user-manager',
      );
      expect(outSuccess, isTrue);
      expect(viewModel.activeShift!.expectedNio, 1400.0);
      expect(viewModel.activeShift!.expectedUsd, 50.0);
      expect(viewModel.movements, hasLength(2));

      // 3. Record SAFE_DROP of $20 USD
      final dropSuccess = await viewModel.recordMovement(
        type: 'SAFE_DROP',
        amountNio: 0.0,
        amountUsd: 20.0,
        reason: 'Retiro parcial de dólares',
        authorizedByUserId: 'user-manager',
      );
      expect(dropSuccess, isTrue);
      expect(viewModel.activeShift!.expectedNio, 1400.0);
      expect(viewModel.activeShift!.expectedUsd, 30.0);
      expect(viewModel.movements, hasLength(3));
    });

    test(
        'issue #552: resolves ITS OWN user+terminal session when two sessions are open concurrently',
        () async {
      // Another cashier already has an open shift on the SAME terminal.
      await database.cashierSessionDao.insertSession(
        CashierSessionEntity(
          id: 'shift-a',
          userId: 'cashier-a',
          terminalId: 'term-main',
          openedAt:
              DateTime.parse('2026-02-01T08:00:00Z').millisecondsSinceEpoch,
          isClosed: false,
        ),
      );

      final vmB = CashShiftViewModel.fromDatabase(
        database: database,
        currentUserId: 'cashier-b',
        currentTerminalId: 'term-main',
        currentUserRole: UserRole.cashier,
      );

      // The topology-blind lookup used to hand cashier-b cashier-a's shift.
      await vmB.init();
      expect(vmB.hasActiveShift, isFalse);

      // cashier-b can open its OWN shift even though cashier-a's is open.
      final opened = await vmB.openShift(
        initialFloatNio: 500.0,
        initialFloatUsd: 0.0,
      );
      expect(opened, isTrue);
      expect(vmB.activeShift!.userId, 'cashier-b');

      // cashier-a still resolves its own shift, not cashier-b's.
      final vmA = CashShiftViewModel.fromDatabase(
        database: database,
        currentUserId: 'cashier-a',
        currentTerminalId: 'term-main',
        currentUserRole: UserRole.cashier,
      );
      await vmA.init();
      expect(vmA.activeShift!.id, 'shift-a');
    });

    test(
        'issue #552: openShift stamps the user id resolved from the identity source',
        () async {
      final vm = CashShiftViewModel.fromDatabase(
        database: database,
        authRepository: FakeIdentityAuthRepository(
          const User(
            id: 'real-user-42',
            name: 'María López',
            role: UserRole.cashier,
            isActive: true,
          ),
        ),
        currentTerminalId: 'term-main',
        currentUserRole: UserRole.cashier,
      );

      await vm.init();
      final opened = await vm.openShift(
        initialFloatNio: 1000.0,
        initialFloatUsd: 0.0,
      );

      expect(opened, isTrue);
      final persisted = await database.cashierSessionDao
          .getActiveSessionForUserAndTerminal('real-user-42', 'term-main');
      expect(persisted, isNotNull);
      expect(persisted!.userId, 'real-user-42');
    });

    test(
        'issue #552: openShift refuses to open when the identity source has no logged-in user',
        () async {
      final vm = CashShiftViewModel.fromDatabase(
        database: database,
        authRepository: FakeIdentityAuthRepository(null),
        currentTerminalId: 'term-main',
        currentUserRole: UserRole.cashier,
      );

      await vm.init();
      expect(vm.hasActiveShift, isFalse);

      final opened = await vm.openShift(
        initialFloatNio: 1000.0,
        initialFloatUsd: 0.0,
      );

      expect(opened, isFalse);
      expect(vm.errorMessage, 'Debe iniciar sesión para abrir caja.');
    });

    test('blocks opening another shift if one is already active', () async {
      await viewModel.init();
      await viewModel.openShift(
        initialFloatNio: 1000.0,
        initialFloatUsd: 0.0,
      );

      final secondOpen = await viewModel.openShift(
        initialFloatNio: 500.0,
        initialFloatUsd: 0.0,
      );

      expect(secondOpen, isFalse);
      expect(viewModel.errorMessage, contains('Ya existe un turno'));
    });

    test('closeShiftWithBlindCount closes active shift, computes variances and sets Z sequence', () async {
      await viewModel.init();
      await viewModel.openShift(
        initialFloatNio: 1000.0,
        initialFloatUsd: 50.0,
      );

      await viewModel.recordMovement(
        type: 'CASH_IN',
        amountNio: 200.0,
        amountUsd: 0.0,
        reason: 'Venta inicial',
      );

      // Expected is NIO 1,200.00 and USD 50.00
      // Cashier counts NIO 1,220.00 (Surplus +20.0) and USD 45.00 (Shortage -5.0)
      final closeSuccess = await viewModel.closeShiftWithBlindCount(
        countedNio: 1220.0,
        countedUsd: 45.0,
        notes: 'Cierre con leve sobrante en córdobas',
        supervisorId: 'sup-01',
      );

      expect(closeSuccess, isTrue);
      expect(viewModel.hasActiveShift, isFalse);
      expect(viewModel.lastClosedShift, isNotNull);
      expect(viewModel.lastClosedShift!.isClosed, isTrue);
      expect(viewModel.lastClosedShift!.closingCountedNio, 1220.0);
      expect(viewModel.lastClosedShift!.closingCountedUsd, 45.0);
      expect(viewModel.lastClosedShift!.differenceNio, 20.0);
      expect(viewModel.lastClosedShift!.differenceUsd, -5.0);
      expect(viewModel.lastClosedShift!.zReportSequence, 1);
      expect(viewModel.lastClosedShift!.supervisorId, 'sup-01');

      // Next shift will get Z=2
      final openSecond = await viewModel.openShift(
        initialFloatNio: 500.0,
        initialFloatUsd: 20.0,
      );
      expect(openSecond, isTrue);

      final closeSecond = await viewModel.closeShiftWithBlindCount(
        countedNio: 500.0,
        countedUsd: 20.0,
      );
      expect(closeSecond, isTrue);
      expect(viewModel.lastClosedShift!.zReportSequence, 2);
    });
  });
}
