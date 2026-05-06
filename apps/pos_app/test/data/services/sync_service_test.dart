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
}
