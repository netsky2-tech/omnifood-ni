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
    dbPath =
        '${await databaseFactory.getDatabasesPath()}/identity_sales_migrations_test.db';
    await databaseFactory.deleteDatabase(dbPath);
  });

  tearDown(() async {
    await databaseFactory.deleteDatabase(dbPath);
  });

  test('migration11_12 creates security_profiles table', () async {
    final db = await databaseFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: 11,
        onCreate: (database, version) async {},
      ),
    );

    await migration11_12.migrate(db);

    final table = await db.rawQuery(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='security_profiles'",
    );
    expect(table, isNotEmpty);

    await db.close();
  });

  test(
    'migration12_13 defaults active legacy sessions to CAJA_CENTRAL',
    () async {
      final db = await databaseFactory.openDatabase(
        dbPath,
        options: OpenDatabaseOptions(
          version: 12,
          onCreate: (database, version) async {
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
          },
        ),
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

      final rows = await db.query(
        'cashier_sessions',
        where: 'id = ?',
        whereArgs: ['session-1'],
      );
      expect(rows.single['tipo_modelo'], equals('CAJA_CENTRAL'));

      await db.close();
    },
  );

  test('migration21_22 adds recipe_version_id idempotently', () async {
    final db = await databaseFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: 21,
        onCreate: (database, version) async {
          await database.execute('''
          CREATE TABLE invoice_items (
            id TEXT NOT NULL PRIMARY KEY,
            invoice_id TEXT NOT NULL,
            product_id TEXT NOT NULL
          )
        ''');
        },
      ),
    );

    await migration21_22.migrate(db);
    await migration21_22.migrate(db);

    final columns = await db.rawQuery('PRAGMA table_info(invoice_items)');
    expect(
      columns.where((column) => column['name'] == 'recipe_version_id'),
      hasLength(1),
    );

    await db.close();
  });

  test(
    'migration22_23 moves movement sync state out of inventory_movements',
    () async {
      final db = await databaseFactory.openDatabase(
        dbPath,
        options: OpenDatabaseOptions(
          version: 22,
          onConfigure: (database) async {
            await database.execute('PRAGMA foreign_keys = ON');
          },
          onCreate: (database, version) async {
            await database.execute('''
            CREATE TABLE inventory_movements (
              id TEXT NOT NULL PRIMARY KEY,
              insumo_id TEXT NOT NULL,
              type TEXT NOT NULL,
              quantity REAL NOT NULL,
              previous_stock REAL NOT NULL,
              new_stock REAL NOT NULL,
              timestamp TEXT NOT NULL,
              reason TEXT,
              user_id TEXT,
              is_synced INTEGER NOT NULL DEFAULT 0,
              batch_deductions TEXT
            )
          ''');
          },
        ),
      );

      await db.insert('inventory_movements', {
        'id': 'mov-pending',
        'insumo_id': 'ins-1',
        'type': 'SALE',
        'quantity': -1.0,
        'previous_stock': 5.0,
        'new_stock': 4.0,
        'timestamp': '2026-06-30T12:00:00.000Z',
        'is_synced': 0,
      });
      await db.insert('inventory_movements', {
        'id': 'mov-synced',
        'insumo_id': 'ins-1',
        'type': 'SALE',
        'quantity': -2.0,
        'previous_stock': 4.0,
        'new_stock': 2.0,
        'timestamp': '2026-06-30T12:01:00.000Z',
        'is_synced': 1,
      });
      await db.insert('inventory_movements', {
        'id': 'mov-failed',
        'insumo_id': 'ins-1',
        'type': 'SALE',
        'quantity': -1.0,
        'previous_stock': 2.0,
        'new_stock': 1.0,
        'timestamp': '2026-06-30T12:02:00.000Z',
        'is_synced': -1,
      });

      final foreignKeysEnabled = await db.rawQuery('PRAGMA foreign_keys');

      await migration22_23.migrate(db);

      final movementColumns = await db.rawQuery(
        'PRAGMA table_info(inventory_movements)',
      );
      final foreignKeyViolations = await db.rawQuery(
        'PRAGMA foreign_key_check',
      );
      final syncRows = await db.query(
        'inventory_movement_sync_state',
        orderBy: 'movement_id ASC',
      );

      expect(foreignKeysEnabled.single['foreign_keys'], 1);
      expect(
        movementColumns.where((column) => column['name'] == 'is_synced'),
        isEmpty,
      );
      expect(foreignKeyViolations, isEmpty);
      expect(syncRows, hasLength(2));
      expect(syncRows[0]['movement_id'], 'mov-failed');
      expect(syncRows[0]['sync_status'], 'failed');
      expect(syncRows[1]['movement_id'], 'mov-synced');
      expect(syncRows[1]['sync_status'], 'synced');

      await expectLater(
        db.rawUpdate('UPDATE inventory_movements SET reason = ? WHERE id = ?', [
          'tampered',
          'mov-pending',
        ]),
        throwsA(isA<Exception>()),
      );

      await db.close();
    },
  );
}
