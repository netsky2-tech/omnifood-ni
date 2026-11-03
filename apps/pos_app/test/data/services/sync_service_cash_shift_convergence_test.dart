import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
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

  @override
  String get deviceId => 'Q802024120001';
}

class _FakeInventoryRepository implements InventoryRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);

  @override
  Future<List<InventoryMovement>> getUnsyncedMovements() async => [];

  @override
  Future<List<Purchase>> getUnsyncedPurchases() async => [];

  @override
  Future<List<CountSessionDocument>> getUnsyncedCountSessionDocuments() async =>
      [];

  @override
  Future<List<ProductionOrderDocument>> getUnsyncedProductionOrders() async => [];

  @override
  Future<List<RecipeVersionDocument>> getUnsyncedRecipeVersionDocuments() async =>
      [];

  @override
  Future<List<ForensicAlert>> getUnsyncedForensicAlerts() async => [];
}

void main() {
  late AppDatabase database;
  late Dio dio;
  late SyncService syncService;
  late List<Map<String, dynamic>> capturedShiftSyncRequests;

  const terminalId = 'Q802024120001';

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();

    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'tenant_id', value: 'tenant-prod-soho'),
    );

    capturedShiftSyncRequests = [];
    dio = Dio();
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (options.path == '/sales/shifts/sync') {
            capturedShiftSyncRequests.add(
              Map<String, dynamic>.from(options.data as Map),
            );
            final body = options.data as Map;
            final records = [
              ...(body['sessions'] as List),
              ...(body['movements'] as List),
            ];
            return handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 200,
                data: {
                  'received': records.length,
                  'processed': records.length,
                  'failed': 0,
                  'results': [
                    for (final record in records)
                      {
                        'idempotencyKey': (record as Map)['id'],
                        'status': 'ACCEPTED',
                      },
                  ],
                },
              ),
            );
          }
          return handler.resolve(
            Response(
              requestOptions: options,
              statusCode: 200,
              data: {'results': []},
            ),
          );
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
    syncService.dispose();
    await database.close();
  });

  group('Paso C (#943) - Sync Convergence & Infinite Re-Push Prevention', () {
    test(
        'An open shift marked pending is visible in getPendingOutboxCount and once accepted by backend is marked synced (stops infinite re-push)',
        () async {
      final openSession = CashierSessionEntity(
        id: 'shift-open-q80',
        userId: 'user-cajero-01',
        cashierName: 'Roberto Gómez',
        terminalId: terminalId,
        openedAt: DateTime.now().millisecondsSinceEpoch - 3600000,
        openingBalanceNio: 1000.0,
        openingBalanceUsd: 20.0,
        expectedNio: 1000.0,
        expectedUsd: 20.0,
        isClosed: false,
        syncStatus: 'pending',
      );
      await database.cashierSessionDao.insertSession(openSession);

      // 1. Pending open shift MUST be visible in outbox count
      final initialPendingCount = await syncService.getPendingOutboxCount();
      expect(
        initialPendingCount,
        1,
        reason:
            'A pending cashier session must be counted in getPendingOutboxCount so unconfirmed work is visible.',
      );

      // 2. Trigger first sync
      await syncService.triggerManualSync();

      expect(capturedShiftSyncRequests, hasLength(1));
      final payload = capturedShiftSyncRequests.first;
      final sessions = payload['sessions'] as List;
      expect(sessions, hasLength(1));
      expect(sessions.first['id'], 'shift-open-q80');
      expect(sessions.first['status'], 'OPEN');
      expect(sessions.first['cashierName'], 'Roberto Gómez');

      // 3. Verify session in local SQLite is now 'synced' and cashierName is preserved
      final shiftInDb = await database.cashierSessionDao.getSessionById('shift-open-q80');
      expect(shiftInDb, isNotNull);
      expect(
        shiftInDb!.syncStatus,
        'synced',
        reason:
            'An open shift accepted by the backend must be marked synced to prevent endless re-push.',
      );
      expect(shiftInDb.cashierName, 'Roberto Gómez');

      // 4. Outbox count should now be 0
      final afterSyncPendingCount = await syncService.getPendingOutboxCount();
      expect(afterSyncPendingCount, 0);

      // 5. Trigger second sync -> MUST NOT re-push the already synced open shift
      await syncService.triggerManualSync();
      expect(
        capturedShiftSyncRequests,
        hasLength(1),
        reason:
            'A synced open shift must not be pushed again on subsequent sync loops.',
      );

      // 6. When the shift is later closed or updated, setting syncStatus='pending', next sync pushes it
      final closedSession = CashierSessionEntity(
        id: openSession.id,
        userId: openSession.userId,
        cashierName: openSession.cashierName,
        terminalId: openSession.terminalId,
        openedAt: openSession.openedAt,
        closedAt: DateTime.now().millisecondsSinceEpoch,
        openingBalanceNio: openSession.openingBalanceNio,
        openingBalanceUsd: openSession.openingBalanceUsd,
        closingCountedNio: 1000.0,
        closingCountedUsd: 20.0,
        expectedNio: 1000.0,
        expectedUsd: 20.0,
        differenceNio: 0.0,
        differenceUsd: 0.0,
        zReportSequence: 1,
        isClosed: true,
        syncStatus: 'pending',
      );
      await database.cashierSessionDao.updateSession(closedSession);

      final closingPendingCount = await syncService.getPendingOutboxCount();
      expect(closingPendingCount, 1);

      await syncService.triggerManualSync();
      expect(capturedShiftSyncRequests, hasLength(2));
      final closingPayload = capturedShiftSyncRequests.last;
      final closingSessions = closingPayload['sessions'] as List;
      expect(closingSessions.first['id'], 'shift-open-q80');
      expect(closingSessions.first['status'], 'CLOSED');
      expect(closingSessions.first['zReportSequence'], 1);

      final finalShiftInDb =
          await database.cashierSessionDao.getSessionById('shift-open-q80');
      expect(finalShiftInDb!.syncStatus, 'synced');
      expect(await syncService.getPendingOutboxCount(), 0);
    });
  });
}
