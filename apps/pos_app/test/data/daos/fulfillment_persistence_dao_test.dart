import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:pos_app/data/models/fulfillment/fulfillment_persistence_entities.dart';

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
