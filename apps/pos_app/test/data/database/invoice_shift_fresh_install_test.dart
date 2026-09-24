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

  test('onCreate gives invoices nullable shift_id and local_issue_date columns',
      () async {
    final db = database.database;
    final columns = await db.rawQuery('PRAGMA table_info(invoices)');
    final colNames = columns.map((c) => c['name'] as String).toSet();
    expect(colNames, contains('shift_id'));
    expect(colNames, contains('local_issue_date'));
    expect(colNames, contains('fiscal_header_snapshot'));

    for (final name in ['shift_id', 'local_issue_date', 'fiscal_header_snapshot']) {
      final column = columns.firstWhere((c) => c['name'] == name);
      expect(column['notnull'], 0, reason: name);
      expect(column['dflt_value'], isNull, reason: name);
    }
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
    expect(indexNames, contains('idx_invoices_local_issue_date'));
  });
}
