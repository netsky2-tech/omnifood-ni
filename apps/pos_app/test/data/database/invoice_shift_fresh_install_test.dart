import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// B1a-4 (D-11): fresh installs get the `shift_id` column on `invoices`
/// straight from the Floor-generated DDL, including the foreign key to
/// `cashier_sessions`. The migration path cannot add the FK (see
/// migration54_55); this file pins the fresh-install contract so the two
/// paths stay comparable.
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

  test('onCreate gives invoices a nullable shift_id column', () async {
    final db = database.database;
    final columns = await db.rawQuery('PRAGMA table_info(invoices)');
    final colNames = columns.map((c) => c['name'] as String).toSet();
    expect(colNames, contains('shift_id'));

    final shiftColumn = columns.firstWhere((c) => c['name'] == 'shift_id');
    expect(shiftColumn['notnull'], 0);
    expect(shiftColumn['dflt_value'], isNull);
  });

  test('onCreate declares the shift_id foreign key to cashier_sessions',
      () async {
    final db = database.database;
    final tables = await db.rawQuery(
      "SELECT sql FROM sqlite_master WHERE type = 'table' "
      "AND name = 'invoices'",
    );
    final createSql = tables.first['sql'] as String;
    expect(
      createSql,
      contains(
        'FOREIGN KEY (`shift_id`) REFERENCES `cashier_sessions` (`id`)',
      ),
    );
    // NO_ACTION on update and delete is part of the B1a-4 contract: any
    // cascading write to invoices would violate the fiscal append-only
    // policy (#526 AC-11).
    expect(createSql, contains('ON DELETE NO ACTION'));
  });

  test('onCreate creates the shift_id lookup index', () async {
    final db = database.database;
    final indexes = await db.rawQuery(
      "SELECT name FROM sqlite_master WHERE type = 'index' "
      "AND tbl_name = 'invoices'",
    );
    final indexNames = indexes.map((row) => row['name'] as String).toSet();
    expect(indexNames, contains('idx_invoices_shift_id'));
  });
}
