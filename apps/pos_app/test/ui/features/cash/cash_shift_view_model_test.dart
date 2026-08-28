import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/ui/features/cash/cash_shift_view_model.dart';

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
