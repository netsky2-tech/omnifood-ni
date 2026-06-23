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
        '${await databaseFactory.getDatabasesPath()}/catalog_migration_test.db';
    await databaseFactory.deleteDatabase(dbPath);
  });

  tearDown(() async {
    await databaseFactory.deleteDatabase(dbPath);
  });

  test('migration20_21 creates catalog_values table and seeds defaults', () async {
    final db = await databaseFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(version: 20, onCreate: (database, version) async {}),
    );

    await migration20_21.migrate(db);

    final table = await db.rawQuery(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='catalog_values'",
    );
    expect(table, isNotEmpty);

    final uomRows = await db.rawQuery(
      "SELECT code FROM catalog_values WHERE catalog_type = 'UOM' ORDER BY sort_order ASC",
    );
    // Seed mirrors DEFAULT_CATALOG_SEED.UOM (14 entries).
    expect(uomRows.length, 14);
    expect(uomRows.first['code'], 'kg');
    expect(uomRows.map((r) => r['code']).toList(), containsAll(<String>['kg', 'g', 'lb', 'l', 'gal', 'un']));

    final productTypes = await db.rawQuery(
      "SELECT code FROM catalog_values WHERE catalog_type = 'SALES_PRODUCT_TYPE' ORDER BY sort_order ASC",
    );
    expect(productTypes.map((r) => r['code']).toList(), ['PREPARADO', 'REVENTA']);

    final categories = await db.rawQuery(
      "SELECT COUNT(*) AS n FROM catalog_values WHERE catalog_type = 'SALES_PRODUCT_CATEGORY'",
    );
    expect(categories.first['n'], 8);

    await db.close();
  });

  test('migration20_21 is idempotent (re-running does not duplicate seed rows)', () async {
    final db = await databaseFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(version: 20, onCreate: (database, version) async {}),
    );

    await migration20_21.migrate(db);
    await migration20_21.migrate(db);

    final count = await db.rawQuery('SELECT COUNT(*) AS n FROM catalog_values');
    // 14 UOM + 9 inventory categories + 3 inventory types + 8 sales categories + 2 sales types = 36
    expect(count.first['n'], 36);

    await db.close();
  });
}
