import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/data/services/sales/dgi_numbering_service_impl.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  late AppDatabase database;
  late DgiNumberingServiceImpl service;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    service = DgiNumberingServiceImpl(
      database.localConfigDao,
      database.invoiceDao,
    );
  });

  tearDown(() async {
    await database.close();
  });

  test('allocates the first DGI number from an empty Floor database', () async {
    expect(await service.getNextNumber(), '001-001-01-00000001');
  });

  test('allocates sequential DGI numbers after persisted sales', () async {
    final firstNumber = await service.getNextNumber();
    await database.invoiceDao.insertInvoice(
      InvoiceEntity(
        id: 'invoice-1',
        number: firstNumber,
        createdAt: DateTime.now().millisecondsSinceEpoch,
        userId: 'cashier-1',
        subtotal: 100,
        totalTax: 15,
        total: 115,
      ),
    );
    await service.incrementNumber();

    expect(await service.getNextNumber(), '001-001-01-00000002');
  });

  test('isRangeExhausted permits the inclusive end number and blocks strictly after', () async {
    await service.initializeRange(
      prefix: '001-001-01-',
      start: 1,
      end: 2,
    );

    expect(await service.isRangeExhausted(), isFalse);
    expect(await service.getNextNumber(), '001-001-01-00000001');
    await service.incrementNumber();

    // At sequence 2, the inclusive end is still available for allocation
    expect(await service.isRangeExhausted(), isFalse);
    expect(await service.getNextNumber(), '001-001-01-00000002');
    await service.incrementNumber();

    // After sequence 2 is consumed, next sequence (3) exceeds end=2
    expect(await service.isRangeExhausted(), isTrue);
  });
}
