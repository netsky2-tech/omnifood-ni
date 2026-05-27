import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';

import 'sync_service_test.mocks.dart';

@GenerateMocks([AuditRepository, SalesRepository, Dio])
void main() {
  late SyncService syncService;
  late MockAuditRepository mockAuditRepository;
  late MockSalesRepository mockSalesRepository;
  late MockDio mockDio;

  setUp(() {
    mockAuditRepository = MockAuditRepository();
    mockSalesRepository = MockSalesRepository();
    mockDio = MockDio();
    syncService = SyncService(mockAuditRepository, mockSalesRepository, mockDio);
  });

  test('syncs audit logs and marks sales as synced on successful sync', () async {
    final unsynced = [
      {'id': 'inv-1', 'number': '001-001-01-00000001'},
      {'id': 'inv-2', 'number': '001-001-01-00000002'},
    ];

    when(mockAuditRepository.syncLogs()).thenAnswer((_) async {});
    when(mockSalesRepository.getUnsyncedAggregates()).thenAnswer((_) async => unsynced);
    when(mockDio.post('/sales/sync', data: unsynced)).thenAnswer(
      (_) async => Response(
        data: {'ok': true},
        statusCode: 200,
        requestOptions: RequestOptions(path: '/sales/sync'),
      ),
    );

    await syncService.triggerManualSync();

    verify(mockAuditRepository.syncLogs()).called(1);
    verify(mockDio.post('/sales/sync', data: unsynced)).called(1);
    verify(mockSalesRepository.markAsSynced(['inv-1', 'inv-2'])).called(1);
  });

  test('does not mark sales as synced when sync endpoint returns error', () async {
    final unsynced = [
      {'id': 'inv-23', 'number': '001-001-01-00000023'},
    ];

    when(mockAuditRepository.syncLogs()).thenAnswer((_) async {});
    when(mockSalesRepository.getUnsyncedAggregates()).thenAnswer((_) async => unsynced);
    when(mockDio.post('/sales/sync', data: unsynced)).thenThrow(
      DioException(
        requestOptions: RequestOptions(path: '/sales/sync'),
        response: Response(
          data: {'error': 'Invalid invoice data'},
          statusCode: 400,
          requestOptions: RequestOptions(path: '/sales/sync'),
        ),
        type: DioExceptionType.badResponse,
      ),
    );

    await syncService.triggerManualSync();

    verifyNever(mockSalesRepository.markAsSynced(any));
  });

  test('does not post when there are no unsynced sales', () async {
    when(mockAuditRepository.syncLogs()).thenAnswer((_) async {});
    when(mockSalesRepository.getUnsyncedAggregates()).thenAnswer((_) async => []);

    await syncService.triggerManualSync();

    verifyNever(mockDio.post(any, data: anyNamed('data')));
    verifyNever(mockSalesRepository.markAsSynced(any));
  });
}
