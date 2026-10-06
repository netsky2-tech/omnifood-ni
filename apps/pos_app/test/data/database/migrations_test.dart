import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// Batch 7 Slice 2 (PRD §21 / Architecture Spec §33.4 / AD-10): the upgrade
/// path that gives `invoices` the voluntary tip snapshot columns via
/// `migration56_57`.
///
/// The columns are nullable and permanent: historical rows cannot be
/// backfilled because no tip was captured at issuance (same policy as
/// shift_id, #526 AC-11 forbids fabricating fiscal facts).
void main() {
  late String dbPath;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    dbPath =
        '${await databaseFactory.getDatabasesPath()}/tip_migration_test.db';
    await databaseFactory.deleteDatabase(dbPath);
  });

  tearDown(() async {
    await databaseFactory.deleteDatabase(dbPath);
  });

  /// Minimal version-56 shape of `invoices`: enough fiscal columns to insert
  /// a representative legacy row. The real v56 schema has more columns, but
  /// the migration only appends the four nullable tip columns.
  Future<dynamic> openV56Database() async {
    final db = await databaseFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: 56,
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
              global_tax_override INTEGER NOT NULL
            )
          ''');
        },
      ),
    );
    await db.insert('invoices', {
      'id': 'legacy-invoice-1',
      'invoice_number': '001-001-01-00000001',
      'created_at':
          DateTime.parse('2026-01-15T10:00:00Z').millisecondsSinceEpoch,
      'user_id': 'cashier-legacy',
      'subtotal': 100.0,
      'total_tax': 15.0,
      'total': 115.0,
      'is_canceled': 0,
      'sync_status': 'synced',
      'payment_status': 'paid',
      'type': 'regular',
      'global_tax_override': 0,
    });
    return db;
  }

  const tipColumns = [
    'tip_amount_nio',
    'tip_amount_usd',
    'tip_percentage',
    'tip_eligible_base_nio',
  ];

  test('migration56_57 adds the four nullable tip columns to invoices',
      () async {
    final db = await openV56Database();

    await migration56_57.migrate(db);

    final columns = await db.rawQuery('PRAGMA table_info(invoices)');
    final colNames = columns.map((c) => c['name'] as String).toSet();
    for (final name in tipColumns) {
      expect(colNames, contains(name), reason: name);
    }

    // Nullable is mandatory: no NOT NULL, no default. Existing rows keep
    // nulls forever (no backfill, #526 AC-11).
    for (final name in tipColumns) {
      final column = columns.firstWhere((c) => c['name'] == name);
      expect(column['notnull'], 0, reason: name);
      expect(column['dflt_value'], isNull, reason: name);
    }

    await db.close();
  });

  test('migration56_57 leaves pre-existing invoices intact with null tips',
      () async {
    final db = await openV56Database();

    await migration56_57.migrate(db);

    final rows = await db.query(
      'invoices',
      where: 'id = ?',
      whereArgs: ['legacy-invoice-1'],
    );
    expect(rows, hasLength(1));
    final row = rows.first;
    // The legacy fiscal record is untouched; the new columns read as null.
    expect(row['subtotal'], 100.0);
    expect(row['total'], 115.0);
    expect(row['invoice_number'], '001-001-01-00000001');
    for (final name in tipColumns) {
      expect(row[name], isNull, reason: name);
    }

    await db.close();
  });

  test('migration56_57 accepts new rows with tip values after the upgrade',
      () async {
    final db = await openV56Database();

    await migration56_57.migrate(db);

    await db.insert('invoices', {
      'id': 'tipped-invoice-1',
      'invoice_number': '001-001-01-00000002',
      'created_at':
          DateTime.parse('2026-01-15T11:00:00Z').millisecondsSinceEpoch,
      'user_id': 'cashier-legacy',
      'subtotal': 100.0,
      'total_tax': 0.0,
      'total': 100.0,
      'is_canceled': 0,
      'sync_status': 'pending',
      'payment_status': 'paid',
      'type': 'regular',
      'global_tax_override': 0,
      'tip_amount_nio': 10.0,
      'tip_amount_usd': 0.27,
      'tip_percentage': 10.0,
      'tip_eligible_base_nio': 100.0,
    });

    final rows = await db.query(
      'invoices',
      where: 'id = ?',
      whereArgs: ['tipped-invoice-1'],
    );
    expect(rows, hasLength(1));
    expect(rows.first['tip_amount_nio'], 10.0);
    expect(rows.first['tip_amount_usd'], 0.27);
    expect(rows.first['tip_percentage'], 10.0);
    expect(rows.first['tip_eligible_base_nio'], 100.0);

    await db.close();
  });

  test('migration56_57 is safe to re-run (guarded ADD COLUMN)', () async {
    final db = await openV56Database();

    await migration56_57.migrate(db);
    await migration56_57.migrate(db);

    final columns = await db.rawQuery('PRAGMA table_info(invoices)');
    for (final name in tipColumns) {
      final matches = columns.where((c) => c['name'] == name).toList();
      expect(matches, hasLength(1), reason: name);
    }

    await db.close();
  });

  // Same guard direction as migration54_55 (#548): with the `invoices` table
  // absent (synthetic legacy schemas, e.g. the sync_service regression DB),
  // the migration completes and creates NOTHING.
  test(
      'migration56_57 completes without throwing when invoices does not exist',
      () async {
    final legacyPath =
        '${await databaseFactory.getDatabasesPath()}/tip_no_invoices_test.db';
    await databaseFactory.deleteDatabase(legacyPath);
    final db = await databaseFactory.openDatabase(
      legacyPath,
      options: OpenDatabaseOptions(
        version: 56,
        onCreate: (database, version) async {
          await database.execute(
            'CREATE TABLE purchases (id TEXT NOT NULL PRIMARY KEY)',
          );
        },
      ),
    );

    await migration56_57.migrate(db);

    final tables = await db.rawQuery(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    );
    final tableNames = tables.map((row) => row['name'] as String).toSet();
    expect(tableNames, isNot(contains('invoices')));
    expect(tableNames, contains('purchases'));

    await db.close();
    await databaseFactory.deleteDatabase(legacyPath);
  });

  // T0.5c: minimal version-60 shape of `products` — enough columns to insert
  // a representative legacy row. The migration only appends the nullable
  // category_id column (resolved catalog_values.id carried by the cloud
  // product delta).
  Future<dynamic> openV60Database() async {
    final db = await databaseFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: 60,
        onCreate: (database, version) async {
          await database.execute('''
            CREATE TABLE products (
              id TEXT NOT NULL PRIMARY KEY,
              name TEXT NOT NULL,
              uom TEXT NOT NULL,
              stock REAL NOT NULL,
              average_cost REAL NOT NULL,
              sell_price REAL NOT NULL,
              is_active INTEGER NOT NULL,
              category TEXT,
              is_prepared INTEGER NOT NULL,
              product_type TEXT NOT NULL,
              tax_rate REAL NOT NULL,
              is_tax_exempt INTEGER NOT NULL
            )
          ''');
        },
      ),
    );
    await db.insert('products', {
      'id': 'prod-legacy-1',
      'name': 'Café Legacy',
      'uom': 'UND',
      'stock': 10.0,
      'average_cost': 5.0,
      'sell_price': 20.0,
      'is_active': 1,
      'category': 'Bebidas',
      'is_prepared': 0,
      'product_type': 'SIMPLE',
      'tax_rate': 0.0,
      'is_tax_exempt': 1,
    });
    return db;
  }

  test('migration60_61 adds the nullable category_id column to products',
      () async {
    final db = await openV60Database();

    await migration60_61.migrate(db);

    final columns = await db.rawQuery('PRAGMA table_info(products)');
    final column = columns.firstWhere((c) => c['name'] == 'category_id');
    // Nullable TEXT, no default — full parity with the Floor entity field:
    // a product without a resolved category legitimately has null.
    expect(column['notnull'], 0);
    expect(column['dflt_value'], isNull);

    await db.close();
  });

  test('migration60_61 leaves legacy product rows intact with null category_id',
      () async {
    final db = await openV60Database();

    await migration60_61.migrate(db);

    final rows = await db.query(
      'products',
      where: 'id = ?',
      whereArgs: ['prod-legacy-1'],
    );
    expect(rows, hasLength(1));
    final row = rows.first;
    // The legacy free-text display category is untouched; the new identity
    // column reads as null (matches no non-global promotion until synced).
    expect(row['category'], 'Bebidas');
    expect(row['category_id'], isNull);

    await db.close();
  });

  test('migration60_61 is safe to re-run (guarded ADD COLUMN)', () async {
    final db = await openV60Database();

    await migration60_61.migrate(db);
    await migration60_61.migrate(db);

    final columns = await db.rawQuery('PRAGMA table_info(products)');
    final matches = columns.where((c) => c['name'] == 'category_id').toList();
    expect(matches, hasLength(1));

    await db.close();
  });

  // Same guard direction as migration54_55 (#548): with the `products` table
  // absent (synthetic legacy schemas, e.g. the sync_service regression DB),
  // the migration completes and creates NOTHING.
  test(
      'migration60_61 completes without throwing when products does not exist',
      () async {
    final legacyPath =
        '${await databaseFactory.getDatabasesPath()}/category_id_no_products_test.db';
    await databaseFactory.deleteDatabase(legacyPath);
    final db = await databaseFactory.openDatabase(
      legacyPath,
      options: OpenDatabaseOptions(
        version: 60,
        onCreate: (database, version) async {
          await database.execute(
            'CREATE TABLE purchases (id TEXT NOT NULL PRIMARY KEY)',
          );
        },
      ),
    );

    await migration60_61.migrate(db);

    final tables = await db.rawQuery(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    );
    final tableNames = tables.map((row) => row['name'] as String).toSet();
    expect(tableNames, isNot(contains('products')));
    expect(tableNames, contains('purchases'));

    await db.close();
    await databaseFactory.deleteDatabase(legacyPath);
  });

  test(
      'allMigrations keeps the chain ordered: migration64_65 is the newest '
      'link at the end and migration63_64 is retained immediately before it',
      () {
    // The newest link is registered at the end of the chain.
    expect(allMigrations.last.startVersion, 64);
    expect(allMigrations.last.endVersion, 65);
    expect(allMigrations.last, same(migration64_65));
    // The previous newest link is still registered, in position, with its
    // versions unchanged.
    expect(allMigrations[allMigrations.length - 2], same(migration63_64));
    expect(migration63_64.startVersion, 63);
    expect(migration63_64.endVersion, 64);
  });

  const namedInvoiceColumns = [
    'customer_name',
    'customer_tax_id',
  ];

  Future<dynamic> openV64Database() async {
    final db = await databaseFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: 64,
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
              global_tax_override INTEGER NOT NULL
            )
          ''');
        },
      ),
    );
    await db.insert('invoices', {
      'id': 'legacy-invoice-v64',
      'invoice_number': '001-001-01-00000010',
      'created_at':
          DateTime.parse('2026-03-01T10:00:00Z').millisecondsSinceEpoch,
      'user_id': 'cashier-legacy',
      'subtotal': 100.0,
      'total_tax': 15.0,
      'total': 115.0,
      'is_canceled': 0,
      'sync_status': 'synced',
      'payment_status': 'paid',
      'type': 'regular',
      'global_tax_override': 0,
    });
    return db;
  }

  test('migration64_65 adds customer_name and customer_tax_id to invoices',
      () async {
    final db = await openV64Database();

    await migration64_65.migrate(db);

    final columns = await db.rawQuery('PRAGMA table_info(invoices)');
    final names = columns.map((row) => row['name'] as String).toSet();
    for (final col in namedInvoiceColumns) {
      expect(names, contains(col), reason: 'missing $col');
    }

    await db.close();
  });

  test(
      'migration64_65 leaves pre-existing invoices intact with null customer info',
      () async {
    final db = await openV64Database();

    await migration64_65.migrate(db);

    final rows = await db.query(
      'invoices',
      where: 'id = ?',
      whereArgs: ['legacy-invoice-v64'],
    );
    expect(rows, hasLength(1));
    final row = rows.first;
    expect(row['customer_name'], isNull);
    expect(row['customer_tax_id'], isNull);

    await db.close();
  });

  test('migration64_65 accepts new rows with customer values after upgrade',
      () async {
    final db = await openV64Database();

    await migration64_65.migrate(db);

    await db.insert('invoices', {
      'id': 'named-invoice-1',
      'invoice_number': '001-001-01-00000011',
      'created_at': DateTime.now().millisecondsSinceEpoch,
      'user_id': 'cashier-1',
      'subtotal': 200.0,
      'total_tax': 30.0,
      'total': 230.0,
      'is_canceled': 0,
      'sync_status': 'pending',
      'payment_status': 'paid',
      'type': 'regular',
      'global_tax_override': 0,
      'customer_name': 'Juan Perez',
      'customer_tax_id': '001-120590-0001A',
    });

    final rows = await db.query(
      'invoices',
      where: 'id = ?',
      whereArgs: ['named-invoice-1'],
    );
    expect(rows, hasLength(1));
    expect(rows.first['customer_name'], 'Juan Perez');
    expect(rows.first['customer_tax_id'], '001-120590-0001A');

    await db.close();
  });

  test('migration64_65 is safe to re-run (guarded ADD COLUMN)', () async {
    final db = await openV64Database();

    await migration64_65.migrate(db);
    await migration64_65.migrate(db);

    final columns = await db.rawQuery('PRAGMA table_info(invoices)');
    for (final name in namedInvoiceColumns) {
      final matches = columns.where((c) => c['name'] == name).toList();
      expect(matches, hasLength(1), reason: name);
    }

    await db.close();
  });

  test(
      'migration64_65 completes without throwing when invoices does not exist',
      () async {
    final legacyPath =
        '${await databaseFactory.getDatabasesPath()}/named_no_invoices_test.db';
    await databaseFactory.deleteDatabase(legacyPath);
    final db = await databaseFactory.openDatabase(
      legacyPath,
      options: OpenDatabaseOptions(
        version: 64,
        onCreate: (database, version) async {
          await database.execute(
            'CREATE TABLE other_table (id TEXT NOT NULL PRIMARY KEY)',
          );
        },
      ),
    );

    await migration64_65.migrate(db);

    final tables = await db.rawQuery(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    );
    final tableNames = tables.map((row) => row['name'] as String).toSet();
    expect(tableNames, isNot(contains('invoices')));

    await db.close();
    await databaseFactory.deleteDatabase(legacyPath);
  });
}
