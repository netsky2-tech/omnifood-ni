import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// B2e D-3 — reconciliation migration for the fail-closed IVA defaults.
///
/// Devices that were provisioned before the defaults became 0.0 may carry
/// rows invented at 15% by the old application-layer default. The migration
/// reconciles those rows ONLY where the device regime is CUOTA_FIJA (the
/// regime that makes a 15% rate legally impossible for the terminal's
/// receipts); under REGIMEN_GENERAL the 0.15 rows are legitimate configured
/// rates and must not be touched.
void main() {
  late String dbPath;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    dbPath =
        '${await databaseFactory.getDatabasesPath()}/iva_regime_reconciliation_migration_test.db';
    await databaseFactory.deleteDatabase(dbPath);
  });

  tearDown(() async {
    await databaseFactory.deleteDatabase(dbPath);
  });

  Future<dynamic> openV55Database({String? taxRegime}) async {
    return databaseFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: 55,
        onCreate: (database, version) async {
          await database.execute('''
            CREATE TABLE local_configs (
              key TEXT NOT NULL PRIMARY KEY,
              value TEXT NOT NULL,
              description TEXT
            )
          ''');
          await database.execute('''
            CREATE TABLE products (
              id TEXT NOT NULL PRIMARY KEY,
              tax_rate REAL NOT NULL
            )
          ''');
          await database.execute('''
            CREATE TABLE invoice_items (
              id TEXT NOT NULL PRIMARY KEY,
              original_tax_rate REAL NOT NULL,
              applied_tax_rate REAL NOT NULL
            )
          ''');
        },
        onUpgrade: (database, startVersion, endVersion) async {},
      ),
    );
  }

  Future<void> seedRateRows(dynamic db) async {
    await db.insert('products', {'id': 'prod-15', 'tax_rate': 0.15});
    await db.insert('products', {'id': 'prod-0', 'tax_rate': 0.0});
    await db.insert('products', {'id': 'prod-10', 'tax_rate': 0.10});
    await db.insert('invoice_items', {
      'id': 'item-15-15',
      'original_tax_rate': 0.15,
      'applied_tax_rate': 0.15,
    });
    await db.insert('invoice_items', {
      'id': 'item-0-15',
      'original_tax_rate': 0.0,
      'applied_tax_rate': 0.15,
    });
    await db.insert('invoice_items', {
      'id': 'item-10-10',
      'original_tax_rate': 0.10,
      'applied_tax_rate': 0.10,
    });
  }

  test(
    'under CUOTA_FIJA reconciles only the 0.15 rates to 0.0, leaving other rates untouched',
    () async {
      final db = await openV55Database();
      await db.insert('local_configs', {
        'key': 'tax_regime',
        'value': 'CUOTA_FIJA',
      });
      await seedRateRows(db);

      await migration55_56.migrate(db);

      final products = await db.query(
        'products',
        columns: ['id', 'tax_rate'],
        orderBy: 'id',
      );
      expect(
        products,
        equals([
          {'id': 'prod-0', 'tax_rate': 0.0},
          {'id': 'prod-10', 'tax_rate': 0.10},
          {'id': 'prod-15', 'tax_rate': 0.0},
        ]),
      );

      final items = await db.query(
        'invoice_items',
        columns: ['id', 'original_tax_rate', 'applied_tax_rate'],
        orderBy: 'id',
      );
      expect(
        items,
        equals([
          {'id': 'item-0-15', 'original_tax_rate': 0.0, 'applied_tax_rate': 0.0},
          {
            'id': 'item-10-10',
            'original_tax_rate': 0.10,
            'applied_tax_rate': 0.10,
          },
          {'id': 'item-15-15', 'original_tax_rate': 0.0, 'applied_tax_rate': 0.0},
        ]),
      );

      await db.close();
    },
  );

  test(
    'under REGIMEN_GENERAL leaves every rate untouched',
    () async {
      final db = await openV55Database();
      await db.insert('local_configs', {
        'key': 'tax_regime',
        'value': 'REGIMEN_GENERAL',
      });
      await seedRateRows(db);

      await migration55_56.migrate(db);

      final products = await db.query(
        'products',
        columns: ['id', 'tax_rate'],
        orderBy: 'id',
      );
      expect(
        products,
        equals([
          {'id': 'prod-0', 'tax_rate': 0.0},
          {'id': 'prod-10', 'tax_rate': 0.10},
          {'id': 'prod-15', 'tax_rate': 0.15},
        ]),
      );

      final items = await db.query(
        'invoice_items',
        columns: ['id', 'original_tax_rate', 'applied_tax_rate'],
        orderBy: 'id',
      );
      expect(
        items,
        equals([
          {
            'id': 'item-0-15',
            'original_tax_rate': 0.0,
            'applied_tax_rate': 0.15,
          },
          {
            'id': 'item-10-10',
            'original_tax_rate': 0.10,
            'applied_tax_rate': 0.10,
          },
          {
            'id': 'item-15-15',
            'original_tax_rate': 0.15,
            'applied_tax_rate': 0.15,
          },
        ]),
      );

      await db.close();
    },
  );

  test(
    'without a tax_regime row the migration is a no-op (fail-closed guard)',
    () async {
      final db = await openV55Database();
      await seedRateRows(db);

      await migration55_56.migrate(db);

      final taxed = await db.query(
        'products',
        columns: ['id'],
        where: 'tax_rate = 0.15',
      );
      expect(taxed, hasLength(1));

      await db.close();
    },
  );

  test(
    'without a local_configs table the migration is a safe no-op',
    () async {
      final db = await databaseFactory.openDatabase(
        dbPath,
        options: OpenDatabaseOptions(
          version: 55,
          onCreate: (database, version) async {
            await database.execute('''
              CREATE TABLE products (
                id TEXT NOT NULL PRIMARY KEY,
                tax_rate REAL NOT NULL
              )
            ''');
            await database.execute('''
              CREATE TABLE invoice_items (
                id TEXT NOT NULL PRIMARY KEY,
                original_tax_rate REAL NOT NULL,
                applied_tax_rate REAL NOT NULL
              )
            ''');
          },
        ),
      );
      await db.insert('products', {'id': 'prod-15', 'tax_rate': 0.15});

      await migration55_56.migrate(db);

      final taxed = await db.query(
        'products',
        columns: ['id'],
        where: 'tax_rate = 0.15',
      );
      expect(taxed, hasLength(1));

      await db.close();
    },
  );
}
