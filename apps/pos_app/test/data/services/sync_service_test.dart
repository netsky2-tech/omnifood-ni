import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:dio/dio.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';

import 'sync_service_test.mocks.dart';

@GenerateMocks([AuditRepository, SalesRepository, InventoryRepository, Dio])
void main() {
  late SyncService syncService;
  late MockAuditRepository mockAuditRepository;
  late MockSalesRepository mockSalesRepository;
  late MockInventoryRepository mockInventoryRepository;
  late MockDio mockDio;

  setUp(() {
    mockAuditRepository = MockAuditRepository();
    mockSalesRepository = MockSalesRepository();
    mockInventoryRepository = MockInventoryRepository();
    mockDio = MockDio();
    syncService = SyncService(
      mockAuditRepository,
      mockSalesRepository,
      mockInventoryRepository,
      mockDio,
    );
  });

  group('SyncService - Inventory Movements', () {
    test('should sync inventory movements to cloud', () async {
      final movements = [
        InventoryMovement(
          id: '1',
          insumoId: 'ins-1',
          type: MovementType.sale,
          quantity: 1,
          previousStock: 10,
          newStock: 9,
          timestamp: DateTime.now(),
        ),
      ];

      when(mockInventoryRepository.getUnsyncedMovements())
          .thenAnswer((_) async => movements);
      
      when(mockDio.post('/inventory/movements/sync', data: anyNamed('data')))
          .thenAnswer((_) async => Response(
                data: {},
                statusCode: 200,
                requestOptions: RequestOptions(path: ''),
              ));

      // This method doesn't exist yet, so we'll call triggerManualSync
      // which should internally call the new _syncInventoryMovements
      
      // We also need to mock existing sync calls in triggerManualSync
      when(mockAuditRepository.syncLogs()).thenAnswer((_) async => {});
      when(mockSalesRepository.getUnsyncedAggregates()).thenAnswer((_) async => []);

      await syncService.triggerManualSync();

      verify(mockInventoryRepository.getUnsyncedMovements()).called(1);
      verify(mockDio.post('/inventory/movements/sync', data: anyNamed('data'))).called(1);
      verify(mockInventoryRepository.markMovementAsSynced('1')).called(1);
    });
  });

  group('SyncService - Poison Pill Isolation', () {
    test('should mark only failing record as failed when 4xx error occurs in sales batch', () async {
      // GIVEN: 50 unsynced sales with invoice #23 having bad data
      final unsyncedSales = List<Map<String, dynamic>>.generate(
        50,
        (i) => {'id': 'inv-${i + 1}', 'number': '001-001-01-${(i + 1).toString().padLeft(8, '0')}'},
      );

      when(mockSalesRepository.getUnsyncedAggregates())
          .thenAnswer((_) async => unsyncedSales);
      
      // Mock audit repository
      when(mockAuditRepository.syncLogs()).thenAnswer((_) async => {});
      when(mockInventoryRepository.getUnsyncedMovements())
          .thenAnswer((_) async => []);

      // WHEN: invoice #23 (index 22) returns 400 Bad Request
      when(mockDio.post('/sales/sync', data: anyNamed('data')))
          .thenAnswer((invocation) async {
        final data = invocation.namedArguments[const Symbol('data')] as List<Map<String, dynamic>>;
        
        // Check if the batch contains the poison pill (inv-23)
        final hasPoisonPill = data.any((item) => item['id'] == 'inv-23');
        
        if (hasPoisonPill && data.length == 1) {
          // Single record with poison pill - return 400
          throw DioException(
            requestOptions: RequestOptions(path: '/sales/sync'),
            response: Response(
              data: {'error': 'Invalid invoice data'},
              statusCode: 400,
              requestOptions: RequestOptions(path: '/sales/sync'),
            ),
            type: DioExceptionType.badResponse,
          );
        } else if (hasPoisonPill) {
          // Batch with poison pill - return 400 to trigger binary search
          throw DioException(
            requestOptions: RequestOptions(path: '/sales/sync'),
            response: Response(
              data: {'error': 'Invalid invoice data'},
              statusCode: 400,
              requestOptions: RequestOptions(path: '/sales/sync'),
            ),
            type: DioExceptionType.badResponse,
          );
        } else {
          // Batch without poison pill - return success
          return Response(
            data: {'synced': data.length},
            statusCode: 200,
            requestOptions: RequestOptions(path: '/sales/sync'),
          );
        }
      });

      // Execute sync
      await syncService.triggerManualSync();

      // THEN: Only invoice #23 should be marked as failed, rest should be synced
      verify(mockSalesRepository.markAsFailed('inv-23')).called(1);
      verifyNever(mockSalesRepository.markAsFailed(argThat(isNot('inv-23'))));
      
      // All other invoices should be marked as synced
      for (var i = 1; i <= 50; i++) {
        if (i != 23) {
          verify(mockSalesRepository.markAsSynced('inv-$i')).called(1);
        }
      }
      verifyNever(mockSalesRepository.markAsSynced('inv-23'));
    });

    test('should retry entire batch on 5xx error without marking individual records failed', () async {
      // GIVEN: 10 unsynced sales
      final unsyncedSales = List<Map<String, dynamic>>.generate(
        10,
        (i) => {'id': 'inv-${i + 1}', 'number': '001-001-01-${(i + 1).toString().padLeft(8, '0')}'},
      );

      when(mockSalesRepository.getUnsyncedAggregates())
          .thenAnswer((_) async => unsyncedSales);
      
      when(mockAuditRepository.syncLogs()).thenAnswer((_) async => {});
      when(mockInventoryRepository.getUnsyncedMovements())
          .thenAnswer((_) async => []);

      // WHEN: server returns 503 Service Unavailable
      when(mockDio.post('/sales/sync', data: anyNamed('data')))
          .thenThrow(DioException(
            requestOptions: RequestOptions(path: '/sales/sync'),
            response: Response(
              data: {'error': 'Service Unavailable'},
              statusCode: 503,
              requestOptions: RequestOptions(path: '/sales/sync'),
            ),
            type: DioExceptionType.badResponse,
          ));

      // Execute sync
      await syncService.triggerManualSync();

      // THEN: No records should be marked as failed or synced
      verifyNever(mockSalesRepository.markAsFailed(any));
      verifyNever(mockSalesRepository.markAsSynced(any));
    });

    test('should handle multiple poison pills in one batch', () async {
      // GIVEN: 50 unsynced sales with bad data at #10, #25, #40
      final unsyncedSales = List<Map<String, dynamic>>.generate(
        50,
        (i) => {'id': 'inv-${i + 1}', 'number': '001-001-01-${(i + 1).toString().padLeft(8, '0')}'},
      );

      when(mockSalesRepository.getUnsyncedAggregates())
          .thenAnswer((_) async => unsyncedSales);
      
      when(mockAuditRepository.syncLogs()).thenAnswer((_) async => {});
      when(mockInventoryRepository.getUnsyncedMovements())
          .thenAnswer((_) async => []);

      // Mock 4xx for poison pills, 200 for others
      final poisonPillIds = {'inv-10', 'inv-25', 'inv-40'};
      when(mockDio.post('/sales/sync', data: anyNamed('data')))
          .thenAnswer((invocation) async {
        final data = invocation.namedArguments[const Symbol('data')] as List<Map<String, dynamic>>;
        final idsInBatch = data.map((d) => d['id'] as String).toSet();
        
        // If batch contains any poison pill and only that poison pill, return 400
        final poisonPillsInBatch = idsInBatch.intersection(poisonPillIds);
        if (poisonPillsInBatch.isNotEmpty && idsInBatch.length == 1) {
          throw DioException(
            requestOptions: RequestOptions(path: '/sales/sync'),
            response: Response(
              data: {'error': 'Invalid invoice data'},
              statusCode: 400,
              requestOptions: RequestOptions(path: '/sales/sync'),
            ),
            type: DioExceptionType.badResponse,
          );
        } else if (poisonPillsInBatch.isNotEmpty) {
          // Multiple records including poison pill - return 400 to trigger split
          throw DioException(
            requestOptions: RequestOptions(path: '/sales/sync'),
            response: Response(
              data: {'error': 'Invalid invoice data'},
              statusCode: 400,
              requestOptions: RequestOptions(path: '/sales/sync'),
            ),
            type: DioExceptionType.badResponse,
          );
        } else {
          // No poison pills - return success
          return Response(
            data: {'synced': data.length},
            statusCode: 200,
            requestOptions: RequestOptions(path: '/sales/sync'),
          );
        }
      });

      // Execute sync
      await syncService.triggerManualSync();

      // THEN: Only the three poison pills should be marked as failed
      verify(mockSalesRepository.markAsFailed('inv-10')).called(1);
      verify(mockSalesRepository.markAsFailed('inv-25')).called(1);
      verify(mockSalesRepository.markAsFailed('inv-40')).called(1);
      verifyNever(mockSalesRepository.markAsFailed(argThat(isIn(['inv-5', 'inv-20', 'inv-30']))));
      
      // All other invoices should be marked as synced
      for (var i = 1; i <= 50; i++) {
        if (!poisonPillIds.contains('inv-$i')) {
          verify(mockSalesRepository.markAsSynced('inv-$i')).called(1);
        }
      }
    });
  });

  group('SyncService - Inventory Movements Poison Pill Isolation', () {
    test('should mark only failing movement as failed when 4xx error occurs', () async {
      // GIVEN: 10 unsynced movements with movement #5 having bad data
      final movements = List<InventoryMovement>.generate(
        10,
        (i) => InventoryMovement(
          id: 'mov-${i + 1}',
          insumoId: 'ins-${i + 1}',
          type: MovementType.sale,
          quantity: 1,
          previousStock: 10,
          newStock: 9,
          timestamp: DateTime.now(),
        ),
      );

      when(mockInventoryRepository.getUnsyncedMovements())
          .thenAnswer((_) async => movements);
      
      when(mockAuditRepository.syncLogs()).thenAnswer((_) async => {});
      when(mockSalesRepository.getUnsyncedAggregates()).thenAnswer((_) async => []);

      // WHEN: movement #5 returns 400 Bad Request
      final poisonPillId = 'mov-5';
      when(mockDio.post('/inventory/movements/sync', data: anyNamed('data')))
          .thenAnswer((invocation) async {
        final data = invocation.namedArguments[const Symbol('data')] as List<dynamic>;
        final idsInBatch = data.map((d) => d['id'] as String).toSet();
        
        if (idsInBatch.contains(poisonPillId) && idsInBatch.length == 1) {
          throw DioException(
            requestOptions: RequestOptions(path: '/inventory/movements/sync'),
            response: Response(
              data: {'error': 'Invalid movement data'},
              statusCode: 400,
              requestOptions: RequestOptions(path: '/inventory/movements/sync'),
            ),
            type: DioExceptionType.badResponse,
          );
        } else if (idsInBatch.contains(poisonPillId)) {
          throw DioException(
            requestOptions: RequestOptions(path: '/inventory/movements/sync'),
            response: Response(
              data: {'error': 'Invalid movement data'},
              statusCode: 400,
              requestOptions: RequestOptions(path: '/inventory/movements/sync'),
            ),
            type: DioExceptionType.badResponse,
          );
        } else {
          return Response(
            data: {'synced': data.length},
            statusCode: 200,
            requestOptions: RequestOptions(path: '/inventory/movements/sync'),
          );
        }
      });

      // Execute sync
      await syncService.triggerManualSync();

      // THEN: Only movement #5 should be marked as failed, rest should be synced
      verify(mockInventoryRepository.markMovementAsFailed(poisonPillId)).called(1);
      verifyNever(mockInventoryRepository.markMovementAsFailed(argThat(isNot(poisonPillId))));
      
      for (var i = 1; i <= 10; i++) {
        if (i != 5) {
          verify(mockInventoryRepository.markMovementAsSynced('mov-$i')).called(1);
        }
      }
      verifyNever(mockInventoryRepository.markMovementAsSynced(poisonPillId));
    });

    test('should handle network timeout without marking any movements', () async {
      // GIVEN: 5 unsynced movements
      final movements = List<InventoryMovement>.generate(
        5,
        (i) => InventoryMovement(
          id: 'mov-${i + 1}',
          insumoId: 'ins-${i + 1}',
          type: MovementType.sale,
          quantity: 1,
          previousStock: 10,
          newStock: 9,
          timestamp: DateTime.now(),
        ),
      );

      when(mockInventoryRepository.getUnsyncedMovements())
          .thenAnswer((_) async => movements);
      
      when(mockAuditRepository.syncLogs()).thenAnswer((_) async => {});
      when(mockSalesRepository.getUnsyncedAggregates()).thenAnswer((_) async => []);

      // WHEN: network timeout occurs
      when(mockDio.post('/inventory/movements/sync', data: anyNamed('data')))
          .thenThrow(DioException(
            requestOptions: RequestOptions(path: '/inventory/movements/sync'),
            type: DioExceptionType.connectionTimeout,
            error: 'Connection timeout',
          ));

      // Execute sync
      await syncService.triggerManualSync();

      // THEN: No movements should be marked as failed or synced
      verifyNever(mockInventoryRepository.markMovementAsFailed(any));
      verifyNever(mockInventoryRepository.markMovementAsSynced(any));
    });
  });
}
