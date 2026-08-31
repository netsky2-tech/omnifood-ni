import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/inventory/insumo_entity.dart';
import 'package:pos_app/data/models/inventory/movement_entity.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  late AppDatabase database;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
  });

  tearDown(() => database.close());

  InvoiceEntity invoice(
    String id, {
    String number = '001-001-01-00000001',
    bool isCanceled = false,
  }) => InvoiceEntity(
    id: id,
    number: number,
    createdAt: DateTime.now().millisecondsSinceEpoch,
    userId: 'cashier-1',
    subtotal: 100,
    totalTax: 15,
    total: 115,
    isCanceled: isCanceled,
    type: 'regular',
  );

  MovementEntity movement(
    String id, {
    required String invoiceId,
    String? originMovementId,
    double quantity = 1,
  }) => MovementEntity(
    id: id,
    insumoId: 'ins-1',
    type: originMovementId == null ? 'SALE' : 'REVERSAL',
    quantity: quantity,
    previousStock: 9,
    newStock: 10,
    timestamp: DateTime.now().toIso8601String(),
    sourceDocumentType: 'invoice',
    sourceDocumentId: invoiceId,
    originMovementId: originMovementId,
  );

  Future<void> persistSale(String id, bool shouldFail) =>
      database.salesTransactionDao.executeSaleWithDgiTransaction(
        invoice(id),
        [],
        [],
        [],
        [],
        null,
        '2',
        shouldFail,
      );

  group('DGI transaction correction', () {
    test(
      'allocates interleaved sales in SQLite and rolls back a failed contender without a gap',
      () async {
        await database.localConfigDao.saveConfig(
          LocalConfigEntity(key: 'dgi_prefix', value: '001-001-01-'),
        );
        await database.localConfigDao.saveConfig(
          LocalConfigEntity(key: 'dgi_current_number', value: '1'),
        );

        final first = persistSale('sale-1', false);
        final failed = persistSale(
          'sale-failed',
          true,
        ).then<void>((_) {}, onError: (Object error, StackTrace stackTrace) {});
        await Future.wait([first, failed]);

        expect(
          (await database.invoiceDao.getInvoiceById('sale-1'))?.number,
          '001-001-01-00000001',
        );
        expect(await database.invoiceDao.getInvoiceById('sale-failed'), isNull);
        expect(
          (await database.localConfigDao.getConfigByKey(
            'dgi_current_number',
          ))?.value,
          '2',
        );

        await persistSale('sale-2', false);
        expect(
          (await database.invoiceDao.getInvoiceById('sale-2'))?.number,
          '001-001-01-00000002',
        );
        expect(
          (await database.localConfigDao.getConfigByKey(
            'dgi_current_number',
          ))?.value,
          '3',
        );
      },
    );

    test(
      'cancels without renumbering and appends a reversal linked to its persisted origin',
      () async {
        const invoiceId = 'sale-canceled';
        await database.insumoDao.insertInsumos([
          InsumoEntity(
            id: 'ins-1',
            name: 'Rice',
            consumptionUom: 'kg',
            stock: 9,
            averageCost: 1,
          ),
        ]);
        await database.invoiceDao.insertInvoice(invoice(invoiceId));
        await database.movementDao.insertMovement(
          movement('original-movement', invoiceId: invoiceId, quantity: -1),
        );

        await database.salesTransactionDao.executeVoidTransaction(
          [movement('reversal-movement', invoiceId: invoiceId)],
          invoice(invoiceId, isCanceled: true),
          null,
          false,
        );

        final savedInvoice = await database.invoiceDao.getInvoiceById(
          invoiceId,
        );
        final movements = await database.movementDao.findAllMovements();
        final reversal = movements.singleWhere(
          (item) => item.id == 'reversal-movement',
        );
        expect(savedInvoice?.number, '001-001-01-00000001');
        expect(savedInvoice?.isCanceled, isTrue);
        expect(movements, hasLength(2));
        expect(reversal.originMovementId, 'original-movement');
        expect(reversal.sourceDocumentId, invoiceId);
      },
    );
  });
}
