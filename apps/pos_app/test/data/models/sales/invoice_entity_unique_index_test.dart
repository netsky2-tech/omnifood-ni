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

  group('InvoiceEntity Unique Index', () {
    test('should reject duplicate invoice number with constraint violation', () async {
      // GIVEN an invoice with a specific number
      final invoice1 = InvoiceEntity(
        id: 'inv-1',
        number: '001-001-01-00000042',
        createdAt: DateTime.now().millisecondsSinceEpoch,
        userId: 'user-1',
        subtotal: 100.0,
        totalTax: 15.0,
        total: 115.0,
        isCanceled: false,
        syncStatus: 'pending',
        paymentStatus: 'paid',
      );

      // WHEN the first invoice is inserted
      await database.invoiceDao.insertInvoice(invoice1);

      // AND a second invoice with the SAME number is inserted
      final invoice2 = InvoiceEntity(
        id: 'inv-2',
        number: '001-001-01-00000042', // Same number as invoice1
        createdAt: DateTime.now().millisecondsSinceEpoch,
        userId: 'user-1',
        subtotal: 200.0,
        totalTax: 30.0,
        total: 230.0,
        isCanceled: false,
        syncStatus: 'pending',
        paymentStatus: 'paid',
      );

      // THEN the second insert should throw a constraint violation error
      expect(
        () => database.invoiceDao.insertInvoice(invoice2),
        throwsA(
          isA<DatabaseException>().having(
            (e) => e.toString().toLowerCase(),
            'error message',
            contains('unique'), // SQLite unique constraint violation
          ),
        ),
      );
    });

    test('should allow different invoice numbers without constraint violation', () async {
      // GIVEN an invoice with a specific number
      final invoice1 = InvoiceEntity(
        id: 'inv-1',
        number: '001-001-01-00000042',
        createdAt: DateTime.now().millisecondsSinceEpoch,
        userId: 'user-1',
        subtotal: 100.0,
        totalTax: 15.0,
        total: 115.0,
        isCanceled: false,
        syncStatus: 'pending',
        paymentStatus: 'paid',
      );

      // WHEN the first invoice is inserted
      await database.invoiceDao.insertInvoice(invoice1);

      // AND a second invoice with a DIFFERENT number is inserted
      final invoice2 = InvoiceEntity(
        id: 'inv-2',
        number: '001-001-01-00000043', // Different number
        createdAt: DateTime.now().millisecondsSinceEpoch,
        userId: 'user-1',
        subtotal: 200.0,
        totalTax: 30.0,
        total: 230.0,
        isCanceled: false,
        syncStatus: 'pending',
        paymentStatus: 'paid',
      );

      // THEN the second insert should succeed without error
      await expectLater(
        database.invoiceDao.insertInvoice(invoice2),
        completes,
      );

      // AND both invoices should be retrievable
      final allInvoices = await database.invoiceDao.getAllInvoices();
      expect(allInvoices.length, 2);
      expect(allInvoices.map((i) => i.number).toList()..sort(), 
        ['001-001-01-00000042', '001-001-01-00000043']);
    });

    test('should allow lookup by invoice number efficiently', () async {
      // GIVEN an invoice with a specific number
      final invoice = InvoiceEntity(
        id: 'inv-1',
        number: '001-001-01-00000099',
        createdAt: DateTime.now().millisecondsSinceEpoch,
        userId: 'user-1',
        subtotal: 100.0,
        totalTax: 15.0,
        total: 115.0,
        isCanceled: false,
        syncStatus: 'pending',
        paymentStatus: 'paid',
      );

      // WHEN the invoice is inserted
      await database.invoiceDao.insertInvoice(invoice);

      // THEN lookup by number should return the correct invoice
      final result = await database.invoiceDao.getInvoiceByNumber('001-001-01-00000099');
      expect(result, isNotNull);
      expect(result!.id, 'inv-1');
      expect(result.number, '001-001-01-00000099');
    });
  });
}
