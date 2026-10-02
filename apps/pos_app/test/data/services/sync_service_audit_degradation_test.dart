import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/audit_log_entity.dart';
import 'package:pos_app/data/models/inventory/kardex_correction_entity.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'package:pos_app/domain/models/audit_log.dart';
import 'package:pos_app/domain/models/inventory/count_session_document.dart';
import 'package:pos_app/domain/models/inventory/forensic_alert.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/models/inventory/production_order_document.dart';
import 'package:pos_app/domain/models/inventory/purchase.dart';
import 'package:pos_app/domain/models/inventory/recipe_version_document.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/security/cloud_auth_unavailable_exception.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// D-18 (SEVERE) regression contract: the audit-log stream is locally
/// durable (`audit_logs.is_synced = 0` until the backend ACKs) and must
/// NEVER fail the sync pass. On a PIN-only session the audit push is
/// rejected before send (`CloudAuthUnavailableException`, no HTTP 401),
/// which used to add `AuditLogs` to `domainErrors` and flip the badge
/// permanently red while every business document kept syncing.
class _FakeAuditRepository implements AuditRepository {
  Object? syncError;
  AuditSyncOutcome outcome = const AuditSyncOutcome.complete();

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError();

  @override
  Future<AuditSyncOutcome> syncLogs() async {
    final error = syncError;
    if (error != null) throw error;
    return outcome;
  }
}

class _FakeSalesRepository implements SalesRepository {
  Object? fetchError;
  List<Map<String, dynamic>> unsynced = const [];

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError();

  @override
  Future<List<Map<String, dynamic>>> getUnsyncedAggregates() async {
    final error = fetchError;
    if (error != null) throw error;
    return unsynced;
  }
}

class _FakeInventoryRepository implements InventoryRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError();

  @override
  Future<List<InventoryMovement>> getUnsyncedMovements() async => [];

  @override
  Future<List<Purchase>> getUnsyncedPurchases() async => [];

  @override
  Future<List<CountSessionDocument>> getUnsyncedCountSessionDocuments() async =>
      [];

  @override
  Future<List<ProductionOrderDocument>> getUnsyncedProductionOrders() async =>
      [];

  @override
  Future<List<RecipeVersionDocument>>
  getUnsyncedRecipeVersionDocuments() async => [];

  @override
  Future<List<ForensicAlert>> getUnsyncedForensicAlerts() async => [];

  @override
  Future<List<KardexCorrectionEntity>> getKardexCorrections() async => [];
}

Dio _syncDio() {
  final dio = Dio();
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        if (options.path == '/v1/sync/batch') {
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
                  },
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
  return dio;
}

void main() {
  group('D-18: audit degradation must not fail the sync pass', () {
    late Dio dio;
    late _FakeAuditRepository auditRepo;
    late _FakeSalesRepository salesRepo;
    late SyncService syncService;

    setUp(() {
      dio = _syncDio();
      auditRepo = _FakeAuditRepository();
      salesRepo = _FakeSalesRepository();
      syncService = SyncService(
        auditRepo,
        salesRepo,
        _FakeInventoryRepository(),
        dio,
      );
    });

    tearDown(() {
      syncService.dispose();
    });

    test(
      'audit CloudAuthUnavailableException (PIN-only pre-send reject) leaves '
      'the pass non-error with a truthy degraded signal and no AuditLogs '
      'token in lastSyncError',
      () async {
        auditRepo.syncError = const CloudAuthUnavailableException(
          reason: 'PIN-only session: no human credential for audit stream',
        );

        final outcome = await syncService.triggerManualSync();

        expect(outcome.status, isNot(SyncRunStatus.failed));
        expect(syncService.status, isNot(CloudSyncStatus.error));
        final lastError = syncService.lastSyncError;
        expect(lastError ?? '', isNot(contains('AuditLogs')));
        expect(syncService.isAuditStreamDegraded, isTrue);
        expect(syncService.lastAuditOutcome, isNotNull);
      },
    );

    test(
      'an audit retryable outcome degrades the pass to partial without an '
      'error status',
      () async {
        auditRepo.outcome = const AuditSyncOutcome.retryable(
          failedStreams: 1,
        );

        final outcome = await syncService.triggerManualSync();

        expect(outcome.status, SyncRunStatus.partial);
        expect(syncService.status, isNot(CloudSyncStatus.error));
        expect(syncService.lastSyncError ?? '', isNot(contains('AuditLogs')));
        expect(syncService.isAuditStreamDegraded, isTrue);
        expect(syncService.lastAuditOutcome, 'retryable');
      },
    );

    test('the degraded signal clears on the next fully synced pass', () async {
      auditRepo.outcome = const AuditSyncOutcome.retryable(
        failedStreams: 1,
      );
      await syncService.triggerManualSync();
      expect(syncService.isAuditStreamDegraded, isTrue);

      auditRepo.outcome = const AuditSyncOutcome.complete(
        completedStreams: 1,
      );
      await syncService.triggerManualSync();

      expect(syncService.isAuditStreamDegraded, isFalse);
      expect(syncService.lastAuditOutcome, 'complete');
      expect(syncService.status, CloudSyncStatus.idle);
    });

    test(
      'a business-domain failure still renders the error state even when '
      'the audit stream also degrades, and the summary never names AuditLogs',
      () async {
        auditRepo.syncError = const CloudAuthUnavailableException(
          reason: 'no human credential',
        );
        salesRepo.fetchError = Exception('sales sync down');

        await syncService.triggerManualSync();

        expect(syncService.status, CloudSyncStatus.error);
        final lastError = syncService.lastSyncError ?? '';
        expect(lastError, contains('Sales'));
        expect(lastError, isNot(contains('AuditLogs')));
        expect(syncService.isAuditStreamDegraded, isTrue);
      },
    );

    test(
      'a fully clean pass (audit complete, nothing pending) ends idle with '
      'no degraded signal',
      () async {
        final outcome = await syncService.triggerManualSync();

        expect(outcome.status, SyncRunStatus.complete);
        expect(syncService.status, CloudSyncStatus.idle);
        expect(syncService.isAuditStreamDegraded, isFalse);
        expect(syncService.lastAuditOutcome, 'complete');
      },
    );
  });

  group('D-18: getPendingAuditCount', () {
    late AppDatabase database;

    setUpAll(() {
      sqfliteFfiInit();
      databaseFactory = databaseFactoryFfi;
    });

    AuditLogEntity draft(String deviceId, String userId, int sequenceNo) =>
        AuditLogEntity(
          userId: userId,
          action: 'D18_TEST',
          timestamp: '2026-07-24T00:00:0$sequenceNo.000Z',
          deviceId: deviceId,
          isSynced: false,
          sequenceNo: sequenceNo,
          prevHash: 'GENESIS',
          entryHash: 'D18_TEST-$sequenceNo',
          remoteRefUuid: 'tenant-a-$deviceId-$userId-D18_TEST-$sequenceNo',
          tenantId: 'tenant-a',
        );

    test(
      'counts unsynced audit rows through the terminal database and drops to '
      'zero after they are marked synced',
      () async {
        database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
        final dao = database.auditDao;
        await dao.insertLog(draft('device-a', 'user-a', 1));
        await dao.insertLog(draft('device-a', 'user-a', 2));
        await dao.insertLog(draft('device-a', 'user-a', 3));
        final allLogs = await dao.findUnsyncedLogs();
        final syncedRow = allLogs.singleWhere((log) => log.sequenceNo == 3);
        await dao.markAsSynced([syncedRow.id!]);

        final syncService = SyncService(
          _FakeAuditRepository(),
          _FakeSalesRepository(),
          _FakeInventoryRepository(),
          _syncDio(),
          database: database,
        );

        expect(await syncService.getPendingAuditCount(), 2);

        await dao.markAsSynced([1, 2]);
        expect(await syncService.getPendingAuditCount(), 0);

        syncService.dispose();
        await database.close();
      },
    );

    test('returns 0 without a database instead of throwing', () async {
      final syncService = SyncService(
        _FakeAuditRepository(),
        _FakeSalesRepository(),
        _FakeInventoryRepository(),
        _syncDio(),
      );

      expect(await syncService.getPendingAuditCount(), 0);

      syncService.dispose();
    });
  });
}
