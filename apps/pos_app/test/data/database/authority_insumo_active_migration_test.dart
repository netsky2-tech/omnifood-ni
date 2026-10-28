import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// R28 (M4.1) — the local migration 79→80: the authority insumo's ACTIVE
/// state.
///
/// The entity grew `isActive` in M4.1 but NO migration carried it, so a
/// terminal already at schema 76 kept the old table shape and EVERY insert
/// into `authority_insumos` failed with
/// "table authority_insumos has no column named isActive" — the whole
/// authority projection stayed empty. A fresh install hid the defect
/// (Floor creates the table from the entity); only an upgrade exposed it.
///
/// Two properties are load-bearing:
///  1. The column exists and defaults to ACTIVE, so a row delivered before
///     the state was known keeps working.
///  2. The migration is IDEMPOTENT: a table that already has the column is
///     left alone (the PRAGMA guard), so a device that received the column
///     from a fresh install is not broken by the upgrade.
void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  Future<Database> openVersion79({bool withColumn = false}) async {
    return openDatabase(
      inMemoryDatabasePath,
      version: 79,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE authority_insumos (
            tenant_id TEXT NOT NULL,
            id TEXT NOT NULL,
            name TEXT NOT NULL,
            uom TEXT NOT NULL,
            negative_stock_policy TEXT NOT NULL DEFAULT 'RESTRICT',
            ${withColumn ? 'isActive INTEGER NOT NULL DEFAULT 1,' : ''}
            PRIMARY KEY (tenant_id, id)
          )
        ''');
      },
    );
  }

  test(
    'migration79_80 adds the isActive column to authority_insumos with the '
    'active default',
    () async {
      final db = await openVersion79();

      final before = await db.rawQuery('PRAGMA table_info(authority_insumos)');
      expect(
        before.map((c) => c['name'] as String).toSet(),
        isNot(contains('isActive')),
        reason: 'the defect under repair: the column did not exist',
      );

      await migration79_80.migrate(db);

      final after = await db.rawQuery('PRAGMA table_info(authority_insumos)');
      final column = after.firstWhere((c) => c['name'] == 'isActive');
      expect(column['notnull'], 1);
      expect(column['dflt_value'], '1');

      await db.close();
    },
  );

  test('migration79_80 keeps the rows and marks them active', () async {
    final db = await openVersion79();
    await db.insert('authority_insumos', {
      'tenant_id': 'tenant-alpha',
      'id': 'ins-1',
      'name': 'Leche Entera',
      'uom': 'ml',
      'negative_stock_policy': 'RESTRICT',
    });

    await migration79_80.migrate(db);

    final rows = await db.query('authority_insumos');
    expect(rows, hasLength(1));
    expect(rows.single['isActive'], 1);
    expect(rows.single['name'], 'Leche Entera');

    await db.close();
  });

  test('migration79_80 is idempotent on a table that already has the column',
      () async {
    final db = await openVersion79(withColumn: true);
    await db.insert('authority_insumos', {
      'tenant_id': 'tenant-alpha',
      'id': 'ins-1',
      'name': 'Leche Entera',
      'uom': 'ml',
      'negative_stock_policy': 'RESTRICT',
      'isActive': 0,
    });

    await migration79_80.migrate(db);

    final rows = await db.query('authority_insumos');
    expect(rows.single['isActive'], 0,
        reason: 'the migration must not touch a state it did not write');

    await db.close();
  });
}
