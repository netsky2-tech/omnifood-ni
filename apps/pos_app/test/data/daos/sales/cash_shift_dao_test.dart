import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
import 'package:pos_app/data/models/sales/cash_movement_entity.dart';

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

  group('CashierSession & CashMovement DAOs Integration', () {
    test('opens a dual-currency shift, records cash movements, and closes with variance', () async {
      final now = DateTime.now().millisecondsSinceEpoch;

      // 1. Open shift with dual-currency initial float
      final session = CashierSessionEntity(
        id: 'shift-100',
        userId: 'user-cajero',
        terminalId: 'term-main',
        openedAt: now,
        tipoModelo: 'CAJA_CENTRAL',
        openingBalanceNio: 1500.0,
        openingBalanceUsd: 50.0,
        expectedNio: 1500.0,
        expectedUsd: 50.0,
        isClosed: false,
      );

      await database.cashierSessionDao.insertSession(session);

      // Verify active session lookup
      final active = await database.cashierSessionDao.getActiveSession();
      expect(active, isNotNull);
      expect(active!.id, 'shift-100');
      expect(active.openingBalanceNio, 1500.0);
      expect(active.openingBalanceUsd, 50.0);
      expect(active.isClosed, isFalse);

      // 2. Record cash movements (Cash In + Petty Cash Out)
      final movIn = CashMovementEntity(
        id: 'mov-1',
        shiftId: 'shift-100',
        terminalId: 'term-main',
        type: 'CASH_IN',
        amountNio: 500.0,
        amountUsd: 0.0,
        reason: 'Cambio menudo adicional',
        timestamp: now + 1000,
        syncStatus: 'pending',
      );

      final movOut = CashMovementEntity(
        id: 'mov-2',
        shiftId: 'shift-100',
        terminalId: 'term-main',
        type: 'PETTY_CASH',
        amountNio: 120.0,
        amountUsd: 0.0,
        reason: 'Compra de hielo de emergencia',
        authorizedByUserId: 'user-manager',
        timestamp: now + 2000,
        syncStatus: 'pending',
      );

      await database.cashMovementDao.insertMovement(movIn);
      await database.cashMovementDao.insertMovement(movOut);

      final movements = await database.cashMovementDao.getMovementsByShiftId('shift-100');
      expect(movements, hasLength(2));
      expect(movements[0].type, 'CASH_IN');
      expect(movements[0].amountNio, 500.0);
      expect(movements[1].type, 'PETTY_CASH');
      expect(movements[1].amountNio, 120.0);

      // 3. Update shift with new expected cash balances:
      // Expected NIO = 1500 + 500 - 120 = 1880.0
      // Expected USD = 50.0
      // Physical Count: Counted 1850.0 NIO (diff -30.0), Counted 50.0 USD (diff 0.0)
      final closedSession = CashierSessionEntity(
        id: 'shift-100',
        userId: 'user-cajero',
        terminalId: 'term-main',
        openedAt: now,
        closedAt: now + 3600000,
        tipoModelo: 'CAJA_CENTRAL',
        openingBalanceNio: 1500.0,
        openingBalanceUsd: 50.0,
        expectedNio: 1880.0,
        expectedUsd: 50.0,
        closingCountedNio: 1850.0,
        closingCountedUsd: 50.0,
        differenceNio: -30.0,
        differenceUsd: 0.0,
        zReportSequence: 1,
        isClosed: true,
        supervisorId: 'user-manager',
        notes: 'Faltante de 30 córdobas verificado',
      );

      await database.cashierSessionDao.updateSession(closedSession);

      final activeAfterClose = await database.cashierSessionDao.getActiveSession();
      expect(activeAfterClose, isNull);

      final retrievedClosed = await database.cashierSessionDao.getSessionById('shift-100');
      expect(retrievedClosed, isNotNull);
      expect(retrievedClosed!.isClosed, isTrue);
      expect(retrievedClosed.differenceNio, -30.0);
      expect(retrievedClosed.differenceUsd, 0.0);
      expect(retrievedClosed.zReportSequence, 1);
    });

    test('triangulation: handles multiple closed shifts, safe drops, and positive variances (sobrantes)', () async {
      final now = DateTime.now().millisecondsSinceEpoch;

      // Seed 2 previously closed shifts
      await database.cashierSessionDao.insertSession(CashierSessionEntity(
        id: 'shift-past-1',
        userId: 'u1',
        terminalId: 'term-main',
        openedAt: now - 7200000,
        closedAt: now - 3600000,
        openingBalanceNio: 1000.0,
        expectedNio: 1000.0,
        zReportSequence: 1,
        isClosed: true,
      ));

      await database.cashierSessionDao.insertSession(CashierSessionEntity(
        id: 'shift-past-2',
        userId: 'u2',
        terminalId: 'term-main',
        openedAt: now - 3600000,
        closedAt: now - 1800000,
        openingBalanceNio: 1000.0,
        expectedNio: 1000.0,
        zReportSequence: 2,
        isClosed: true,
      ));

      final closedCount = await database.cashierSessionDao.countClosedSessions();
      expect(closedCount, 2);

      // Open 3rd shift with USD float
      await database.cashierSessionDao.insertSession(CashierSessionEntity(
        id: 'shift-current-3',
        userId: 'u3',
        terminalId: 'term-main',
        openedAt: now,
        openingBalanceNio: 2000.0,
        openingBalanceUsd: 100.0,
        expectedNio: 2000.0,
        expectedUsd: 100.0,
        isClosed: false,
      ));

      // Record a SAFE_DROP (transfer of $50 USD to safe)
      await database.cashMovementDao.insertMovement(CashMovementEntity(
        id: 'mov-drop-1',
        shiftId: 'shift-current-3',
        terminalId: 'term-main',
        type: 'SAFE_DROP',
        amountNio: 0.0,
        amountUsd: 50.0,
        reason: 'Retiro parcial de dólares a bóveda',
        authorizedByUserId: 'supervisor-1',
        timestamp: now + 500,
      ));

      // Close shift with a positive variance (Sobrante de C$ 100 NIO y $5 USD)
      // Expected = 2000 NIO, 50 USD
      // Counted = 2100 NIO, 55 USD
      await database.cashierSessionDao.updateSession(CashierSessionEntity(
        id: 'shift-current-3',
        userId: 'u3',
        terminalId: 'term-main',
        openedAt: now,
        closedAt: now + 1000,
        openingBalanceNio: 2000.0,
        openingBalanceUsd: 100.0,
        expectedNio: 2000.0,
        expectedUsd: 50.0,
        closingCountedNio: 2100.0,
        closingCountedUsd: 55.0,
        differenceNio: 100.0,
        differenceUsd: 5.0,
        zReportSequence: (closedCount ?? 0) + 1, // Next is Z=3
        isClosed: true,
      ));

      final allClosed = await database.cashierSessionDao.countClosedSessions();
      expect(allClosed, 3);

      final thirdShift = await database.cashierSessionDao.getSessionById('shift-current-3');
      expect(thirdShift!.zReportSequence, 3);
      expect(thirdShift.differenceNio, 100.0);
      expect(thirdShift.differenceUsd, 5.0);
    });
  });
}
