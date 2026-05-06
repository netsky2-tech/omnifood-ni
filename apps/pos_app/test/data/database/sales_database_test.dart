import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';

void main() {
  late AppDatabase database;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
  });

  tearDown(() async {
    await database.close();
  });

  group('InvoiceDao', () {
    test('updateSyncStatusForIds should update multiple invoices', () async {
      final invoices = [
        InvoiceEntity(
          id: 'inv1',
          number: '001',
          createdAt: DateTime.now().millisecondsSinceEpoch,
          userId: 'u1',
          subtotal: 100,
          totalTax: 15,
          total: 115,
          paymentStatus: 'PAID',
          syncStatus: 'PENDING',
          type: 'REGULAR',
        ),
        InvoiceEntity(
          id: 'inv2',
          number: '002',
          createdAt: DateTime.now().millisecondsSinceEpoch,
          userId: 'u1',
          subtotal: 200,
          totalTax: 30,
          total: 230,
          paymentStatus: 'PAID',
          syncStatus: 'PENDING',
          type: 'REGULAR',
        ),
        InvoiceEntity(
          id: 'inv3',
          number: '003',
          createdAt: DateTime.now().millisecondsSinceEpoch,
          userId: 'u1',
          subtotal: 300,
          totalTax: 45,
          total: 345,
          paymentStatus: 'PAID',
          syncStatus: 'PENDING',
          type: 'REGULAR',
        ),
      ];

      for (var inv in invoices) {
        await database.invoiceDao.insertInvoice(inv);
      }

      await database.invoiceDao.updateSyncStatusForIds(['inv1', 'inv3'], 'SYNCED');

      final inv1 = await database.invoiceDao.getInvoiceById('inv1');
      final inv2 = await database.invoiceDao.getInvoiceById('inv2');
      final inv3 = await database.invoiceDao.getInvoiceById('inv3');

      expect(inv1?.syncStatus, 'SYNCED');
      expect(inv2?.syncStatus, 'PENDING');
      expect(inv3?.syncStatus, 'SYNCED');
    });
  });
}
