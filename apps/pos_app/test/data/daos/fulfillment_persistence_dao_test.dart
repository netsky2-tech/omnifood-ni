import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:pos_app/data/models/fulfillment/fulfillment_persistence_entities.dart';
import 'package:pos_app/data/models/inventory/insumo_entity.dart';
import 'package:pos_app/data/models/inventory/movement_entity.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';

void main() {
  late AppDatabase database;

  setUp(
    () async => database = await $FloorAppDatabase
        .inMemoryDatabaseBuilder()
        .addCallback(inventoryMovementAppendOnlyCallback)
        .build(),
  );
  tearDown(() => database.close());

  test(
    'round-trips tenant fulfillment with durable pending print state',
    () async {
      final dao = database.fulfillmentPersistenceDao;
      await dao.insertFulfillment(_fulfillment());
      await dao.insertPrintJob(_printJob());

      final fulfillment = await dao.findFulfillment(
        'fulfillment-1',
        'tenant-1',
      );
      final jobs = await dao.findRetryablePrintJobs('tenant-1');

      expect(fulfillment!.saleId, 'sale-1');
      expect(fulfillment.topologySnapshotId, 'tenant-1-r3');
      expect(
        fulfillment.linesPayload,
        '[{"lineId":"line-1","destination":"grill"}]',
      );
      expect(await dao.findFulfillment('fulfillment-1', 'tenant-2'), isNull);
      expect(jobs.single.idempotencyKey, 'print:fulfillment-1:ticket:0');
      expect(jobs.single.state, 'PENDING');
    },
  );

  test(
    'keeps retry jobs and outbox identities tenant-scoped and unique',
    () async {
      final dao = database.fulfillmentPersistenceDao;
      await dao.insertPrintJob(_printJob(state: 'FAILED', retryCount: 1));
      await dao.insertOutboxEvent(_outboxEvent());
      await dao.insertOutboxEvent(
        _outboxEvent(eventId: 'event-2', tenantId: 'tenant-2'),
      );

      final retryable = await dao.findRetryablePrintJobs('tenant-1');
      final events = await dao.findPendingOutboxEvents('tenant-1');

      expect(retryable.single.retryCount, 1);
      expect(retryable.single.state, 'FAILED');
      expect(events.single.eventId, 'event-1');
      expect(events.single.sourceSequence, 7);
      await expectLater(
        dao.insertPrintJob(_printJob()),
        throwsA(isA<Exception>()),
      );
      await expectLater(
        dao.insertOutboxEvent(_outboxEvent(eventId: 'event-duplicate')),
        throwsA(isA<Exception>()),
      );
    },
  );

  test('commits checkout effects once and rolls them back on late failure', () async {
    await _seed(database);
    await _checkout(database, shouldFail: false);

    expect((await database.invoiceDao.getInvoiceById('sale-1'))?.number, '001-001-01-00000001');
    expect((await database.insumoDao.findInsumoById('ins-1'))?.stock, 9);
    expect((await database.localConfigDao.getConfigByKey('dgi_current_number'))?.value, '2');
    expect(await database.fulfillmentPersistenceDao.findFulfillment('fulfillment-sale-1', 'tenant-1'), isNotNull);
    expect((await database.fulfillmentPersistenceDao.findRetryablePrintJobs('tenant-1')), hasLength(1));
    expect((await database.fulfillmentPersistenceDao.findPendingOutboxEvents('tenant-1')).single.payloadHash, isNot('claimed'));

    await expectLater(_checkout(database, id: 'sale-failed', shouldFail: true), throwsA(isA<Exception>()));
    expect(await database.invoiceDao.getInvoiceById('sale-failed'), isNull);
    expect(await database.fulfillmentPersistenceDao.findFulfillment('fulfillment-sale-failed', 'tenant-1'), isNull);
    expect((await database.insumoDao.findInsumoById('ins-1'))?.stock, 9);
    expect((await database.fulfillmentPersistenceDao.findFulfillment('fulfillment-sale-1', 'tenant-1'))?.linesPayload, '[{"lineId":"line-1"}]');
    expect((await database.localConfigDao.getConfigByKey('dgi_current_number'))?.value, '2');
    expect((await database.fulfillmentPersistenceDao.findPendingOutboxEvents('tenant-1')), hasLength(1));
    expect((await database.movementDao.findAllMovements()), hasLength(1));
    expect((await database.fulfillmentPersistenceDao.findRetryablePrintJobs('tenant-1')).single.id, 'print-sale-1');
  });

  test('rejects sale-only divergence with the same claimed hash', () async {
    await _seed(database);
    await _checkout(database);
    final originalHash = (await database.fulfillmentPersistenceDao.findPendingOutboxEvents('tenant-1')).single.payloadHash;
    await expectLater(_checkout(database, total: 116), throwsA(isA<StateError>()));
    await _expectUnchanged(database, originalHash);
    await expectLater(_checkout(database, invoiceKey: 'changed-key'), throwsA(isA<StateError>()));
    await _expectUnchanged(database, originalHash);
  });

  test('rejects print-only divergence with the same claimed hash', () async {
    await _seed(database);
    await _checkout(database);
    final originalHash = (await database.fulfillmentPersistenceDao.findPendingOutboxEvents('tenant-1')).single.payloadHash;
    await expectLater(_checkout(database, printPayload: '{"lineId":"changed"}'), throwsA(isA<StateError>()));
    await _expectUnchanged(database, originalHash);
  });

  test('accepts an identical replay with reversed canonical collections', () async {
    await _seed(database);
    await _twoElementCheckout(database, false);
    await _twoElementCheckout(database, true);
    expect(await database.movementDao.findAllMovements(), hasLength(2));
    expect(await database.fulfillmentPersistenceDao.findRetryablePrintJobs('tenant-1'), hasLength(2));
    expect((await database.localConfigDao.getConfigByKey('dgi_current_number'))?.value, '2');
  });

  test('rejects changed fulfillment fields with the same claimed hash', () async {
    await _seed(database);
    await _checkout(database);
    final originalHash = (await database.fulfillmentPersistenceDao.findPendingOutboxEvents('tenant-1')).single.payloadHash;
    await expectLater(_checkout(database, fulfillmentPayload: '[{"lineId":"changed"}]'), throwsA(isA<StateError>()));
    await _expectUnchanged(database, originalHash);
  });

  test('rejects changed outbox fields with the same claimed hash', () async {
    await _seed(database);
    await _checkout(database);
    final originalHash = (await database.fulfillmentPersistenceDao.findPendingOutboxEvents('tenant-1')).single.payloadHash;
    await expectLater(_checkout(database, outboxState: 'SENT'), throwsA(isA<StateError>()));
    await _expectUnchanged(database, originalHash);
  });
}

Future<void> _seed(AppDatabase database) async {
  await database.localConfigDao.saveConfig(LocalConfigEntity(key: 'dgi_prefix', value: '001-001-01-'));
  await database.localConfigDao.saveConfig(LocalConfigEntity(key: 'dgi_current_number', value: '1'));
  await database.insumoDao.insertInsumos([InsumoEntity(id: 'ins-1', name: 'Rice', consumptionUom: 'kg', stock: 10, averageCost: 1)]);
}

Future<void> _checkout(AppDatabase database, {String id = 'sale-1', double total = 115, String printPayload = '{"lineId":"line-1"}', String fulfillmentPayload = '[{"lineId":"line-1"}]', String outboxState = 'PENDING', String invoiceKey = 'invoice-key', bool shouldFail = false}) => database.salesTransactionDao.executeFulfillmentSaleTransaction(
  InvoiceEntity(id: id, number: 'claimed', createdAt: 1, userId: 'cashier-1', subtotal: 100, totalTax: 15, total: total, idempotencyKey: invoiceKey, payloadHash: 'claimed'), [], [], [],
  [MovementEntity(id: 'movement-$id', insumoId: 'ins-1', type: 'SALE', quantity: -1, previousStock: 10, newStock: 9, timestamp: '2026-01-01T00:00:00Z', sourceDocumentType: 'invoice', sourceDocumentId: id)], null,
  FulfillmentRecordEntity(id: 'fulfillment-$id', tenantId: 'tenant-1', saleId: id, topologySnapshotId: 'tenant-1-r3', topologyRevision: 3, channel: 'PRINT_ONLY', routeState: 'ROUTED', deliveryState: 'PENDING', linesPayload: fulfillmentPayload),
  [PrintJobEntity(id: 'print-$id', tenantId: 'tenant-1', fulfillmentId: 'fulfillment-$id', documentKind: 'TICKET', sequence: 0, payload: printPayload, state: 'PENDING', retryCount: 0, idempotencyKey: 'print:fulfillment-$id:ticket:0')],
  OutboxEventEntity(eventId: 'event-$id', tenantId: 'tenant-1', deviceId: 'pos-1', sourceSequence: 7, aggregateType: 'fulfillment', aggregateId: 'fulfillment-$id', idempotencyKey: 'outbox:tenant-1:fulfillment-$id', payloadHash: 'claimed', topologyRevision: 3, state: outboxState, attempts: 0), shouldFail,
);

Future<void> _twoElementCheckout(AppDatabase database, bool reversed) {
  final movements = [MovementEntity(id: 'movement-a', insumoId: 'ins-1', type: 'SALE', quantity: -1, previousStock: 10, newStock: 9, timestamp: '2026-01-01T00:00:00Z', sourceDocumentId: 'sale-ordered'), MovementEntity(id: 'movement-b', insumoId: 'ins-1', type: 'SALE', quantity: -1, previousStock: 9, newStock: 8, timestamp: '2026-01-01T00:00:01Z', sourceDocumentId: 'sale-ordered')];
  final prints = [PrintJobEntity(id: 'print-a', tenantId: 'tenant-1', fulfillmentId: 'fulfillment-ordered', documentKind: 'TICKET', sequence: 0, payload: 'a', state: 'PENDING', retryCount: 0, idempotencyKey: 'print-a'), PrintJobEntity(id: 'print-b', tenantId: 'tenant-1', fulfillmentId: 'fulfillment-ordered', documentKind: 'TICKET', sequence: 1, payload: 'b', state: 'PENDING', retryCount: 0, idempotencyKey: 'print-b')];
  final inputMovements = reversed ? movements.reversed.toList() : movements;
  final inputPrints = reversed ? prints.reversed.toList() : prints;
  return database.salesTransactionDao.executeFulfillmentSaleTransaction(InvoiceEntity(id: 'sale-ordered', number: 'claimed', createdAt: 1, userId: 'cashier-1', subtotal: 100, totalTax: 15, total: 115, idempotencyKey: 'ordered-key', payloadHash: 'claimed'), [], [], [], inputMovements, null, FulfillmentRecordEntity(id: 'fulfillment-ordered', tenantId: 'tenant-1', saleId: 'sale-ordered', topologySnapshotId: 'tenant-1-r3', topologyRevision: 3, channel: 'PRINT_ONLY', routeState: 'ROUTED', deliveryState: 'PENDING', linesPayload: '[]'), inputPrints, OutboxEventEntity(eventId: 'event-ordered', tenantId: 'tenant-1', deviceId: 'pos-1', sourceSequence: 7, aggregateType: 'fulfillment', aggregateId: 'fulfillment-ordered', idempotencyKey: 'outbox:ordered', payloadHash: 'claimed', topologyRevision: 3, state: 'PENDING', attempts: 0), false);
}

Future<void> _expectUnchanged(AppDatabase database, String originalHash) async {
  final invoice = await database.invoiceDao.getInvoiceById('sale-1');
  expect([invoice?.number, invoice?.total, invoice?.idempotencyKey], ['001-001-01-00000001', 115, 'invoice-key']);
  expect((await database.localConfigDao.getConfigByKey('dgi_current_number'))?.value, '2');
  expect((await database.insumoDao.findInsumoById('ins-1'))?.stock, 9);
  final movements = await database.movementDao.findAllMovements();
  expect([movements.length, movements.single.quantity], [1, -1]);
  final fulfillment = await database.fulfillmentPersistenceDao.findFulfillment('fulfillment-sale-1', 'tenant-1');
  expect([fulfillment?.routeState, fulfillment?.linesPayload], ['ROUTED', '[{"lineId":"line-1"}]']);
  final prints = await database.fulfillmentPersistenceDao.findRetryablePrintJobs('tenant-1');
  expect([prints.length, prints.single.state, prints.single.payload], [1, 'PENDING', '{"lineId":"line-1"}']);
  final events = await database.fulfillmentPersistenceDao.findPendingOutboxEvents('tenant-1');
  expect([events.length, events.single.state, events.single.payloadHash], [1, 'PENDING', originalHash]);
}

FulfillmentRecordEntity _fulfillment() => FulfillmentRecordEntity(
  id: 'fulfillment-1',
  tenantId: 'tenant-1',
  saleId: 'sale-1',
  topologySnapshotId: 'tenant-1-r3',
  topologyRevision: 3,
  channel: 'PRINT_ONLY',
  routeState: 'ROUTED',
  deliveryState: 'PENDING',
  linesPayload: '[{"lineId":"line-1","destination":"grill"}]',
);

PrintJobEntity _printJob({String state = 'PENDING', int retryCount = 0}) =>
    PrintJobEntity(
      id: 'print-1',
      tenantId: 'tenant-1',
      fulfillmentId: 'fulfillment-1',
      documentKind: 'TICKET',
      sequence: 0,
      payload: '{"lineId":"line-1"}',
      state: state,
      retryCount: retryCount,
      idempotencyKey: 'print:fulfillment-1:ticket:0',
    );

OutboxEventEntity _outboxEvent({
  String eventId = 'event-1',
  String tenantId = 'tenant-1',
}) => OutboxEventEntity(
  eventId: eventId,
  tenantId: tenantId,
  deviceId: 'pos-1',
  sourceSequence: 7,
  aggregateType: 'fulfillment',
  aggregateId: 'fulfillment-1',
  idempotencyKey: 'outbox:$tenantId:fulfillment-1',
  payloadHash: 'hash-1',
  topologyRevision: 3,
  state: 'PENDING',
  attempts: 0,
);
