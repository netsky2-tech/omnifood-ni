import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// Round-2 F-5b: the shift snapshots the cashier's display name at open time
/// (`cashier_sessions.cashier_name`), so the Z/X reports render the name as
/// it was at the counter instead of depending on a users-table lookup that
/// silently failed on the re-provisioned S23.
///
/// The column is nullable and permanent: shifts opened before the migration
/// keep null (the data was never recorded) and the reports fall back to the
/// existing id resolver.
void main() {
  late String dbPath;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    dbPath =
        '${await databaseFactory.getDatabasesPath()}/cashier_name_migration_test.db';
    await databaseFactory.deleteDatabase(dbPath);
  });

  tearDown(() async {
    await databaseFactory.deleteDatabase(dbPath);
  });

  /// Minimal version-67 shape of `cashier_sessions`: enough columns to insert
  /// a representative legacy shift. The real v67 schema has more columns, but
  /// the migration only appends `cashier_name`.
  Future<dynamic> openV67Database() async {
    final db = await databaseFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: 67,
        onCreate: (database, version) async {
          await database.execute('''
            CREATE TABLE cashier_sessions (
              id TEXT NOT NULL PRIMARY KEY,
              user_id TEXT NOT NULL,
              terminal_id TEXT NOT NULL DEFAULT 'default-terminal',
              opened_at INTEGER NOT NULL,
              tipo_modelo TEXT NOT NULL DEFAULT 'CAJA_CENTRAL',
              opening_balance_nio REAL NOT NULL DEFAULT 0.0,
              opening_balance_usd REAL NOT NULL DEFAULT 0.0,
              is_closed INTEGER NOT NULL DEFAULT 0,
              sync_status TEXT NOT NULL DEFAULT 'pending'
            )
          ''');
        },
      ),
    );
    await db.insert('cashier_sessions', {
      'id': 'legacy-shift-1',
      'user_id': 'user-cajero-1',
      'opened_at': 1716000000000,
      'is_closed': 0,
      'sync_status': 'pending',
    });
    return db;
  }

  test('migration67_68 adds the nullable cashier_name column', () async {
    final db = await openV67Database();

    await migration67_68.migrate(db);

    final columns = await db.rawQuery('PRAGMA table_info(cashier_sessions)');
    final colNames = columns.map((c) => c['name'] as String).toSet();
    expect(colNames, contains('cashier_name'));

    final column = columns.firstWhere((c) => c['name'] == 'cashier_name');
    // Nullable is mandatory: no NOT NULL, no default. Existing rows keep
    // nulls forever (no backfill — the data was never recorded).
    expect(column['notnull'], 0, reason: 'cashier_name');
    expect(column['dflt_value'], isNull, reason: 'cashier_name');

    await db.close();
  });

  test('migration67_68 keeps pre-existing shifts with a null snapshot',
      () async {
    final db = await openV67Database();

    await migration67_68.migrate(db);

    final rows =
        await db.rawQuery('SELECT * FROM cashier_sessions WHERE id = ?',
            ['legacy-shift-1']);
    expect(rows, hasLength(1));
    expect(
      rows.single['cashier_name'],
      isNull,
      reason: 'historical shifts cannot be backfilled; the reports fall back '
          'to the existing id resolver for them',
    );

    await db.close();
  });

  test('migration67_68 is idempotent on an already-migrated database', () async {
    final db = await openV67Database();

    await migration67_68.migrate(db);
    await migration67_68.migrate(db);

    final columns = await db.rawQuery('PRAGMA table_info(cashier_sessions)');
    final nameColumns =
        columns.where((c) => c['name'] == 'cashier_name').toList();
    expect(
      nameColumns,
      hasLength(1),
      reason: 'the guarded ALTER must not duplicate the column',
    );

    await db.close();
  });
}
