import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:pos_app/data/models/fulfillment/fulfillment_persistence_entities.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'package:pos_app/domain/models/inventory/count_session_document.dart';
import 'package:pos_app/domain/models/inventory/forensic_alert.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/models/inventory/production_order_document.dart';
import 'package:pos_app/domain/models/inventory/purchase.dart';
import 'package:pos_app/domain/models/inventory/recipe_version_document.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';

class _FakeSalesRepository implements SalesRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError();

  @override
  Future<List<Map<String, dynamic>>> getUnsyncedAggregates() async => [];
}

class _FakeAuditRepository implements AuditRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError();

  @override
  Future<AuditSyncOutcome> syncLogs() async =>
      const AuditSyncOutcome.complete();
}

class _FakeInventoryRepository implements InventoryRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError();

  @override
  Future<List<InventoryMovement>> getUnsyncedMovements() async => [];

  @override
  Future<List<Purchase>> getUnsyncedPurchases() async => [];

  @override
  Future<List<CountSessionDocument>> getUnsyncedCountSessionDocuments() async => [];

  @override
  Future<List<ProductionOrderDocument>> getUnsyncedProductionOrders() async => [];

  @override
  Future<List<RecipeVersionDocument>> getUnsyncedRecipeVersionDocuments() async => [];

  @override
  Future<List<ForensicAlert>> getUnsyncedForensicAlerts() async => [];
}

void main() {
  late AppDatabase database;
  late Dio dio;
  late SyncService syncService;
  late List<Map<String, dynamic>> capturedRequests;

  setUp(() async {
    database = await $FloorAppDatabase
        .inMemoryDatabaseBuilder()
        .addCallback(inventoryMovementAppendOnlyCallback)
        .build();

    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'tenant_id', value: 'tenant-test-1'),
    );

    capturedRequests = [];
    dio = Dio();
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (options.path == '/v1/sync/batch') {
            capturedRequests.add(
              Map<String, dynamic>.from(options.data as Map),
            );
            return handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 201,
                data: {
                  'status': 'success',
                  'received': 1,
                  'processed': 1,
                  'results': [
                    {
                      'idempotencyKey':
                          ((options.data as Map)['records'] as List)[0]['idempotencyKey'],
                      'status': 'ACCEPTED',
                      'code': 'APPLIED',
                    }
                  ],
                },
              ),
            );
          }
          if (options.path.startsWith('/v1/catalog') ||
              options.path.startsWith('/v1/alerts')) {
            return handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 200,
                data: {
                  'products': [],
                  'catalogValues': [],
                  'insumos': [],
                  'recipes': [],
                  'users': [],
                  'securityProfiles': [],
                  'alerts': [],
                  'version': 1,
                },
              ),
            );
          }
          return handler.next(options);
        },
      ),
    );

    syncService = SyncService(
      _FakeAuditRepository(),
      _FakeSalesRepository(),
      _FakeInventoryRepository(),
      dio,
      database: database,
    );
  });

  tearDown(() async {
    await database.close();
  });

  test('syncs pending fulfillment outbox events to /v1/sync/batch and marks them SENT', () async {
    // 1. Seed fulfillment record and outbox event
    final fulfillment = FulfillmentRecordEntity(
      id: 'f-101',
      tenantId: 'tenant-test-1',
      saleId: 'sale-101',
      topologySnapshotId: 'snapshot-1',
      topologyRevision: 2,
      channel: 'KDS_AND_PRINT',
      routeState: 'ROUTED',
      deliveryState: 'PENDING',
      linesPayload: '[{"lineId":"l-1"}]',
    );
    await database.fulfillmentPersistenceDao.insertFulfillment(fulfillment);

    final outboxEvent = OutboxEventEntity(
      eventId: 'evt-101',
      tenantId: 'tenant-test-1',
      deviceId: 'pos-main',
      sourceSequence: 1,
      aggregateType: 'fulfillment',
      aggregateId: 'f-101',
      idempotencyKey: 'outbox:tenant-test-1:f-101',
      payloadHash: 'hash-f-101',
      topologyRevision: 2,
      state: 'PENDING',
      attempts: 0,
    );
    await database.fulfillmentPersistenceDao.insertOutboxEvent(outboxEvent);

    // 2. Trigger sync
    await syncService.triggerManualSync();

    expect(syncService.lastSyncError ?? '', isNot(contains('Fulfillment')));
    expect(capturedRequests, hasLength(1));

    final records = capturedRequests.single['records'] as List;
    expect(records, hasLength(1));
    final record = records.single as Map;
    expect(record['flowType'], 'fulfillment');
    expect(record['aggregateType'], 'fulfillment');
    expect(record['idempotencyKey'], 'outbox:tenant-test-1:f-101');
    expect(record['fulfillment']['id'], 'f-101');
    expect(record['fulfillment']['channel'], 'KDS_AND_PRINT');

    // 3. Verify outbox state updated to SENT
    final pendingRemaining = await database.fulfillmentPersistenceDao
        .findPendingOutboxEvents('tenant-test-1');
    expect(pendingRemaining, isEmpty);
  });
}
