import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/fulfillment/fulfillment_persistence_entities.dart';
import 'package:pos_app/data/models/inventory/insumo_entity.dart';
import 'package:pos_app/data/models/inventory/movement_entity.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';

/// #524 — Kardex stock provenance on the transaction paths.
///
/// Every movement row persisted by `SalesTransactionDao` must carry the real
/// transaction-time balance transition (`previousStock` → `newStock`), read
/// fresh inside the SQLite transaction, so the on-device Kardex never renders
/// the `0 → 0` placeholder for sales, voids, or credit notes.
void main() {
  late AppDatabase database;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'dgi_current_number', value: '1'),
    );
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'dgi_prefix', value: '001-001-01-'),
    );
  });

  tearDown(() async {
    await database.close();
  });

  InsumoEntity insumo({String id = 'ins-1', double stock = 10.0}) =>
      InsumoEntity(
        id: id,
        name: 'Mozzarella',
        consumptionUom: 'KG',
        stock: stock,
        averageCost: 1.0,
        isActive: true,
      );

  MovementEntity movement({
    String id = 'mov-1',
    String insumoId = 'ins-1',
    double quantity = -1,
    String? originMovementId,
    String? saleId,
  }) =>
      MovementEntity(
        id: id,
        insumoId: insumoId,
        type: 'sale',
        quantity: quantity,
        previousStock: 0,
        newStock: 0,
        timestamp: '2026-01-01T00:00:00Z',
        sourceDocumentType: 'SALE',
        originMovementId: originMovementId,
        saleId: saleId,
      );

  InvoiceEntity invoice(
    String id, {
    String type = 'regular',
    String? relatedInvoiceId,
    String number = '001-001-01-00000001',
    bool isCanceled = false,
  }) =>
      InvoiceEntity(
        id: id,
        number: number,
        createdAt: 1,
        userId: 'u1',
        subtotal: 100,
        totalTax: 15,
        total: 115,
        type: type,
        relatedInvoiceId: relatedInvoiceId,
        isCanceled: isCanceled,
      );

  group('SalesTransactionDao kardex stock (#524)', () {
    test(
        'K4: a multi-line sale over one insumo chains previousStock/newStock sequentially',
        () async {
      await database.insumoDao.insertInsumos([insumo(stock: 10.0)]);

      final mov1 = movement(id: 'mov-1', quantity: -2, saleId: 'sale-k4');
      final mov2 = movement(id: 'mov-2', quantity: -1, saleId: 'sale-k4');
      // Deliberately reversed relative to the deterministic (insumoId, id)
      // order so the persisted chain proves the sort happened.
      await database.salesTransactionDao.executeSaleTransaction(
        invoice('sale-k4'),
        [],
        [],
        [],
        [mov2, mov1],
        null,
        false,
      );

      final rows = await database.salesTransactionDao
          .getMovementsBySaleId('sale-k4')
        ..sort((a, b) => a.id.compareTo(b.id));
      expect(rows, hasLength(2));
      expect(rows[0].id, 'mov-1');
      expect(rows[0].previousStock, 10.0);
      expect(rows[0].newStock, 8.0);
      expect(rows[1].id, 'mov-2');
      expect(rows[1].previousStock, 8.0);
      expect(rows[1].newStock, 7.0);
      expect((await database.insumoDao.findInsumoById('ins-1'))!.stock, 7.0);
      // The input movement objects must stay untouched for replay hashing.
      expect(mov1.previousStock, 0.0);
      expect(mov1.newStock, 0.0);
      expect(mov2.previousStock, 0.0);
      expect(mov2.newStock, 0.0);
    });

    test(
        'K4-void: a void records the real reversal transition and restores the original balance',
        () async {
      await database.insumoDao.insertInsumos([insumo(stock: 10.0)]);
      await database.salesTransactionDao.executeSaleTransaction(
        invoice('sale-void'),
        [],
        [],
        [],
        [movement(id: 'mov-sale', quantity: -2, saleId: 'sale-void')],
        null,
        false,
      );
      expect((await database.insumoDao.findInsumoById('ins-1'))!.stock, 8.0);

      final voided = invoice(
        'sale-void',
        number: '001-001-01-00000001',
        isCanceled: true,
      );
      await database.salesTransactionDao.executeVoidTransaction(
        [
          movement(
            id: 'mov-void',
            quantity: 2,
            originMovementId: 'mov-sale',
            saleId: 'sale-void',
          ),
        ],
        voided,
        null,
        false,
        null,
        null,
      );

      final rows = await database.salesTransactionDao
          .getMovementsBySaleId('sale-void')
          .then((rows) => rows.where((r) => r.id == 'mov-void').toList());
      expect(rows, hasLength(1));
      expect(rows.single.quantity, 2.0);
      expect(rows.single.previousStock, 8.0);
      expect(rows.single.newStock, 10.0);
      expect((await database.insumoDao.findInsumoById('ins-1'))!.stock, 10.0);
    });

    test(
        'K4-credit-note: a credit note restock records the real transition',
        () async {
      await database.insumoDao.insertInsumos([insumo(stock: 10.0)]);
      await database.salesTransactionDao.insertInvoice(
        invoice('sale-origin'),
      );
      await database.salesTransactionDao.executeSaleTransaction(
        invoice('sale-void', number: '001-001-01-00000002'),
        [],
        [],
        [],
        [movement(id: 'mov-sale', quantity: -2, saleId: 'sale-void')],
        null,
        false,
      );
      expect((await database.insumoDao.findInsumoById('ins-1'))!.stock, 8.0);

      await database.salesTransactionDao.executeSaleTransaction(
        invoice(
          'cn-1',
          type: 'creditNote',
          relatedInvoiceId: 'sale-origin',
          number: '001-001-01-00000003',
        ),
        [],
        [],
        [],
        [movement(id: 'mov-cn', quantity: 2, saleId: 'cn-1')],
        null,
        false,
      );

      final rows = await database.salesTransactionDao
          .getMovementsBySaleId('cn-1');
      expect(rows, hasLength(1));
      expect(rows.single.quantity, 2.0);
      expect(rows.single.previousStock, 8.0);
      expect(rows.single.newStock, 10.0);
      expect((await database.insumoDao.findInsumoById('ins-1'))!.stock, 10.0);
    });

    test(
        'replay determinism: an identical fulfillment checkout replay is accepted after real stock was persisted',
        () async {
      await database.insumoDao.insertInsumos([insumo(stock: 10.0)]);

      List<MovementEntity> replayMovements() => [
            movement(id: 'mov-r1', quantity: -2, saleId: 'sale-replay'),
            movement(id: 'mov-r2', quantity: -1, saleId: 'sale-replay'),
          ];

      Future<void> checkout() =>
          database.salesTransactionDao.executeFulfillmentSaleTransaction(
            invoice('sale-replay'),
            [],
            [],
            [],
            replayMovements(),
            null,
            FulfillmentRecordEntity(
              id: 'fulfillment-replay',
              tenantId: 'tenant-1',
              saleId: 'sale-replay',
              topologySnapshotId: 'tenant-1-r3',
              topologyRevision: 3,
              channel: 'PRINT_ONLY',
              routeState: 'ROUTED',
              deliveryState: 'PENDING',
              linesPayload: '[]',
            ),
            [
              PrintJobEntity(
                id: 'print-replay',
                tenantId: 'tenant-1',
                fulfillmentId: 'fulfillment-replay',
                documentKind: 'TICKET',
                sequence: 0,
                payload: '{}',
                state: 'PENDING',
                retryCount: 0,
                idempotencyKey: 'print:fulfillment-replay:ticket:0',
              ),
            ],
            OutboxEventEntity(
              eventId: 'event-replay',
              tenantId: 'tenant-1',
              deviceId: 'pos-1',
              sourceSequence: 7,
              aggregateType: 'fulfillment',
              aggregateId: 'fulfillment-replay',
              idempotencyKey: 'outbox:tenant-1:fulfillment-replay',
              payloadHash: 'claimed',
              topologyRevision: 3,
              state: 'PENDING',
              attempts: 0,
            ),
            false,
          );

      await checkout();
      // Identical replay must not throw and must not double-apply stock.
      await checkout();

      final rows = await database.salesTransactionDao
          .getMovementsBySaleId('sale-replay')
        ..sort((a, b) => a.id.compareTo(b.id));
      expect(rows, hasLength(2));
      expect(rows[0].previousStock, 10.0);
      expect(rows[0].newStock, 8.0);
      expect(rows[1].previousStock, 8.0);
      expect(rows[1].newStock, 7.0);
      expect((await database.insumoDao.findInsumoById('ins-1'))!.stock, 7.0);
    });
  });
}
