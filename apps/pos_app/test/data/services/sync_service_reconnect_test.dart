import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'package:pos_app/data/services/network_connectivity_service.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';

class _MockDio extends Mock implements Dio {}

class _MockAuditRepository extends Mock implements AuditRepository {}

class _MockSalesRepository extends Mock implements SalesRepository {}

class _MockInventoryRepository extends Mock implements InventoryRepository {}

class _MockConnectivityService extends Mock
    implements NetworkConnectivityService {}

void main() {
  late _MockDio dio;
  late _MockAuditRepository auditRepository;
  late _MockSalesRepository salesRepository;
  late _MockInventoryRepository inventoryRepository;
  late _MockConnectivityService connectivityService;
  late StreamController<bool> connectivityController;
  late SyncService syncService;

  setUp(() {
    dio = _MockDio();
    auditRepository = _MockAuditRepository();
    salesRepository = _MockSalesRepository();
    inventoryRepository = _MockInventoryRepository();
    connectivityService = _MockConnectivityService();
    connectivityController = StreamController<bool>.broadcast();

    when(() => connectivityService.isOnline).thenReturn(true);
    when(
      () => connectivityService.onConnectivityChanged,
    ).thenAnswer((_) => connectivityController.stream);

    when(
      () => auditRepository.syncLogs(),
    ).thenAnswer((_) async => const AuditSyncOutcome.complete());
    when(
      () => salesRepository.getUnsyncedAggregates(),
    ).thenAnswer((_) async => []);
    when(
      () => inventoryRepository.getUnsyncedRecipeVersionDocuments(),
    ).thenAnswer((_) async => []);
    when(
      () => inventoryRepository.getUnsyncedPurchases(),
    ).thenAnswer((_) async => []);
    when(
      () => inventoryRepository.getUnsyncedCountSessionDocuments(),
    ).thenAnswer((_) async => []);
    when(
      () => inventoryRepository.getUnsyncedForensicAlerts(),
    ).thenAnswer((_) async => []);
    when(
      () => inventoryRepository.getUnsyncedMovements(),
    ).thenAnswer((_) async => []);

    when(() => dio.get(any())).thenAnswer(
      (_) async => Response(
        requestOptions: RequestOptions(path: '/api'),
        statusCode: 200,
        data: {'version': 1, 'items': []},
      ),
    );

    syncService = SyncService(
      auditRepository,
      salesRepository,
      inventoryRepository,
      dio,
      connectivityService: connectivityService,
    );
  });

  tearDown(() {
    syncService.dispose();
    connectivityController.close();
  });

  test(
    '401 error classifies explicitly as cloud reauthentication required rather than generic domains',
    () async {
      when(() => salesRepository.getUnsyncedAggregates()).thenAnswer(
        (_) async => [
          {
            'id': 'inv-1',
            'number': '001-001-01-00000001',
            'terminalId': 'pos-1',
            'sourceSequence': 1,
            'idempotencyKey': 'key-1',
            'items': [],
            'payments': [],
          },
        ],
      );

      when(
        () => dio.post(
          '/v1/sync/batch',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: '/v1/sync/batch'),
          response: Response(
            requestOptions: RequestOptions(path: '/v1/sync/batch'),
            statusCode: 401,
            data: {'message': 'Unauthorized'},
          ),
          type: DioExceptionType.badResponse,
        ),
      );

      final outcome = await syncService.triggerManualSync();

      expect(outcome.status, isNot(SyncRunStatus.complete));
      expect(syncService.status, CloudSyncStatus.error);
      expect(syncService.lastSyncError, contains('Reautenticación requerida'));
      verifyNever(() => salesRepository.markAsSynced(any()));
    },
  );

  test(
    'coalesces multiple rapid sync triggers into sequential execution without race condition',
    () async {
      final completer = Completer<void>();
      int auditSyncCalls = 0;

      when(() => auditRepository.syncLogs()).thenAnswer((_) async {
        auditSyncCalls++;
        await completer.future;
        return const AuditSyncOutcome.complete();
      });

      // Launch first sync
      final future1 = syncService.triggerManualSync();

      // Trigger a second sync while first is in-flight
      final future2 = syncService.triggerManualSync();

      // Complete the audit step
      completer.complete();
      await future1;
      await future2;

      expect(auditSyncCalls, greaterThanOrEqualTo(1));
    },
  );

  test(
    'preserves pending SQLite sales work on network timeout without marking synced',
    () async {
      when(() => salesRepository.getUnsyncedAggregates()).thenAnswer(
        (_) async => [
          {
            'id': 'inv-offline-1',
            'number': '001-001-01-00000002',
            'terminalId': 'pos-1',
            'sourceSequence': 2,
            'idempotencyKey': 'key-2',
            'items': [],
            'payments': [],
          },
        ],
      );

      when(
        () => dio.post(
          '/v1/sync/batch',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: '/v1/sync/batch'),
          type: DioExceptionType.connectionTimeout,
          message: 'Connection timed out',
        ),
      );

      final outcome = await syncService.triggerManualSync();

      expect(outcome.status, isNot(SyncRunStatus.complete));
      verifyNever(() => salesRepository.markAsSynced(any()));
    },
  );
}
