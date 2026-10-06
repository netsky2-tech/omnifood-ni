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
        '${await databaseFactory.getDatabasesPath()}/modifiers_migration_test.db';
    await databaseFactory.deleteDatabase(dbPath);
  });

  tearDown(() async {
    await databaseFactory.deleteDatabase(dbPath);
  });

  test('migration61_62 creates the four modifier mirror tables', () async {
    final db = await databaseFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: 61,
        onCreate: (database, version) async {},
      ),
    );

    await migration61_62.migrate(db);

    for (final table in [
      'modifier_groups',
      'modifier_options',
      'category_modifier_groups',
      'product_modifier_groups',
    ]) {
      final tables = await db.rawQuery(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='$table'",
      );
      expect(tables, hasLength(1), reason: 'missing table $table');
    }

    final groupColumns =
        (await db.rawQuery('PRAGMA table_info(modifier_groups)'))
            .map((c) => c['name'] as String)
            .toSet();
    expect(
      groupColumns,
      containsAll([
        'id',
        'name',
        'min_selected',
        'max_selected',
        'allow_quantities',
        'sort_order',
        'is_active',
      ]),
    );

    final optionColumns =
        (await db.rawQuery('PRAGMA table_info(modifier_options)'))
            .map((c) => c['name'] as String)
            .toSet();
    expect(
      optionColumns,
      containsAll([
        'id',
        'group_id',
        'name',
        'price_delta',
        'is_default',
        'sort_order',
        'is_active',
      ]),
    );

    final categoryColumns =
        (await db.rawQuery('PRAGMA table_info(category_modifier_groups)'))
            .map((c) => c['name'] as String)
            .toSet();
    expect(
      categoryColumns,
      containsAll([
        'id',
        'catalog_value_id',
        'catalog_code',
        'group_id',
        'sort_order',
      ]),
    );

    final productColumns =
        (await db.rawQuery('PRAGMA table_info(product_modifier_groups)'))
            .map((c) => c['name'] as String)
            .toSet();
    expect(
      productColumns,
      containsAll([
        'id',
        'product_id',
        'group_id',
        'sort_order',
      ]),
    );

    await db.close();
  });

  test('migration61_62 creates the lookup indexes and is re-runnable', () async {
    final db = await databaseFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: 61,
        onCreate: (database, version) async {},
      ),
    );

    await migration61_62.migrate(db);
    // Idempotent: a second run (fresh-install parity) must not fail.
    await migration61_62.migrate(db);

    final indexes = await db.rawQuery(
      "SELECT name FROM sqlite_master WHERE type='index' AND name IN (?, ?, ?)",
      [
        'idx_modifier_options_group_id',
        'idx_category_modifier_groups_catalog_value_id',
        'idx_product_modifier_groups_product_id',
      ],
    );
    final indexNames = indexes.map((row) => row['name'] as String).toSet();
    expect(indexNames, hasLength(3));

    await db.close();
  });
}
