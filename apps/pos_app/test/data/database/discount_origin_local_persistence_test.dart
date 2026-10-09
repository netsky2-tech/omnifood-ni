import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:pos_app/data/mappers/sales_mapper.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/data/models/sales/invoice_item_entity.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// Local persistence for the per-line discount-origin breakdown
/// (`discount_origin_json` TEXT on `invoice_items`).
///
/// The outbound sync payload is rebuilt from LOCAL rows at upload time
/// (sales_repository_impl → getItemsByInvoiceId → toItemDomain → toSyncJson),
/// so a breakdown that only existed in memory at checkout would be lost for
/// every offline-queued sale. These tests pin the migration and the real
/// mapper/DAO round trip. Producing the breakdown and sending it is the NEXT
/// unit — nothing here asserts anything about toSyncJson.
///
/// Real databases only: the repo's lesson (ohac_delivery_install_parity_test)
/// is that mocks hide schema.
void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  late String dbPath;

  setUp(() async {
    dbPath =
        '${await databaseFactory.getDatabasesPath()}/discount_origin_local_persistence_test.db';
    await databaseFactory.deleteDatabase(dbPath);
  });

  tearDown(() async {
    await databaseFactory.deleteDatabase(dbPath);
  });

  /// Opens a database at version 66 whose `invoice_items` table has the
  /// pre-migration shape (no `discount_origin_json` column).
  Future<Database> openV66Database() async {
    return databaseFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: 66,
        onCreate: (database, version) async {
          await database.execute('''
            CREATE TABLE invoice_items (
              id TEXT NOT NULL PRIMARY KEY,
              invoice_id TEXT NOT NULL,
              product_id TEXT NOT NULL,
              product_name TEXT NOT NULL,
              quantity REAL NOT NULL,
              unit_price REAL NOT NULL,
              original_tax_rate REAL NOT NULL,
              applied_tax_rate REAL NOT NULL,
              tax_amount REAL NOT NULL,
              total REAL NOT NULL,
              discount REAL NOT NULL,
              variant_id TEXT,
              notes TEXT,
              recipe_version_id TEXT,
              inventory_snapshot_json TEXT,
              inventory_snapshot_version TEXT,
              origin_invoice_item_id TEXT
            )
          ''');
        },
      ),
    );
  }

  List<String> columnNamesOf(List<Map<String, Object?>> rows) =>
      rows.map((row) => row['name'] as String).toList();

  group('migration66_67', () {
    test('adds discount_origin_json to invoice_items', () async {
      final db = await openV66Database();

      await migration66_67.migrate(db);

      final columns =
          await db.rawQuery('PRAGMA table_info(invoice_items)');
      expect(
        columnNamesOf(columns),
        contains('discount_origin_json'),
      );
      // TEXT JSON column, mirroring inventory_snapshot_json.
      final column = columns.singleWhere(
        (row) => row['name'] == 'discount_origin_json',
      );
      expect(column['type'], 'TEXT');

      await db.close();
    });

    test('an existing row survives the migration with NULL in the new column',
        () async {
      final db = await openV66Database();
      await db.insert('invoice_items', {
        'id': 'item-legacy-1',
        'invoice_id': 'inv-1',
        'product_id': 'prod-1',
        'product_name': 'Burger',
        'quantity': 2.0,
        'unit_price': 50.0,
        'original_tax_rate': 0.15,
        'applied_tax_rate': 0.15,
        'tax_amount': 15.0,
        'total': 115.0,
        'discount': 0.0,
      });

      await migration66_67.migrate(db);

      final rows = await db.query(
        'invoice_items',
        where: 'id = ?',
        whereArgs: ['item-legacy-1'],
      );
      expect(rows, hasLength(1));
      expect(rows.single['inventory_snapshot_json'], isNull);
      expect(rows.single['discount_origin_json'], isNull);

      await db.close();
    });

    test('a second run is a no-op (the guard holds)', () async {
      final db = await openV66Database();

      await migration66_67.migrate(db);
      // Must not throw "duplicate column name".
      await migration66_67.migrate(db);

      final columns =
          await db.rawQuery('PRAGMA table_info(invoice_items)');
      expect(
        columnNamesOf(columns).where((n) => n == 'discount_origin_json'),
        hasLength(1),
      );

      await db.close();
    });

    test('is a no-op when the invoice_items table does not exist', () async {
      final db = await databaseFactory.openDatabase(
        dbPath,
        options: OpenDatabaseOptions(
          version: 66,
          onCreate: (database, version) async {},
        ),
      );

      // Must not throw "no such table".
      await migration66_67.migrate(db);

      await db.close();
    });
  });

  group('DAO round trip through the real Floor database', () {
    Future<AppDatabase> buildDatabase() async {
      final database = await $FloorAppDatabase
          .inMemoryDatabaseBuilder()
          .addMigrations(allMigrations)
          .addCallback(inventoryMovementAppendOnlyCallback)
          .build();
      addTearDown(database.close);
      return database;
    }

    InvoiceItem itemWith(Map<String, double>? discountOrigin) => InvoiceItem(
          id: 'item-1',
          invoiceId: 'inv-1',
          productId: 'prod-1',
          productName: 'Burger',
          quantity: 2,
          unitPrice: 50,
          originalTaxRate: 0.15,
          appliedTaxRate: 0.15,
          taxAmount: 15,
          total: 115,
          discountOrigin: discountOrigin,
        );

    Future<AppDatabase> seedInvoice(AppDatabase db) async {
      await db.invoiceDao.insertInvoice(
        SalesMapper.toInvoiceEntity(
          Invoice(
            id: 'inv-1',
            number: '001',
            createdAt: DateTime(2026, 6, 23),
            userId: 'user-1',
            subtotal: 100,
            totalTax: 15,
            total: 115,
            isCanceled: false,
            voidReason: null,
            syncStatus: SyncStatus.pending,
            paymentStatus: PaymentStatus.paid,
            type: InvoiceType.regular,
            customerId: null,
          ),
        ),
      );
      return db;
    }

    test('a breakdown persisted via the DAO comes back equal', () async {
      final db = await seedInvoice(await buildDatabase());

      await db.invoiceItemDao.insertItems(
        [SalesMapper.toItemEntity(itemWith({'promotion': 10.0, 'manual': 5.0}))],
      );
      final rows = await db.invoiceItemDao.getItemsByInvoiceId('inv-1');
      expect(rows, hasLength(1));

      final domain = SalesMapper.toItemDomain(rows.single);
      expect(domain.discountOrigin, {'promotion': 10.0, 'manual': 5.0});
    });

    test('a legacy NULL row comes back null, NOT an empty map', () async {
      final db = await seedInvoice(await buildDatabase());

      await db.invoiceItemDao
          .insertItems([SalesMapper.toItemEntity(itemWith(null))]);
      final rows = await db.invoiceItemDao.getItemsByInvoiceId('inv-1');
      expect(rows, hasLength(1));
      // The row really is NULL on disk, not an encoded empty map.
      expect(rows.single.discountOriginJson, isNull);

      final domain = SalesMapper.toItemDomain(rows.single);
      expect(domain.discountOrigin, isNull);
      // Null is not an empty map: the two states must never blur.
      expect(domain.discountOrigin, isNot(equals(<String, double>{})));
    });

    test('a hand-written row with an unknown key decodes to the valid keys '
        'only', () async {
      final db = await seedInvoice(await buildDatabase());

      await db.database.rawInsert(
        'INSERT INTO invoice_items (id, invoice_id, product_id, product_name, '
        'quantity, unit_price, original_tax_rate, applied_tax_rate, '
        'tax_amount, total, discount, discount_origin_json) '
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          'item-hand-1',
          'inv-1',
          'prod-1',
          'Burger',
          2.0,
          50.0,
          0.15,
          0.15,
          15.0,
          115.0,
          0.0,
          '{"promotion":10.0,"mystery_origin":7.0}',
        ],
      );
      final rows = await db.invoiceItemDao.getItemsByInvoiceId('inv-1');
      final domain = SalesMapper.toItemDomain(rows.singleWhere(
        (r) => r.id == 'item-hand-1',
      ));
      // The unknown key must be dropped, or the backend would reject the
      // whole 500-record batch.
      expect(domain.discountOrigin, {'promotion': 10.0});
    });

    test('a hand-written row with a zero value decodes to null', () async {
      final db = await seedInvoice(await buildDatabase());

      await db.database.rawInsert(
        'INSERT INTO invoice_items (id, invoice_id, product_id, product_name, '
        'quantity, unit_price, original_tax_rate, applied_tax_rate, '
        'tax_amount, total, discount, discount_origin_json) '
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          'item-hand-2',
          'inv-1',
          'prod-1',
          'Burger',
          2.0,
          50.0,
          0.15,
          0.15,
          15.0,
          115.0,
          0.0,
          '{"promotion":0.0,"manual":5.0}',
        ],
      );
      final rows = await db.invoiceItemDao.getItemsByInvoiceId('inv-1');
      final domain = SalesMapper.toItemDomain(rows.singleWhere(
        (r) => r.id == 'item-hand-2',
      ));
      expect(domain.discountOrigin, {'manual': 5.0});
    });

    test('a hand-written row where nothing valid remains decodes to null',
        () async {
      final db = await seedInvoice(await buildDatabase());

      await db.database.rawInsert(
        'INSERT INTO invoice_items (id, invoice_id, product_id, product_name, '
        'quantity, unit_price, original_tax_rate, applied_tax_rate, '
        'tax_amount, total, discount, discount_origin_json) '
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          'item-hand-3',
          'inv-1',
          'prod-1',
          'Burger',
          2.0,
          50.0,
          0.15,
          0.15,
          15.0,
          115.0,
          0.0,
          '{"promotion":0.0,"loyalty":"lots"}',
        ],
      );
      final rows = await db.invoiceItemDao.getItemsByInvoiceId('inv-1');
      final domain = SalesMapper.toItemDomain(rows.singleWhere(
        (r) => r.id == 'item-hand-3',
      ));
      expect(domain.discountOrigin, isNull);
    });

    test('a hand-written corrupt JSON cell decodes fail-safe to null',
        () async {
      final db = await seedInvoice(await buildDatabase());

      await db.database.rawInsert(
        'INSERT INTO invoice_items (id, invoice_id, product_id, product_name, '
        'quantity, unit_price, original_tax_rate, applied_tax_rate, '
        'tax_amount, total, discount, discount_origin_json) '
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          'item-hand-4',
          'inv-1',
          'prod-1',
          'Burger',
          2.0,
          50.0,
          0.15,
          0.15,
          15.0,
          115.0,
          0.0,
          'not-json{',
        ],
      );
      final rows = await db.invoiceItemDao.getItemsByInvoiceId('inv-1');
      final domain = SalesMapper.toItemDomain(rows.singleWhere(
        (r) => r.id == 'item-hand-4',
      ));
      // The sale keeps flowing offline; never a backend-rejecting value.
      expect(domain.discountOrigin, isNull);
    });
  });
}
