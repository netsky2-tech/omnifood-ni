import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:dio/dio.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/models/inventory/purchase.dart';
import 'package:pos_app/domain/models/inventory/production_order_document.dart';
import 'package:pos_app/domain/models/inventory/count_session_document.dart';
import 'package:pos_app/domain/models/inventory/forensic_alert.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/models/inventory/recipe_version_document.dart';
import 'package:pos_app/data/models/inventory/kardex_correction_entity.dart';

class MockAuditRepository extends Mock implements AuditRepository {
  @override
  Future<AuditSyncOutcome> syncLogs() => super.noSuchMethod(
        Invocation.method(#syncLogs, []),
        returnValue: Future.value(const AuditSyncOutcome.complete()),
        returnValueForMissingStub:
            Future.value(const AuditSyncOutcome.complete()),
      );

  @override
  String get deviceId => 'test-device-1';
}

class MockSalesRepository extends Mock implements SalesRepository {
  @override
  Future<List<Map<String, dynamic>>> getUnsyncedAggregates() =>
      super.noSuchMethod(
        Invocation.method(#getUnsyncedAggregates, []),
        returnValue: Future.value(<Map<String, dynamic>>[]),
        returnValueForMissingStub: Future.value(<Map<String, dynamic>>[]),
      );
}

class MockInventoryRepository extends Mock implements InventoryRepository {
  @override
  Future<List<Purchase>> getUnsyncedPurchases() => super.noSuchMethod(
        Invocation.method(#getUnsyncedPurchases, []),
        returnValue: Future.value(<Purchase>[]),
        returnValueForMissingStub: Future.value(<Purchase>[]),
      );

  @override
  Future<List<RecipeVersionDocument>> getUnsyncedRecipeVersionDocuments() =>
      super.noSuchMethod(
        Invocation.method(#getUnsyncedRecipeVersionDocuments, []),
        returnValue: Future.value(<RecipeVersionDocument>[]),
        returnValueForMissingStub: Future.value(<RecipeVersionDocument>[]),
      );

  @override
  Future<List<ProductionOrderDocument>> getUnsyncedProductionOrders() =>
      super.noSuchMethod(
        Invocation.method(#getUnsyncedProductionOrders, []),
        returnValue: Future.value(<ProductionOrderDocument>[]),
        returnValueForMissingStub: Future.value(<ProductionOrderDocument>[]),
      );

  @override
  Future<List<CountSessionDocument>> getUnsyncedCountSessionDocuments() =>
      super.noSuchMethod(
        Invocation.method(#getUnsyncedCountSessionDocuments, []),
        returnValue: Future.value(<CountSessionDocument>[]),
        returnValueForMissingStub: Future.value(<CountSessionDocument>[]),
      );

  @override
  Future<List<ForensicAlert>> getUnsyncedForensicAlerts() =>
      super.noSuchMethod(
        Invocation.method(#getUnsyncedForensicAlerts, []),
        returnValue: Future.value(<ForensicAlert>[]),
        returnValueForMissingStub: Future.value(<ForensicAlert>[]),
      );

  @override
  Future<List<InventoryMovement>> getUnsyncedMovements() =>
      super.noSuchMethod(
        Invocation.method(#getUnsyncedMovements, []),
        returnValue: Future.value(<InventoryMovement>[]),
        returnValueForMissingStub: Future.value(<InventoryMovement>[]),
      );

  @override
  Future<List<ForensicAlert>> getForensicAlerts() => super.noSuchMethod(
        Invocation.method(#getForensicAlerts, []),
        returnValue: Future.value(<ForensicAlert>[]),
        returnValueForMissingStub: Future.value(<ForensicAlert>[]),
      );

  @override
  Future<List<KardexCorrectionEntity>> getKardexCorrections() =>
      super.noSuchMethod(
        Invocation.method(#getKardexCorrections, []),
        returnValue: Future.value(<KardexCorrectionEntity>[]),
        returnValueForMissingStub: Future.value(<KardexCorrectionEntity>[]),
      );
}

class MockDio extends Mock implements Dio {
  @override
  Future<Response<T>> post<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
    ProgressCallback? onSendProgress,
    ProgressCallback? onReceiveProgress,
  }) =>
      super.noSuchMethod(
        Invocation.method(#post, [path], {
          #data: data,
          #queryParameters: queryParameters,
          #options: options,
          #cancelToken: cancelToken,
          #onSendProgress: onSendProgress,
          #onReceiveProgress: onReceiveProgress,
        }),
        returnValue: Future.value(Response<T>(
          requestOptions: RequestOptions(path: path),
          statusCode: 200,
        )),
        returnValueForMissingStub: Future.value(Response<T>(
          requestOptions: RequestOptions(path: path),
          statusCode: 200,
        )),
      );

  @override
  Future<Response<T>> get<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
    ProgressCallback? onReceiveProgress,
  }) =>
      super.noSuchMethod(
        Invocation.method(#get, [path], {
          #data: data,
          #queryParameters: queryParameters,
          #options: options,
          #cancelToken: cancelToken,
          #onReceiveProgress: onReceiveProgress,
        }),
        returnValue: Future.value(Response<T>(
          requestOptions: RequestOptions(path: path),
          statusCode: 200,
          data: {'alerts': []} as dynamic,
        )),
        returnValueForMissingStub: Future.value(Response<T>(
          requestOptions: RequestOptions(path: path),
          statusCode: 200,
          data: {'alerts': []} as dynamic,
        )),
      );
}

void main() {
  late MockAuditRepository auditRepo;
  late MockSalesRepository salesRepo;
  late MockInventoryRepository inventoryRepo;
  late MockDio dio;
  late SyncService syncService;

  setUp(() {
    auditRepo = MockAuditRepository();
    salesRepo = MockSalesRepository();
    inventoryRepo = MockInventoryRepository();
    dio = MockDio();
    syncService = SyncService(auditRepo, salesRepo, inventoryRepo, dio);
  });

  test('syncs kardex corrections during manual sync pass', () async {
    final correction = KardexCorrectionEntity(
      id: 'corr-1',
      insumoId: 'ins-1',
      originMovementId: 'mov-1',
      triggerMovementId: 'mov-2',
      previousUnitCostNio: 40.0,
      recalculatedUnitCostNio: 45.0,
      deltaUnitCostNio: 5.0,
      totalDeltaCostNio: 50.0,
      affectedQuantity: 10.0,
      lineageHash: 'lineage-hash-1',
      createdAt: DateTime.now().toIso8601String(),
    );

    when(inventoryRepo.getKardexCorrections())
        .thenAnswer((_) async => [correction]);

    when(dio.post(
      '/inventory/regularization/sync',
      data: anyNamed('data'),
    )).thenAnswer((_) async => Response(
          requestOptions: RequestOptions(path: '/inventory/regularization/sync'),
          statusCode: 200,
          data: {'syncedCount': 1, 'duplicatesCount': 0},
        ));

    await syncService.triggerManualSync();

    verify(dio.post(
      '/inventory/regularization/sync',
      data: argThat(
        isA<Map<String, dynamic>>().having(
          (m) => (m['corrections'] as List).length,
          'corrections count',
          1,
        ),
        named: 'data',
      ),
    )).called(1);
  });
}
