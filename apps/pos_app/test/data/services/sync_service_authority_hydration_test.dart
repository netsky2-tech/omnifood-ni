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
import 'package:pos_app/data/models/inventory/authority_ingestion_verdict_entity.dart';
import 'package:pos_app/data/models/inventory/product_entity.dart';

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

  test(
      'U4: a blocked verdict write still cannot fail the pull (Q80 invariant)',
      () async {
    // Failure injected the way production actually hits it: the local write
    // itself refuses. `saveConfig` is an INSERT OR REPLACE, so a BEFORE INSERT
    // trigger scoped to the authority keys aborts exactly the telemetry write
    // and leaves every other table working.
    await database.database.execute('''
      CREATE TRIGGER test_block_authority_verdict_writes
      BEFORE INSERT ON local_configs
      WHEN NEW.key LIKE 'authority_hydration%'
      BEGIN
        SELECT RAISE(ABORT, 'test: authority verdict write blocked');
      END;
    ''');

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

    // The invariant this unit promised: hydration trouble is reported as a
    // value and never blocks a sale or a pull. Telemetry is downstream of the
    // hydration it describes, so a telemetry failure must not reach backwards
    // and undo the fact that the authority rows landed.
    final result = await syncService.pullInboundDeltas();

    expect(result, isNotNull);
    expect(result!.authorityHydrationFailed, isFalse);
    expect(result.authorityVersionsCount, 1);
    // The authority facts survived: hydration ran before the verdict write.
    expect(await countRows('authority_recipe_versions'), 1);
    expect(await countRows('authority_insumos'), 1);
    // And nothing was stamped, which is the accepted cost of best-effort
    // telemetry: the classifier stays `notHydrated`-adjacent rather than
    // claiming a verdict that was never persisted.
    expect(await configValue(AuthorityHydrationStatus.resultKey), isNull);
    expect(await configValue(AuthorityHydrationStatus.lastAtKey), isNull);
  });

  group('#613 inert recipe ingestion verdict', () {
    Map<String, dynamic> simpleProductRow({String id = 'prod-simple'}) => {
          'id': id,
          'name': 'Producto simple',
          'uom': 'UND',
          'tenantId': 'tenant-alpha',
          'productType': 'SIMPLE',
        };

    test(
        'one inert + one good recipe in the same payload: the good one '
        'hydrates, the inert one produces exactly one verdict and does NOT '
        'hydrate', () async {
      stubDeltas({
        'products': [
          {
            'id': 'prod-pizza',
            'name': 'Pizza',
            'uom': 'UND',
            'tenantId': 'tenant-alpha',
            'productType': 'PREPARED',
          },
          simpleProductRow(),
        ],
        'recipeVersions': [
          wireVersion(
            id: 'rv-good',
            productId: 'prod-pizza',
            insumos: [wireClosureInsumo(id: 'ins-1')],
            components: [wireComponent(id: 'comp-good', versionId: 'rv-good')],
          ),
          wireVersion(
            id: 'rv-inert',
            productId: 'prod-simple',
            insumos: [
              wireClosureInsumo(id: 'ins-2', tenantId: 'tenant-alpha'),
            ],
            components: [
              wireComponent(
                id: 'comp-inert',
                versionId: 'rv-inert',
                insumoId: 'ins-2',
              ),
            ],
          ),
        ],
      });

      final result = await syncService.pullInboundDeltas();

      expect(result, isNotNull);
      expect(result!.authorityHydrationFailed, isFalse);
      expect(result.authorityHydrationFailureReason, isNull);
      // Only the good recipe hydrates.
      expect(result.authorityVersionsCount, 1);
      expect(await countRows('authority_recipe_versions'), 1);
      final goodRows = await database.database.rawQuery(
        "SELECT * FROM authority_recipe_versions WHERE id = 'rv-good'",
      );
      expect(goodRows, hasLength(1));
      final inertRows = await database.database.rawQuery(
        "SELECT * FROM authority_recipe_versions WHERE id = 'rv-inert'",
      );
      expect(inertRows, isEmpty);
      final inertComponents = await database.database.rawQuery(
        "SELECT * FROM authority_recipe_version_components "
        "WHERE version_id = 'rv-inert'",
      );
      expect(inertComponents, isEmpty);

      // Exactly one verdict, keyed by the inert version id and code.
      final verdicts = await database.database.rawQuery(
        'SELECT * FROM authority_ingestion_verdicts',
      );
      expect(verdicts, hasLength(1));
      expect(verdicts.single['recipe_version_id'], 'rv-inert');
      expect(verdicts.single['code'], 'INERT_SIMPLE_PRODUCT');
      expect(verdicts.single['product_id'], 'prod-simple');

      // Aggregate telemetry for pilot tooling (count + reason).
      expect(
        await configValue(AuthorityIngestionVerdicts.inertCountKey),
        '1',
      );
      expect(
        await configValue(AuthorityIngestionVerdicts.inertReasonKey),
        'INERT_SIMPLE_PRODUCT',
      );
      // The existing hydration telemetry is still stamped.
      expect(await configValue(AuthorityHydrationStatus.resultKey), 'applied');
      expect(await configValue(AuthorityHydrationStatus.lastAtKey), isNotNull);
    });

    test(
        'a verdict insert thrown by the DAO degrades: pull still succeeds, '
        'no rethrow, hydration telemetry stamped', () async {
      // Failure injected at the persistence boundary: the verdict table is
      // gone, so every verdict insert throws.
      await database.database.execute(
        'DROP TABLE authority_ingestion_verdicts',
      );

      stubDeltas({
        'products': [
          {
            'id': 'prod-pizza',
            'name': 'Pizza',
            'uom': 'UND',
            'tenantId': 'tenant-alpha',
            'productType': 'PREPARED',
          },
          simpleProductRow(),
        ],
        'recipeVersions': [
          wireVersion(
            id: 'rv-good',
            productId: 'prod-pizza',
            insumos: [wireClosureInsumo(id: 'ins-1')],
            components: [wireComponent(id: 'comp-good', versionId: 'rv-good')],
          ),
          wireVersion(
            id: 'rv-inert',
            productId: 'prod-simple',
            insumos: [
              wireClosureInsumo(id: 'ins-2', tenantId: 'tenant-alpha'),
            ],
            components: [
              wireComponent(
                id: 'comp-inert',
                versionId: 'rv-inert',
                insumoId: 'ins-2',
              ),
            ],
          ),
        ],
      });

      final result = await syncService.pullInboundDeltas();

      // The pull succeeded and the hydration verdict is the applied one: a
      // verdict write failure must not flip it to failed.
      expect(result, isNotNull);
      expect(result!.authorityHydrationFailed, isFalse);
      expect(result.authorityVersionsCount, 1);
      expect(await countRows('authority_recipe_versions'), 1);
      expect(await configValue(AuthorityHydrationStatus.resultKey), 'applied');
      final lastAt = await configValue(AuthorityHydrationStatus.lastAtKey);
      expect(lastAt, isNotNull);
      expect(DateTime.tryParse(lastAt!), isNotNull);
    });

    test(
        're-pull of the same inert payload does not duplicate verdict rows '
        '(insert-if-absent)', () async {
      stubDeltas({
        'products': [simpleProductRow()],
        'recipeVersions': [
          wireVersion(
            id: 'rv-inert',
            productId: 'prod-simple',
            insumos: [
              wireClosureInsumo(id: 'ins-2', tenantId: 'tenant-alpha'),
            ],
            components: [
              wireComponent(
                id: 'comp-inert',
                versionId: 'rv-inert',
                insumoId: 'ins-2',
              ),
            ],
          ),
        ],
      });

      await syncService.pullInboundDeltas();
      expect(await countRows('authority_ingestion_verdicts'), 1);

      // Same server page re-sent on the next cycle (the watermark only
      // advances on a successful pull, and the stub ignores it).
      await syncService.pullInboundDeltas();
      expect(await countRows('authority_ingestion_verdicts'), 1);
      expect(await countRows('authority_recipe_versions'), 0);
      expect(
        await configValue(AuthorityIngestionVerdicts.inertCountKey),
        '1',
      );
    });

    test(
        'mixed-tenant payload is still refused wholesale even when a row '
        'would be inert (structural refusal regression guard)', () async {
      stubDeltas({
        'products': [simpleProductRow()],
        'recipeVersions': [
          wireVersion(
            id: 'rv-a',
            productId: 'prod-simple',
          ),
          wireVersion(
            id: 'rv-b',
            tenantId: 'tenant-beta',
            productId: 'prod-simple',
          ),
        ],
      });

      final result = await syncService.pullInboundDeltas();

      expect(result, isNotNull);
      expect(result!.authorityHydrationFailed, isTrue);
      expect(result.authorityHydrationFailureReason, contains('tenant'));
      expect(await countRows('authority_recipe_versions'), 0);
      expect(await countRows('authority_ingestion_verdicts'), 0);
    });
  });

  group('#613 Unit B — getInertRecipeVerdictReport (surfacing read model)', () {
    Future<void> insertProduct(String id, String name) {
      return database.productDao.insertProducts([
        ProductEntity(
          id: id,
          name: name,
          uom: 'UND',
          stock: 0,
          averageCost: 0,
          sellPrice: 0,
          productType: 'SIMPLE',
        ),
      ]);
    }

    Future<void> insertVerdict(String versionId, String productId) {
      return database.authorityIngestionVerdictDao.insertVerdictIfAbsent(
        AuthorityIngestionVerdictEntity(
          recipeVersionId: versionId,
          code: AuthorityIngestionVerdicts.inertSimpleProductCode,
          productId: productId,
          tenantId: 'tenant-alpha',
          createdAt: '2026-09-27T00:00:00Z',
        ),
      );
    }

    test('returns the DAO verdict count and the affected product names',
        () async {
      await insertProduct('prod-pizza', 'Pizza');
      await insertProduct('prod-jugo', 'Jugo Natural');
      await insertVerdict('rv-1', 'prod-pizza');
      await insertVerdict('rv-2', 'prod-jugo');

      final report = await syncService.getInertRecipeVerdictReport();

      expect(report, isNotNull);
      expect(report!.verdictCount, 2);
      // Names ordered for display; both products resolved through the join.
      expect(report.productNames, ['Jugo Natural', 'Pizza']);
    });

    test(
        'falls back to the product id when the product is unknown locally',
        () async {
      await insertVerdict('rv-1', 'prod-ghost');

      final report = await syncService.getInertRecipeVerdictReport();

      expect(report, isNotNull);
      expect(report!.verdictCount, 1);
      expect(report.productNames, ['prod-ghost']);
    });

    test('deduplicates repeated verdicts for the same product', () async {
      await insertProduct('prod-pizza', 'Pizza');
      await insertVerdict('rv-1', 'prod-pizza');
      await insertVerdict('rv-2', 'prod-pizza');

      final report = await syncService.getInertRecipeVerdictReport();

      expect(report, isNotNull);
      expect(report!.verdictCount, 2);
      expect(report.productNames, ['Pizza']);
    });

    test('returns null when there are no verdicts (render nothing)',
        () async {
      final report = await syncService.getInertRecipeVerdictReport();

      expect(report, isNull);
    });

    test(
        'returns null instead of throwing when the verdict read fails '
        '(dialog renders exactly as before)', () async {
      await insertVerdict('rv-1', 'prod-pizza');
      await database.close();

      final report = await syncService.getInertRecipeVerdictReport();

      expect(report, isNull);
    });
  });
}
