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

  test(
    'migration76_77 drops the insumo FK so SUB_RECIPE components can be stored, '
    'preserving rows, the unique index and the immutability triggers',
    () async {
      final db = await openDatabase(
        inMemoryDatabasePath,
        version: 49,
        onCreate: (db, version) async {
          await db.execute('CREATE TABLE invoices (id TEXT PRIMARY KEY)');
        },
      );

      await migration49_50.migrate(db);

      await db.insert('authority_insumos', {
        'tenant_id': 'tenant-1',
        'id': 'insumo-1',
        'name': 'Carne Molida',
        'uom': 'g',
      });
      await db.insert('authority_recipe_versions', {
        'tenant_id': 'tenant-1',
        'id': 'ver-1',
        'product_id': 'prod-tacos',
        'version_number': 1,
        'is_active': 1,
        'publication_state': 'PUBLISHED',
        'effective_from': '2026-09-01T00:00:00Z',
        'effective_until': null,
        'yield_quantity': 1.0,
        'technical_shrink_pct': 0.0,
        'published_at': '2026-09-01T00:00:00Z',
        'created_at': '2026-09-01T00:00:00Z',
        'updated_at': '2026-09-01T00:00:00Z',
      });
      await db.insert('authority_recipe_version_components', {
        'tenant_id': 'tenant-1',
        'id': 'comp-direct',
        'version_id': 'ver-1',
        'ordinal': 0,
        'insumo_id': 'insumo-1',
        'gross_quantity': 150.0,
        'technical_shrink_pct': 0.0,
        'ingredient_type': 'INSUMO',
        'component_name': 'Carne',
        'component_uom': 'g',
        'reference_version_id': null,
      });

      await migration76_77.migrate(db);

      // The composite FK on insumo_id is gone: a SUB_RECIPE component names a
      // PRODUCT id, which never has an authority_insumos row (R21 / S18).
      final foreignKeys = await db.rawQuery(
        'PRAGMA foreign_key_list(authority_recipe_version_components)',
      );
      expect(
        foreignKeys
            .map((row) => row['from'] as String)
            .toSet()
            .contains('insumo_id'),
        isFalse,
      );

      // The version_id FK survives: components still hang off a version.
      expect(
        foreignKeys
            .map((row) => row['from'] as String)
            .toSet()
            .contains('version_id'),
        isTrue,
      );

      // Existing rows survive the rebuild byte-for-byte.
      final existing = await db.query(
        'authority_recipe_version_components',
        where: 'tenant_id = ? AND id = ?',
        whereArgs: ['tenant-1', 'comp-direct'],
      );
      expect(existing, hasLength(1));
      expect(existing.first['insumo_id'], 'insumo-1');

      // R21 / S18: the sub-recipe component now stores.
      await db.insert('authority_recipe_version_components', {
        'tenant_id': 'tenant-1',
        'id': 'comp-sub',
        'version_id': 'ver-1',
        'ordinal': 1,
        'insumo_id': 'prod-relleno',
        'gross_quantity': 1.0,
        'technical_shrink_pct': 0.0,
        'ingredient_type': 'SUB_RECIPE',
        'component_name': 'Relleno de Carne Criolla',
        'component_uom': null,
        'reference_version_id': 'ver-relleno-1',
      });
      final subRows = await db.query(
        'authority_recipe_version_components',
        where: 'tenant_id = ? AND id = ?',
        whereArgs: ['tenant-1', 'comp-sub'],
      );
      expect(subRows, hasLength(1));

      // The unique (tenant, version, ordinal) index still bites.
      expect(
        () => db.insert('authority_recipe_version_components', {
          'tenant_id': 'tenant-1',
          'id': 'comp-dup',
          'version_id': 'ver-1',
          'ordinal': 1,
          'insumo_id': 'insumo-1',
          'gross_quantity': 1.0,
          'technical_shrink_pct': 0.0,
          'ingredient_type': 'INSUMO',
          'component_name': 'Duplicado',
        }),
        throwsA(isA<DatabaseException>()),
      );

      // Immutability is still schema-level, not table-name-level leftovers.
      expect(
        () => db.update(
          'authority_recipe_version_components',
          {'gross_quantity': 3.0},
          where: 'id = ?',
          whereArgs: ['comp-sub'],
        ),
        throwsA(isA<DatabaseException>()),
      );
      expect(
        () => db.delete(
          'authority_recipe_version_components',
          where: 'id = ?',
          whereArgs: ['comp-direct'],
        ),
        throwsA(isA<DatabaseException>()),
      );

      await db.close();
    },
  );

  test(
    'migration77_78 adds negative_stock_policy to authority_insumos and insumos with RESTRICT default',
    () async {
      final db = await openDatabase(
        inMemoryDatabasePath,
        version: 77,
        onCreate: (db, version) async {
          await db.execute('''
            CREATE TABLE authority_insumos (
              tenant_id TEXT NOT NULL,
              id TEXT NOT NULL,
              name TEXT NOT NULL,
              uom TEXT NOT NULL,
              PRIMARY KEY (tenant_id, id)
            )
          ''');
          await db.execute('''
            CREATE TABLE insumos (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              consumption_uom TEXT NOT NULL,
              warehouse_id TEXT,
              is_perishable INTEGER NOT NULL,
              stock REAL NOT NULL,
              average_cost REAL NOT NULL,
              par_level REAL,
              stock_min REAL,
              stock_max REAL,
              is_active INTEGER NOT NULL
            )
          ''');
          await db.insert('authority_insumos', {
            'tenant_id': 'tenant-1',
            'id': 'insumo-pre',
            'name': 'Pre Insumo',
            'uom': 'KG',
          });
          await db.insert('insumos', {
            'id': 'insumo-pre',
            'name': 'Pre Insumo',
            'consumption_uom': 'KG',
            'is_perishable': 0,
            'stock': 10.0,
            'average_cost': 50.0,
            'is_active': 1,
          });
        },
      );

      // Run migration 77 -> 78
      await migration77_78.migrate(db);

      // Verify authority_insumos has negative_stock_policy with default 'RESTRICT'
      final authorityColumns = await db.rawQuery('PRAGMA table_info(authority_insumos)');
      final hasAuthorityPolicy = authorityColumns.any(
        (col) => col['name'] == 'negative_stock_policy',
      );
      expect(hasAuthorityPolicy, isTrue);

      final preAuthorityRow = (await db.query(
        'authority_insumos',
        where: 'tenant_id = ? AND id = ?',
        whereArgs: ['tenant-1', 'insumo-pre'],
      )).first;
      expect(preAuthorityRow['negative_stock_policy'], 'RESTRICT');

      // Verify insumos has negative_stock_policy with default 'RESTRICT'
      final insumoColumns = await db.rawQuery('PRAGMA table_info(insumos)');
      final hasInsumoPolicy = insumoColumns.any(
        (col) => col['name'] == 'negative_stock_policy',
      );
      expect(hasInsumoPolicy, isTrue);

      final preInsumoRow = (await db.query(
        'insumos',
        where: 'id = ?',
        whereArgs: ['insumo-pre'],
      )).first;
      expect(preInsumoRow['negative_stock_policy'], 'RESTRICT');

      // Insert new rows with explicit 'ALLOW_TEMPORARY'
      await db.insert('authority_insumos', {
        'tenant_id': 'tenant-1',
        'id': 'insumo-allow',
        'name': 'Allow Insumo',
        'uom': 'KG',
        'negative_stock_policy': 'ALLOW_TEMPORARY',
      });
      final allowAuthRow = (await db.query(
        'authority_insumos',
        where: 'tenant_id = ? AND id = ?',
        whereArgs: ['tenant-1', 'insumo-allow'],
      )).first;
      expect(allowAuthRow['negative_stock_policy'], 'ALLOW_TEMPORARY');

      await db.close();
    },
  );
}
