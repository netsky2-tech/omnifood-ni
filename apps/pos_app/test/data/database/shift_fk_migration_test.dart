import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// B1a-4 (D-11): the upgrade path that gives `invoices` real shift (turno)
/// membership via `migration54_55`.
///
/// The column is nullable and permanent: historical rows cannot be backfilled
/// because the data was never recorded (D-9, owner-accepted).
void main() {
  late String dbPath;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    dbPath =
        '${await databaseFactory.getDatabasesPath()}/shift_fk_migration_test.db';
    await databaseFactory.deleteDatabase(dbPath);
  });

  tearDown(() async {
    await databaseFactory.deleteDatabase(dbPath);
  });

  /// Minimal version-54 shape of `invoices`: enough fiscal columns to insert
  /// a representative legacy row. The real v54 schema has more columns, but
  /// the migration only appends `shift_id` and an index.
  Future<dynamic> openV54Database() async {
    final db = await databaseFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: 54,
        onCreate: (database, version) async {
          await database.execute('''
            CREATE TABLE invoices (
              id TEXT NOT NULL PRIMARY KEY,
              invoice_number TEXT NOT NULL,
              created_at INTEGER NOT NULL,
              user_id TEXT NOT NULL,
              subtotal REAL NOT NULL,
              total_tax REAL NOT NULL,
              total REAL NOT NULL,
              is_canceled INTEGER NOT NULL,
              sync_status TEXT NOT NULL,
              payment_status TEXT NOT NULL,
              type TEXT NOT NULL,
              global_tax_override INTEGER NOT NULL,
              bcn_official_rate REAL NOT NULL,
              commercial_rate REAL NOT NULL,
              total_usd REAL NOT NULL
            )
          ''');
        },
      ),
    );
    await db.insert('invoices', {
      'id': 'legacy-invoice-1',
      'invoice_number': '001-001-01-00000001',
      'created_at': DateTime.parse('2026-01-15T10:00:00Z')
          .millisecondsSinceEpoch,
      'user_id': 'cashier-legacy',
      'subtotal': 100.0,
      'total_tax': 15.0,
      'total': 115.0,
      'is_canceled': 0,
      'sync_status': 'synced',
      'payment_status': 'paid',
      'type': 'regular',
      'global_tax_override': 0,
      'bcn_official_rate': 36.6241,
      'commercial_rate': 36.50,
      'total_usd': 3.15,
    });
    return db;
  }

  test('migration54_55 adds the nullable shift_id and local_issue_date columns',
      () async {
    final db = await openV54Database();

    await migration54_55.migrate(db);

    final columns = await db.rawQuery('PRAGMA table_info(invoices)');
    final colNames = columns.map((c) => c['name'] as String).toSet();
    expect(colNames, contains('shift_id'));
    expect(colNames, contains('local_issue_date'));
    expect(colNames, contains('fiscal_header_snapshot'));

    for (final name in ['shift_id', 'local_issue_date', 'fiscal_header_snapshot']) {
      final column = columns.firstWhere((c) => c['name'] == name);
      // Nullable is mandatory: no NOT NULL, no default. Existing rows keep
      // nulls forever (no backfill, #526 AC-11).
      expect(column['notnull'], 0, reason: name);
      expect(column['dflt_value'], isNull, reason: name);
    }

    await db.close();
  });

  test('migration54_55 leaves pre-existing invoices with a null shiftId',
      () async {
    final db = await openV54Database();

    await migration54_55.migrate(db);

    final rows = await db.query(
      'invoices',
      where: 'id = ?',
      whereArgs: ['legacy-invoice-1'],
    );
    expect(rows, hasLength(1));
    expect(rows.first['shift_id'], isNull);

    await db.close();
  });

  test('migration54_55 creates the shift_id and local_issue_date lookup indexes',
      () async {
    final db = await openV54Database();

    await migration54_55.migrate(db);

    final indexes = await db.rawQuery(
      "SELECT name FROM sqlite_master WHERE type = 'index' "
      "AND tbl_name = 'invoices'",
    );
    final indexNames = indexes.map((row) => row['name'] as String).toSet();
    expect(indexNames, contains('idx_invoices_shift_id'));
    expect(indexNames, contains('idx_invoices_local_issue_date'));

    await db.close();
  });

  test('migration54_55 is safe to re-run (guarded ADD COLUMN)', () async {
    final db = await openV54Database();

    await migration54_55.migrate(db);
    await migration54_55.migrate(db);

    final columns = await db.rawQuery('PRAGMA table_info(invoices)');
    final shiftColumns =
        columns.where((c) => c['name'] == 'shift_id').toList();
    expect(shiftColumns, hasLength(1));

    await db.close();
  });

  // #548 regression: the first migration54_55 draft assumed `invoices`
  // exists on every upgrade path and crashed on synthetic legacy schemas
  // (e.g. the sync_service regression DB, which opens at version 24 with
  // only the tables it needs). Direction 2 of the guard: with the table
  // absent, the migration completes and creates NOTHING.
  test(
      'migration54_55 completes without throwing when invoices does not exist',
      () async {
    final legacyPath =
        '${await databaseFactory.getDatabasesPath()}/shift_fk_no_invoices_test.db';
    await databaseFactory.deleteDatabase(legacyPath);
    final db = await databaseFactory.openDatabase(
      legacyPath,
      options: OpenDatabaseOptions(
        version: 54,
        onCreate: (database, version) async {
          // Synthetic legacy schema: no invoices table at all.
          await database.execute(
            'CREATE TABLE purchases (id TEXT NOT NULL PRIMARY KEY)',
          );
        },
      ),
    );

    await migration54_55.migrate(db);

    final tables = await db.rawQuery(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    );
    final tableNames = tables.map((row) => row['name'] as String).toSet();
    expect(tableNames, isNot(contains('invoices')));
    expect(tableNames, contains('purchases'));

    await db.close();
    await databaseFactory.deleteDatabase(legacyPath);
  });
}
