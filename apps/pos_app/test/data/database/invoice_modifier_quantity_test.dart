import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:pos_app/data/mappers/sales_mapper.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/data/models/sales/invoice_item_entity.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  late String dbPath;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    dbPath =
        '${await databaseFactory.getDatabasesPath()}/invoice_modifier_quantity_test.db';
    await databaseFactory.deleteDatabase(dbPath);
  });

  tearDown(() async {
    await databaseFactory.deleteDatabase(dbPath);
  });

  test('migration62_63 adds the quantity column to invoice_item_modifiers and is re-runnable', () async {
    final db = await databaseFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: 62,
        onCreate: (database, version) async {
          // Pre-existing v62 shape of the modifiers table (no quantity).
          await database.execute('''
            CREATE TABLE invoice_item_modifiers (
              id TEXT NOT NULL PRIMARY KEY,
              invoice_item_id TEXT NOT NULL,
              name TEXT NOT NULL,
              extra_price REAL NOT NULL
            )
          ''');
        },
      ),
    );

    await migration62_63.migrate(db);
    // Idempotent: a second run must be a no-op.
    await migration62_63.migrate(db);

    final columns = (await db.rawQuery('PRAGMA table_info(invoice_item_modifiers)'))
        .map((c) => c['name'] as String)
        .toSet();
    expect(columns, contains('quantity'));

    await db.close();
  });

  test('quantity survives a write/read roundtrip through the Floor entity', () async {
    final database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();

    try {
      final entities = SalesMapper.toItemModifierEntities(
        InvoiceItem(
          id: 'item-1',
          invoiceId: 'inv-1',
          productId: 'p-1',
          productName: 'Capuccino',
          quantity: 1,
          unitPrice: 60,
          originalTaxRate: 0.15,
          appliedTaxRate: 0.15,
          taxAmount: 9,
          total: 69,
          selectedModifiers: const [
            Modifier(id: 'm-1', name: 'Extra Shot', extraPrice: 15, quantity: 2),
            Modifier(id: 'm-2', name: 'Sin Azúcar', extraPrice: 0),
          ],
        ),
      );

      await database.salesTransactionDao.insertInvoice(
        InvoiceEntity(
          id: 'inv-1',
          number: '001-001-01-00000001',
          createdAt: DateTime(2026, 10, 1).millisecondsSinceEpoch,
          userId: 'user-1',
          subtotal: 60,
          totalTax: 9,
          total: 69,
        ),
      );
      await database.salesTransactionDao.insertInvoiceItems([
        // Parent row: the modifiers table carries a FK to invoice_items.
        InvoiceItemEntity(
          id: 'item-1',
          invoiceId: 'inv-1',
          productId: 'p-1',
          productName: 'Capuccino',
          quantity: 1,
          unitPrice: 60,
          originalTaxRate: 0.15,
          appliedTaxRate: 0.15,
          taxAmount: 9,
          total: 69,
        ),
      ]);
      await database.salesTransactionDao.insertInvoiceItemModifiers(entities);

      final rows = await database.database.rawQuery(
        'SELECT name, quantity FROM invoice_item_modifiers ORDER BY name ASC',
      );
      expect(rows, hasLength(2));
      expect(rows.first['name'], 'Extra Shot');
      expect(rows.first['quantity'], 2);
      expect(rows.last['name'], 'Sin Azúcar');
      // Rows built from a legacy modifier default to quantity 1.
      expect(rows.last['quantity'], 1);
    } finally {
      await database.close();
    }
  });

  test('the checkout sync payload carries the modifier quantity', () {
    final payload = SalesMapper.toSyncJson(
      _invoiceFixture(),
      [
        InvoiceItem(
          id: 'item-1',
          invoiceId: 'inv-1',
          productId: 'p-1',
          productName: 'Capuccino',
          quantity: 1,
          unitPrice: 60,
          originalTaxRate: 0.15,
          appliedTaxRate: 0.15,
          taxAmount: 9,
          total: 69,
          selectedModifiers: const [
            Modifier(id: 'm-1', name: 'Extra Shot', extraPrice: 15, quantity: 2),
          ],
        ),
      ],
      [],
    );

    final itemModifiers =
        (payload['items']!.first as Map)['modifiers'] as List;
    expect(itemModifiers.single, {
      'name': 'Extra Shot',
      'extraPrice': 15.0,
      'quantity': 2,
    });
  });
}

Invoice _invoiceFixture() => Invoice(
      id: 'inv-1',
      number: '001-001-01-00000001',
      createdAt: DateTime(2026, 10, 1),
      userId: 'user-1',
      subtotal: 60,
      totalTax: 9,
      total: 69,
    );
