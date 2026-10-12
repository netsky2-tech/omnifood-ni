import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// Covers the `customers.customer_code` schema guarantee (tracker T2a).
///
/// LV1.4 added `customer_code` to the ENTITY without a migration, so a
/// database that existed before that change drifts from a fresh install: the
/// column only exists on fresh-install DDL. The migration is exercised
/// directly against a database at the previous version, which is how this app
/// covers every other migration.
void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  /// Minimal pre-migration `customers` shape WITHOUT `customer_code`: the
  /// pre-LV1.4 upgraded-database shape (the drift case).
  Future<Database> openAt69({Future<void> Function(Database db)? seed}) async {
    return openDatabase(
      inMemoryDatabasePath,
      version: 69,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE customers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            tax_id TEXT,
            phone TEXT,
            email TEXT,
            address TEXT,
            points_balance REAL NOT NULL,
            is_active INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            sync_status TEXT NOT NULL
          )
        ''');
        if (seed != null) {
          await seed(db);
        }
      },
    );
  }

  Future<void> insertCustomer(
    Database db, {
    required String id,
    String? customerCode,
  }) async {
    final row = <String, Object?>{
      'id': id,
      'name': 'Cliente $id',
      'tax_id': null,
      'phone': null,
      'email': null,
      'address': null,
      'points_balance': 0.0,
      'is_active': 1,
      'created_at': 0,
      'updated_at': 0,
      'sync_status': 'synced',
      // Assigned outside the literal: the newer analyzer suggests the Dart
      // 3.8+ null-aware element marker, which the CI runner's SDK cannot
      // parse yet.
    };
    if (customerCode != null) {
      row['customer_code'] = customerCode;
    }
    await db.insert('customers', row);
  }

  group('migration69_70 — customers.customer_code guarantee', () {
    test('adds the missing column once and creates the case-insensitive '
        'partial unique index', () async {
      final db = await openAt69();
      await migration69_70.migrate(db);

      final columns = await db.rawQuery('PRAGMA table_info(customers)');
      expect(
        columns.where((c) => c['name'] == 'customer_code'),
        hasLength(1),
        reason: 'the guarded column add must not duplicate customer_code',
      );

      final indexSql = await db.rawQuery(
        "SELECT sql FROM sqlite_master WHERE type='index' AND name=?",
        [customerCodeUniqueIndexName],
      );
      expect(indexSql, hasLength(1));
      expect(indexSql.single['sql'], contains('COLLATE NOCASE'));
      expect(indexSql.single['sql'], contains('WHERE customer_code IS NOT NULL'));

      await db.close();
    });

    test('is idempotent: re-running the migration and the ensure helper '
        'neither fails nor duplicates the index', () async {
      final db = await openAt69();
      await migration69_70.migrate(db);
      await migration69_70.migrate(db);
      await ensureCustomerCodeSchema(db);

      final indexCount = await db.rawQuery(
        "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='index' AND "
        "tbl_name='customers' AND name=?",
        [customerCodeUniqueIndexName],
      );
      expect(indexCount.single['n'], 1);

      await db.close();
    });

    test('rejects duplicate codes including case variants', () async {
      final db = await openAt69();
      await migration69_70.migrate(db);

      await insertCustomer(db, id: 'c1', customerCode: 'CL-0001');
      await expectLater(
        insertCustomer(db, id: 'c2', customerCode: 'CL-0001'),
        throwsA(anything),
      );
      await expectLater(
        insertCustomer(db, id: 'c3', customerCode: 'cl-0001'),
        throwsA(anything),
        reason: 'the index is COLLATE NOCASE: case variants are the same code',
      );
      // A different code is fine.
      await insertCustomer(db, id: 'c4', customerCode: 'CL-0002');

      await db.close();
    });

    test('multiple NULL codes stay allowed (legacy/unclassified rows)',
        () async {
      final db = await openAt69();
      await migration69_70.migrate(db);

      await insertCustomer(db, id: 'n1');
      await insertCustomer(db, id: 'n2');
      await insertCustomer(db, id: 'n3');

      await db.close();
    });

    test('parity: a fresh-install-shaped database (column present, no index) '
        'ends with the same schema as the migrated one', () async {
      final migrated = await openAt69();
      await migration69_70.migrate(migrated);

      // Fresh-install shape at 70: the column exists (Floor DDL), no index.
      final fresh = await openDatabase(
        inMemoryDatabasePath,
        version: 70,
        onCreate: (db, version) async {
          await db.execute('''
            CREATE TABLE customers (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              tax_id TEXT,
              phone TEXT,
              email TEXT,
              address TEXT,
              points_balance REAL NOT NULL,
              is_active INTEGER NOT NULL,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL,
              sync_status TEXT NOT NULL,
              customer_code TEXT
            )
          ''');
        },
      );
      await ensureCustomerCodeSchema(fresh);

      Future<String?> indexSql(Database db) async {
        final rows = await db.rawQuery(
          "SELECT sql FROM sqlite_master WHERE type='index' AND name=?",
          [customerCodeUniqueIndexName],
        );
        return (rows.single['sql'] as String?)?.replaceAll('\n', ' ');
      }

      expect(await indexSql(fresh), await indexSql(migrated));

      await migrated.close();
      await fresh.close();
    });
  });
}
