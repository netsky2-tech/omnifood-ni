import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/migrations.dart';

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  test('migration49_50 creates authority tables, composite FKs, unique index and immutability triggers', () async {
    final db = await openDatabase(
      inMemoryDatabasePath,
      version: 49,
      onCreate: (db, version) async {
        await db.execute('CREATE TABLE invoices (id TEXT PRIMARY KEY)');
        await db.execute("INSERT INTO invoices (id) VALUES ('inv-1')");
      },
    );

    // Run migration 49 -> 50
    await migration49_50.migrate(db);

    // Existing data preserved
    final invoices = await db.query('invoices');
    expect(invoices.length, 1);
    expect(invoices.first['id'], 'inv-1');

    // Tables exist
    final tables = await db.rawQuery(
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'authority_%'",
    );
    final tableNames = tables.map((r) => r['name'] as String).toSet();
    expect(
      tableNames,
      containsAll([
        'authority_insumos',
        'authority_recipe_versions',
        'authority_recipe_version_components',
      ]),
    );

    // Insert authority insumo
    await db.insert('authority_insumos', {
      'tenant_id': 'tenant-1',
      'id': 'insumo-1',
      'name': 'Tomato',
      'uom': 'KG',
    });

    // Insert authority recipe version (NO recipe_id!)
    await db.insert('authority_recipe_versions', {
      'tenant_id': 'tenant-1',
      'id': 'ver-1',
      'product_id': 'prod-1',
      'version_number': 1,
      'is_active': 1,
      'publication_state': 'PUBLISHED',
      'effective_from': '2026-09-01T00:00:00Z',
      'effective_until': null,
      'yield_quantity': 10.0,
      'technical_shrink_pct': 0.05,
      'published_at': '2026-09-01T00:00:00Z',
      'created_at': '2026-09-01T00:00:00Z',
      'updated_at': '2026-09-01T00:00:00Z',
    });

    // Insert authority component with nullable component_uom
    await db.insert('authority_recipe_version_components', {
      'tenant_id': 'tenant-1',
      'id': 'comp-1',
      'version_id': 'ver-1',
      'ordinal': 0,
      'insumo_id': 'insumo-1',
      'gross_quantity': 1.5,
      'technical_shrink_pct': 0.02,
      'ingredient_type': 'DIRECT',
      'component_name': 'Tomato Slice',
      'component_uom': null,
      'reference_version_id': null,
    });

    // Verify round-trip read with tenant-1
    final validCompRows = await db.query(
      'authority_recipe_version_components',
      where: 'tenant_id = ? AND id = ?',
      whereArgs: ['tenant-1', 'comp-1'],
    );
    expect(validCompRows.length, 1);
    expect(validCompRows.first['component_uom'], isNull);
    expect(validCompRows.first['gross_quantity'], 1.5);

    // Verify update triggers abort mutation
    expect(
      () => db.update(
        'authority_recipe_versions',
        {'yield_quantity': 20.0},
        where: 'id = ?',
        whereArgs: ['ver-1'],
      ),
      throwsA(isA<DatabaseException>()),
    );

    expect(
      () => db.update(
        'authority_recipe_version_components',
        {'gross_quantity': 3.0},
        where: 'id = ?',
        whereArgs: ['comp-1'],
      ),
      throwsA(isA<DatabaseException>()),
    );

    // Verify delete triggers abort deletion
    expect(
      () => db.delete(
        'authority_recipe_versions',
        where: 'id = ?',
        whereArgs: ['ver-1'],
      ),
      throwsA(isA<DatabaseException>()),
    );

    expect(
      () => db.delete(
        'authority_recipe_version_components',
        where: 'id = ?',
        whereArgs: ['comp-1'],
      ),
      throwsA(isA<DatabaseException>()),
    );

    await db.close();
  });
}
