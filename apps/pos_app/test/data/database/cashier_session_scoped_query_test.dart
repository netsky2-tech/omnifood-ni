import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// B1a-4 (D-11): the open-session lookup must be scoped to BOTH the
/// requesting user and the terminal. The pre-existing `getActiveSession()`
/// returns any open session (`WHERE is_closed = 0 LIMIT 1`), which would let
/// two concurrent registers bind a cashier's invoice to another cashier's
/// shift.
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

  CashierSessionEntity openSession(
    String id,
    String userId,
    String terminalId,
  ) =>
      CashierSessionEntity(
        id: id,
        userId: userId,
        terminalId: terminalId,
        openedAt: DateTime.parse('2026-02-01T08:00:00Z').millisecondsSinceEpoch,
        isClosed: false,
      );

  test(
      'returns the requesting user and terminal session when two are open concurrently',
      () async {
    await database.cashierSessionDao
        .insertSession(openSession('shift-a', 'cashier-a', 'term-1'));
    await database.cashierSessionDao
        .insertSession(openSession('shift-b', 'cashier-b', 'term-2'));

    final forA = await database.cashierSessionDao
        .getActiveSessionForUserAndTerminal('cashier-a', 'term-1');
    expect(forA, isNotNull);
    expect(forA!.id, 'shift-a');

    final forB = await database.cashierSessionDao
        .getActiveSessionForUserAndTerminal('cashier-b', 'term-2');
    expect(forB, isNotNull);
    expect(forB!.id, 'shift-b');
  });

  test('does not match a session of another user on the same terminal',
      () async {
    await database.cashierSessionDao
        .insertSession(openSession('shift-a', 'cashier-a', 'term-1'));

    final result = await database.cashierSessionDao
        .getActiveSessionForUserAndTerminal('cashier-b', 'term-1');
    expect(result, isNull);
  });

  test('does not match a session of the same user on another terminal',
      () async {
    await database.cashierSessionDao
        .insertSession(openSession('shift-a', 'cashier-a', 'term-1'));

    final result = await database.cashierSessionDao
        .getActiveSessionForUserAndTerminal('cashier-a', 'term-2');
    expect(result, isNull);
  });

  test('does not return a closed session', () async {
    await database.cashierSessionDao.insertSession(
      CashierSessionEntity(
        id: 'shift-closed',
        userId: 'cashier-a',
        terminalId: 'term-1',
        openedAt:
            DateTime.parse('2026-02-01T08:00:00Z').millisecondsSinceEpoch,
        closedAt:
            DateTime.parse('2026-02-01T17:00:00Z').millisecondsSinceEpoch,
        isClosed: true,
      ),
    );

    final result = await database.cashierSessionDao
        .getActiveSessionForUserAndTerminal('cashier-a', 'term-1');
    expect(result, isNull);
  });

  test('returns null when no matching open session exists', () async {
    final result = await database.cashierSessionDao
        .getActiveSessionForUserAndTerminal('nobody', 'term-9');
    expect(result, isNull);
  });
}
