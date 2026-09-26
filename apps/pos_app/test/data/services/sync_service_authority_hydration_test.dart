import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:dio/dio.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
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
import 'package:pos_app/domain/services/inventory/authority_hydration_status.dart';

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
}

class MockDio extends Mock implements Dio {
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
          data: {'deltas': <String, dynamic>{}} as dynamic,
        )),
        returnValueForMissingStub: Future.value(Response<T>(
          requestOptions: RequestOptions(path: path),
          statusCode: 200,
          data: {'deltas': <String, dynamic>{}} as dynamic,
        )),
      );
}

/// Local test fixture builders mirroring the backend wire shape
/// (`InboundSyncRecipeVersionDto`, #519 U1): nested components plus the
/// per-version insumo authority closure.
Map<String, dynamic> wireVersion({
  String id = 'rv-1',
  String tenantId = 'tenant-alpha',
  String productId = 'prod-pizza',
  List<Map<String, dynamic>> components = const [],
  List<Map<String, dynamic>> insumos = const [],
}) {
  return {
    'id': id,
    'recipeVersionId': id,
    'tenantId': tenantId,
    'productId': productId,
    'recipeDocumentId': null,
    'productName': 'Pizza',
    'versionNumber': 1,
    'isActive': true,
    'publicationState': 'PUBLISHED',
    'effectiveAt': '2026-09-01T00:00:00Z',
    'effectiveUntil': null,
    'yieldQuantity': 1.0,
    'technicalShrinkPct': 0.0,
    'versionNote': null,
    'publishedAt': null,
    'posCreatedAt': null,
    'origin': 'BACKOFFICE',
    'suggestionState': 'NONE',
    'createdAt': '2026-08-30T00:00:00Z',
    'components': components,
    'insumos': insumos,
  };
}

Map<String, dynamic> wireComponent({
  String id = 'comp-1',
  String tenantId = 'tenant-alpha',
  String versionId = 'rv-1',
  String insumoId = 'ins-1',
}) {
  return {
    'id': id,
    'tenantId': tenantId,
    'recipeVersionId': versionId,
    'componentOrdinal': 0,
    'insumoId': insumoId,
    'quantityPerSaleUnit': 0.25,
    'grossQuantity': 0.2,
    'technicalShrinkPct': 0.0,
    'ingredientName': 'Mozzarella',
    'ingredientType': 'DIRECT',
    'componentUom': 'KG',
    'referenceVersionId': null,
  };
}

Map<String, dynamic> wireClosureInsumo({
  String id = 'ins-1',
  String tenantId = 'tenant-alpha',
}) {
  return {'id': id, 'tenantId': tenantId, 'name': 'Mozzarella', 'uom': 'KG'};
}

void main() {
  late AppDatabase database;
  late MockAuditRepository auditRepo;
  late MockSalesRepository salesRepo;
  late MockInventoryRepository inventoryRepo;
  late MockDio dio;
  late SyncService syncService;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    auditRepo = MockAuditRepository();
    salesRepo = MockSalesRepository();
    inventoryRepo = MockInventoryRepository();
    dio = MockDio();
    syncService = SyncService(
      auditRepo,
      salesRepo,
      inventoryRepo,
      dio,
      database: database,
    );
  });

  tearDown(() async {
    await database.close();
  });

  void stubDeltas(Map<String, dynamic> deltas) {
    when(dio.get(
      '/v1/sync/inbound/deltas',
      queryParameters: anyNamed('queryParameters'),
    )).thenAnswer((_) async => Response<Map<String, dynamic>>(
          requestOptions: RequestOptions(path: '/v1/sync/inbound/deltas'),
          statusCode: 200,
          data: {
            'deltas': deltas,
            'currentVersion': 'v-test-1',
            'serverTime': '2026-09-25T12:00:00Z',
          },
        ));
  }

  Future<int> countRows(String table) async {
    final rows = await database.database.rawQuery('SELECT COUNT(*) c FROM $table');
    return rows.first['c'] as int;
  }

  Future<String?> configValue(String key) async =>
      (await database.localConfigDao.getConfigByKey(key))?.value;

  test(
      'U4: a successful hydration stamps applied + timestamp + empty reason',
      () async {
    stubDeltas({
      'products': [
        {
          'id': 'prod-pizza',
          'name': 'Pizza',
          'uom': 'UND',
          'tenantId': 'tenant-alpha',
          'productType': 'PREPARED',
        }
      ],
      'recipeVersions': [
        wireVersion(
          insumos: [wireClosureInsumo(id: 'ins-1')],
          components: [wireComponent()],
        ),
      ],
    });

    final result = await syncService.pullInboundDeltas();

    expect(result, isNotNull);
    expect(await configValue(AuthorityHydrationStatus.resultKey), 'applied');
    final lastAt = await configValue(AuthorityHydrationStatus.lastAtKey);
    expect(lastAt, isNotNull);
    expect(lastAt, isNotEmpty);
    expect(DateTime.tryParse(lastAt!), isNotNull);
    expect(await configValue(AuthorityHydrationStatus.reasonKey), '');
    // The applied-ever marker is stamped on success and never overwritten
    // by a later refusal (#519 U5 row-primary semantics).
    final appliedAt = await configValue(AuthorityHydrationStatus.appliedAtKey);
    expect(appliedAt, isNotNull);
    expect(DateTime.tryParse(appliedAt!), isNotNull);
  });

  test('U4: a refused payload stamps refused + the machine reason', () async {
    stubDeltas({
      'products': [
        {
          'id': 'prod-pizza',
          'name': 'Pizza',
          'uom': 'UND',
          'tenantId': 'tenant-alpha',
          'productType': 'PREPARED',
        }
      ],
      'recipeVersions': [
        wireVersion(
          tenantId: 'tenant-alpha',
          insumos: [wireClosureInsumo(tenantId: 'tenant-beta')],
          components: [wireComponent()],
        ),
      ],
    });

    final result = await syncService.pullInboundDeltas();

    expect(result, isNotNull);
    expect(result!.authorityHydrationFailed, isTrue);
    expect(await configValue(AuthorityHydrationStatus.resultKey), 'refused');
    expect(
      await configValue(AuthorityHydrationStatus.reasonKey),
      result.authorityHydrationFailureReason,
    );
    expect(await configValue(AuthorityHydrationStatus.reasonKey), isNotEmpty);
    final lastAt = await configValue(AuthorityHydrationStatus.lastAtKey);
    expect(lastAt, isNotNull);
    expect(DateTime.tryParse(lastAt!), isNotNull);
    // A refusal must never stamp or overwrite the applied-ever marker.
    expect(await configValue(AuthorityHydrationStatus.appliedAtKey), isNull);
  });

  test('U4: a legacy response without the recipeVersions key stamps nothing',
      () async {
    stubDeltas({
      'products': [
        {
          'id': 'prod-pizza',
          'name': 'Pizza',
          'uom': 'UND',
          'tenantId': 'tenant-alpha',
          'productType': 'PREPARED',
        }
      ],
      'insumos': [],
    });

    final result = await syncService.pullInboundDeltas();

    expect(result, isNotNull);
    expect(
      await configValue(AuthorityHydrationStatus.lastAtKey),
      isNull,
      reason: 'a legacy pull must never claim a hydration verdict',
    );
    expect(await configValue(AuthorityHydrationStatus.resultKey), isNull);
    expect(await configValue(AuthorityHydrationStatus.reasonKey), isNull);
    expect(await configValue(AuthorityHydrationStatus.appliedAtKey), isNull);
  });

  test(
      'recipeVersions delta is adapted and hydrated; outcome reported in the result',
      () async {
    stubDeltas({
      'products': [
        {
          'id': 'prod-pizza',
          'name': 'Pizza',
          'uom': 'UND',
          'tenantId': 'tenant-alpha',
          'productType': 'PREPARED',
        }
      ],
      // The incremental insumos delta deliberately does NOT carry ins-1:
      // its authority facts travel inside the version closure (U1).
      'insumos': [],
      'recipeVersions': [
        wireVersion(
          insumos: [wireClosureInsumo(id: 'ins-1')],
          components: [wireComponent()],
        ),
      ],
    });

    final result = await syncService.pullInboundDeltas();

    expect(result, isNotNull);
    // The pull itself succeeded and ran the other handlers.
    expect(result!.productsCount, 1);
    // Hydration outcome is surfaced additively.
    expect(result.authorityHydrationFailed, isFalse);
    expect(result.authorityHydrationFailureReason, isNull);
    expect(result.authorityVersionsCount, 1);
    expect(result.authorityInsumosCount, 1);
    expect(result.authorityComponentsCount, 1);

    // The projection tables received the authority rows, including the
    // closure insumo that was absent from the incremental delta.
    expect(await countRows('authority_insumos'), 1);
    expect(await countRows('authority_recipe_versions'), 1);
    expect(await countRows('authority_recipe_version_components'), 1);
  });

  test(
      'hydration refusal (mixed tenant) does NOT fail the pull and IS reported',
      () async {
    stubDeltas({
      'products': [
        {
          'id': 'prod-pizza',
          'name': 'Pizza',
          'uom': 'UND',
          'tenantId': 'tenant-alpha',
          'productType': 'PREPARED',
        }
      ],
      'recipeVersions': [
        wireVersion(
          tenantId: 'tenant-alpha',
          insumos: [wireClosureInsumo(tenantId: 'tenant-beta')],
          components: [wireComponent()],
        ),
      ],
    });

    final result = await syncService.pullInboundDeltas();

    // The pull completed normally; only the authority projection refused.
    expect(result, isNotNull);
    expect(result!.productsCount, 1);
    expect(result.authorityHydrationFailed, isTrue);
    expect(result.authorityHydrationFailureReason, isNotNull);
    expect(result.authorityVersionsCount, 0);
    expect(await countRows('authority_insumos'), 0);
    expect(await countRows('authority_recipe_versions'), 0);
    expect(await countRows('authority_recipe_version_components'), 0);
  });

  test('a legacy response without the recipeVersions key is a no-op',
      () async {
    stubDeltas({
      'products': [
        {
          'id': 'prod-pizza',
          'name': 'Pizza',
          'uom': 'UND',
          'tenantId': 'tenant-alpha',
          'productType': 'PREPARED',
        }
      ],
      'insumos': [],
    });

    final result = await syncService.pullInboundDeltas();

    expect(result, isNotNull);
    expect(result!.productsCount, 1);
    expect(result.authorityHydrationFailed, isFalse);
    expect(result.authorityVersionsCount, 0);
    expect(result.authorityInsumosCount, 0);
    expect(result.authorityComponentsCount, 0);
    expect(await countRows('authority_insumos'), 0);
    expect(await countRows('authority_recipe_versions'), 0);
    expect(await countRows('authority_recipe_version_components'), 0);
  });
}
