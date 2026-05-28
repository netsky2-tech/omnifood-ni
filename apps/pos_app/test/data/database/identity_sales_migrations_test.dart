import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  late String dbPath;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    dbPath = '${await databaseFactory.getDatabasesPath()}/identity_sales_migrations_test.db';
    await databaseFactory.deleteDatabase(dbPath);
  });

  tearDown(() async {
    await databaseFactory.deleteDatabase(dbPath);
  });

  test('migration11_12 creates security_profiles table', () async {
    final db = await databaseFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(version: 11, onCreate: (database, version) async {}),
    );

    await migration11_12.migrate(db);

    final table = await db.rawQuery(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='security_profiles'",
    );
    expect(table, isNotEmpty);

    await db.close();
  });

  test('migration12_13 defaults active legacy sessions to CAJA_CENTRAL', () async {
    final db = await databaseFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(version: 12, onCreate: (database, version) async {
        await database.execute('''
          CREATE TABLE cashier_sessions (
            id TEXT NOT NULL PRIMARY KEY,
            user_id TEXT NOT NULL,
            opened_at INTEGER NOT NULL,
            closed_at INTEGER,
            opening_balance REAL NOT NULL,
            closing_balance REAL,
            total_sales REAL,
            total_expected REAL,
            is_closed INTEGER NOT NULL
          )
        ''');
      }),
    );

    await db.insert('cashier_sessions', {
      'id': 'session-1',
      'user_id': 'u-1',
      'opened_at': DateTime.now().millisecondsSinceEpoch,
      'closed_at': null,
      'opening_balance': 100.0,
      'closing_balance': null,
      'total_sales': null,
      'total_expected': null,
      'is_closed': 0,
    });

    await migration12_13.migrate(db);

    final rows = await db.query('cashier_sessions', where: 'id = ?', whereArgs: ['session-1']);
    expect(rows.single['tipo_modelo'], equals('CAJA_CENTRAL'));

    await db.close();
  });
}
