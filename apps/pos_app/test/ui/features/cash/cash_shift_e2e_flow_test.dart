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
      currentUserId: 'user-cajero-01',
      currentUserName: 'María López',
      currentTerminalId: 'terminal-pos-01',
    );
  });

  tearDown(() async {
    await database.close();
  });

  group('Cash Shift E2E Lifecycle Flow', () {
    test('complete lifecycle: open -> cash in/out -> safe drop -> x-reading -> blind count -> z-report -> sequence tracking',
        () async {
      // 1. Initial check: No active shift
      await viewModel.init();
      expect(viewModel.hasActiveShift, isFalse);
      expect(viewModel.activeShift, isNull);

      // 2. Open shift with Dual-Currency Float (C$ 1,000.00 NIO + $40.00 USD)
      final opened = await viewModel.openShift(
        initialFloatNio: 1000.0,
        initialFloatUsd: 40.0,
        notes: 'Turno matutino María López',
      );
      expect(opened, isTrue);
      expect(viewModel.hasActiveShift, isTrue);
      expect(viewModel.activeShift!.openingBalanceNio, 1000.0);
      expect(viewModel.activeShift!.openingBalanceUsd, 40.0);
      expect(viewModel.activeShift!.expectedNio, 1000.0);
      expect(viewModel.activeShift!.expectedUsd, 40.0);

      // 3. Register CASH_IN: C$ 500.00 (Cambio menudo)
      final cashInOk = await viewModel.recordMovement(
        type: 'CASH_IN',
        amountNio: 500.0,
        amountUsd: 0.0,
        reason: 'Ingreso sencillo de banco',
      );
      expect(cashInOk, isTrue);
      expect(viewModel.activeShift!.expectedNio, 1500.0);
      expect(viewModel.activeShift!.expectedUsd, 40.0);

      // 4. Register PETTY_CASH: C$ 120.00 (Compra de hielo/bolsas)
      final pettyOk = await viewModel.recordMovement(
        type: 'PETTY_CASH',
        amountNio: 120.0,
        amountUsd: 0.0,
        reason: 'Compra de bolsas de hielo',
        authorizedByUserId: 'supervisor-01',
      );
      expect(pettyOk, isTrue);
      expect(viewModel.activeShift!.expectedNio, 1380.0);
      expect(viewModel.activeShift!.expectedUsd, 40.0);

      // 5. Register SAFE_DROP: $20.00 USD (Retiro a bóveda)
      final dropOk = await viewModel.recordMovement(
        type: 'SAFE_DROP',
        amountNio: 0.0,
        amountUsd: 20.0,
        reason: 'Retiro preventivo de dólares a caja fuerte',
        authorizedByUserId: 'supervisor-01',
      );
      expect(dropOk, isTrue);
      expect(viewModel.activeShift!.expectedNio, 1380.0);
      expect(viewModel.activeShift!.expectedUsd, 20.0);
      expect(viewModel.movements, hasLength(3));

      // 6. Partial Reading (Corte X inspection - verify shift remains OPEN and active)
      expect(viewModel.hasActiveShift, isTrue);
      expect(viewModel.activeShift!.isClosed, isFalse);

      // 7. Blind Count & Close (Corte Z)
      // Cashier counts: C$ 1,400.00 (Surplus: +C$ 20.00) and $20.00 USD (Exact: $0.00)
      final closed = await viewModel.closeShiftWithBlindCount(
        countedNio: 1400.0,
        countedUsd: 20.0,
        notes: 'Cierre de turno con leve sobrante de 20 córdobas',
        supervisorId: 'supervisor-01',
      );
      expect(closed, isTrue);
      expect(viewModel.hasActiveShift, isFalse);
      expect(viewModel.activeShift, isNull);

      final z1 = viewModel.lastClosedShift;
      expect(z1, isNotNull);
      expect(z1!.isClosed, isTrue);
      expect(z1.zReportSequence, 1);
      expect(z1.openingBalanceNio, 1000.0);
      expect(z1.openingBalanceUsd, 40.0);
      expect(z1.expectedNio, 1380.0);
      expect(z1.expectedUsd, 20.0);
      expect(z1.closingCountedNio, 1400.0);
      expect(z1.closingCountedUsd, 20.0);
      expect(z1.differenceNio, 20.0); // +20 surplus
      expect(z1.differenceUsd, 0.0);  // exact

      // 8. Re-opening a 2nd shift increments Z sequence to Z=2
      final openSecond = await viewModel.openShift(
        initialFloatNio: 800.0,
        initialFloatUsd: 10.0,
        notes: 'Turno vespertino',
      );
      expect(openSecond, isTrue);

      final closeSecond = await viewModel.closeShiftWithBlindCount(
        countedNio: 800.0,
        countedUsd: 10.0,
      );
      expect(closeSecond, isTrue);
      expect(viewModel.lastClosedShift!.zReportSequence, 2);
    });
  });
}
