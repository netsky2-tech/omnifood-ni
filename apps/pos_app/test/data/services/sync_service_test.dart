import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:pos_app/data/repositories/inventory/inventory_repository_impl.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'package:pos_app/data/models/inventory/movement_sync_state_entity.dart';
import 'package:pos_app/data/models/inventory/movement_entity.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/inventory/batch.dart';
import 'package:pos_app/domain/models/inventory/uom_conversion.dart';
import 'package:pos_app/domain/models/inventory/recipe.dart';
import 'package:pos_app/domain/models/inventory/supplier.dart';
import 'package:pos_app/domain/models/inventory/warehouse.dart';
import 'package:pos_app/domain/models/inventory/purchase.dart';
import 'package:pos_app/domain/models/inventory/count_session_document.dart';
import 'package:pos_app/domain/models/inventory/forensic_alert.dart';
import 'package:pos_app/domain/models/inventory/recipe_version_document.dart';
import 'package:pos_app/domain/models/inventory/production_order_document.dart';
import 'package:pos_app/domain/models/audit_log.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart' hide Batch;

class CapturedPost {
  final String path;
  final dynamic body;

  CapturedPost({required this.path, required this.body});
}

class MockSalesRepository extends Mock implements SalesRepository {}

class FakeAuditRepository implements AuditRepository {
  @override
  String get deviceId => 'dev-1';

  var syncCount = 0;

  @override
  Future<void> syncLogs() async {
    syncCount += 1;
  }

  @override
  Future<void> log(String action, {String? metadata}) async {}

  @override
  Future<void> logForensic(
    String action, {
    String? metadata,
    String? metodoAutorizacion,
    String? usuarioAutorizadorId,
  }) async {}

  @override
  Future<AuditLog?> prepareLog(String action, {String? metadata}) async => null;

  @override
  Future<List<AuditLog>> getLocalLogs({
    DateTime? start,
    DateTime? end,
    String? userId,
  }) async => [];
}

class FakeInventoryRepository
    implements InventoryRepository, InventorySyncMetadataRepository {
  List<InventoryMovement> unsynced = [];
  List<Purchase> unsyncedPurchases = [];
  List<CountSessionDocument> unsyncedCountSessions = [];
  List<RecipeVersionDocument> unsyncedRecipeVersions = [];
  List<ProductionOrderDocument> unsyncedProductionOrders = [];
  List<ForensicAlert> forensicAlerts = [];
  List<ForensicAlert> unsyncedForensicAlerts = [];
  final List<String> syncedIds = [];
  final List<String> failedIds = [];
  final List<String> syncedPurchaseIds = [];
  final List<String> syncedCountSessionIds = [];
  final List<String> syncedRecipeVersionIds = [];
  final List<String> syncedProductionOrderIds = [];
  final List<String> syncedForensicAlertIds = [];
  final Map<String, MovementSyncMetadata> syncMetadataByMovementId = {};
  final List<String> retriedIds = [];

  @override
  Future<List<InventoryMovement>> getUnsyncedMovements() async => unsynced;

  @override
  Future<void> markMovementAsSynced(String id) async {
    syncedIds.add(id);
  }

  @override
  Future<void> markMovementAsFailed(String id, {String? error}) async {
    failedIds.add(id);
  }

  @override
  Future<List<MovementSyncMetadata>> reserveMovementSyncMetadata(
    List<String> movementIds, {
    required String terminalId,
    required String flowType,
  }) async {
    var nextSequence =
        syncMetadataByMovementId.values.fold<int>(
          0,
          (max, state) => state.localSequence > max ? state.localSequence : max,
        ) +
        1;

    return movementIds
        .map((movementId) {
          final existing = syncMetadataByMovementId[movementId];
          if (existing != null) {
            return existing;
          }
          final created = MovementSyncMetadata(
            movementId: movementId,
            terminalId: terminalId,
            flowType: flowType,
            localSequence: nextSequence++,
            idempotencyKey: '$flowType:$terminalId:$movementId',
          );
          syncMetadataByMovementId[movementId] = created;
          return created;
        })
        .toList(growable: false);
  }

  @override
  Future<void> recordMovementRetryState(
    String movementId, {
    required String resultCode,
    String? error,
  }) async {
    retriedIds.add(movementId);
    final existing = syncMetadataByMovementId[movementId];
    if (existing == null) {
      return;
    }
    syncMetadataByMovementId[movementId] = existing.copyWith(
      syncStatus: MovementSyncStateStatus.failed,
      lastResultCode: resultCode,
      lastError: error,
    );
  }

  @override
  Future<List<Purchase>> getUnsyncedPurchases() async => unsyncedPurchases;

  @override
  Future<void> markPurchaseAsSynced(String id) async {
    syncedPurchaseIds.add(id);
  }

  @override
  Future<List<CountSessionDocument>> getUnsyncedCountSessionDocuments() async =>
      unsyncedCountSessions;

  @override
  Future<void> markCountSessionDocumentAsSynced(String id) async {
    syncedCountSessionIds.add(id);
  }

  @override
  Future<List<RecipeVersionDocument>>
  getUnsyncedRecipeVersionDocuments() async => unsyncedRecipeVersions;

  @override
  Future<void> markRecipeVersionDocumentAsSynced(String id) async {
    syncedRecipeVersionIds.add(id);
  }

  @override
  Future<List<ProductionOrderDocument>> getUnsyncedProductionOrders() async =>
      unsyncedProductionOrders;

  @override
  Future<void> markProductionOrderDocumentAsSynced(String id) async {
    syncedProductionOrderIds.add(id);
  }

  @override
  Future<List<ForensicAlert>> getForensicAlerts() async => forensicAlerts;

  @override
  Future<void> saveForensicAlert(ForensicAlert alert) async {
    forensicAlerts = [
      alert,
      ...forensicAlerts.where((existing) => existing.id != alert.id),
    ];
  }

  @override
  Future<List<ForensicAlert>> getUnsyncedForensicAlerts() async =>
      unsyncedForensicAlerts;

  @override
  Future<void> markForensicAlertAsSynced(String id) async {
    syncedForensicAlertIds.add(id);
  }

  @override
  Future<List<Purchase>> getPurchaseHistory() async => const <Purchase>[];

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);

  @override
  get database => throw UnimplementedError();
  @override
  Future<List<Insumo>> getActiveInsumos() async => throw UnimplementedError();
  @override
  Future<Insumo?> getInsumoById(String id) async => throw UnimplementedError();
  @override
  Future<List<Insumo>> getInsumosByIds(List<String> ids) async =>
      throw UnimplementedError();
  @override
  Future<void> updateInsumoStock(String id, double newStock) async =>
      throw UnimplementedError();
  @override
  Future<void> updateInsumoCost(String id, double newCost) async =>
      throw UnimplementedError();
  @override
  Future<void> saveInsumo(Insumo insumo) async => throw UnimplementedError();
  @override
  Future<List<Product>> getActiveProducts() async => throw UnimplementedError();
  @override
  Future<Product?> getProductById(String id) async =>
      throw UnimplementedError();
  @override
  Future<void> saveProductOptions({
    required String productId,
    required List<ProductVariant> variants,
    required List<Modifier> modifiers,
  }) async => throw UnimplementedError();
  @override
  Future<List<Recipe>> getRecipeByProductId(String productId) async =>
      throw UnimplementedError();
  @override
  Future<void> saveRecipe(Recipe recipe) async => throw UnimplementedError();
  @override
  Future<void> deleteRecipe(String id) async => throw UnimplementedError();
  @override
  Future<void> saveMovement(InventoryMovement movement) async =>
      throw UnimplementedError();
  @override
  Future<List<InventoryMovement>> getAllMovements() async =>
      throw UnimplementedError();
  @override
  Future<List<Supplier>> getActiveSuppliers() async =>
      throw UnimplementedError();
  @override
  Future<void> saveSupplier(Supplier supplier) async =>
      throw UnimplementedError();
  @override
  Future<List<Warehouse>> getActiveWarehouses() async =>
      throw UnimplementedError();
  @override
  Future<void> saveWarehouse(Warehouse warehouse) async =>
      throw UnimplementedError();
  @override
  Future<List<Batch>> getBatchesByInsumoId(String insumoId) async =>
      throw UnimplementedError();
  @override
  Future<void> saveBatch(Batch batch) async => throw UnimplementedError();
  @override
  Future<List<UomConversion>> getConversionsByInsumoId(String insumoId) async =>
      throw UnimplementedError();
  @override
  Future<void> saveConversion(UomConversion conversion) async =>
      throw UnimplementedError();
  @override
  Future<void> savePurchase(Purchase purchase) async =>
      throw UnimplementedError();
  @override
  Future<void> queuePurchaseSync(Purchase purchase) async =>
      throw UnimplementedError();
  @override
  Future<List<CountSessionDocument>> getCountSessionDocuments() async =>
      throw UnimplementedError();
  @override
  Future<void> saveCountSessionDocument(CountSessionDocument session) async =>
      throw UnimplementedError();
  @override
  Future<List<ProductionOrderDocument>> getProductionOrderDocuments() async =>
      throw UnimplementedError();
  @override
  Future<void> saveProductionOrderDocument(
    ProductionOrderDocument document,
  ) async => throw UnimplementedError();
  @override
  Future<List<RecipeVersionDocument>> getRecipeVersionDocuments(
    String productId,
  ) async => throw UnimplementedError();
  @override
  Future<void> saveRecipeVersionDocument(
    RecipeVersionDocument document,
  ) async => throw UnimplementedError();
  @override
  Future<void> replaceRecipesForProduct(
    String productId,
    List<Recipe> recipes,
  ) async => throw UnimplementedError();
}

class RepositoryBackedPurchaseInventoryRepository
    extends FakeInventoryRepository {
  RepositoryBackedPurchaseInventoryRepository(this._repository);

  final InventoryRepositoryImpl _repository;

  @override
  Future<List<Purchase>> getUnsyncedPurchases() {
    return _repository.getUnsyncedPurchases();
  }
}

void main() {
  late SyncService syncService;
  late FakeAuditRepository mockAuditRepository;
  late MockSalesRepository mockSalesRepository;
  late FakeInventoryRepository mockInventoryRepository;
  late Dio dio;
  var postCalls = 0;
  DioException? forcedError;
  final List<CapturedPost> capturedPosts = [];
  final Map<String, Object?> capturedGets = {};

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() {
    mockAuditRepository = FakeAuditRepository();
    mockSalesRepository = MockSalesRepository();
    mockInventoryRepository = FakeInventoryRepository();
    postCalls = 0;
    forcedError = null;
    capturedPosts.clear();
    capturedGets.clear();
    dio = Dio();
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (options.method.toUpperCase() == 'POST') {
            postCalls += 1;
            capturedPosts.add(
              CapturedPost(path: options.path, body: options.data),
            );
            if (forcedError != null) {
              handler.reject(forcedError!);
              return;
            }
          }
          if (options.method.toUpperCase() == 'GET' &&
              capturedGets.containsKey(options.path)) {
            handler.resolve(
              Response<dynamic>(
                data: capturedGets[options.path],
                statusCode: 200,
                requestOptions: options,
              ),
            );
            return;
          }
          handler.resolve(
            Response<dynamic>(
              data: {'ok': true},
              statusCode: 200,
              requestOptions: options,
            ),
          );
        },
      ),
    );
    syncService = SyncService(
      mockAuditRepository,
      mockSalesRepository,
      mockInventoryRepository,
      dio,
    );
  });

  InventoryMovement movement(String id, {DateTime? timestamp}) {
    return InventoryMovement(
      id: id,
      insumoId: 'i-1',
      type: MovementType.sale,
      quantity: -1,
      previousStock: 10,
      newStock: 9,
      timestamp: timestamp ?? DateTime.parse('2026-01-01T10:00:00Z'),
    );
  }

  void respondToInventoryBatchWith(
    Object? Function(List<Map<String, dynamic>> records) buildResponse,
  ) {
    dio.interceptors.clear();
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          capturedPosts.add(
            CapturedPost(path: options.path, body: options.data),
          );
          final records =
              ((options.data as Map<String, dynamic>)['records']
                      as List<dynamic>)
                  .cast<Map<String, dynamic>>();
          handler.resolve(
            Response<dynamic>(
              statusCode: 200,
              requestOptions: options,
              data: buildResponse(records),
            ),
          );
        },
      ),
    );
  }

  void failInventoryBatchWithDioException() {
    dio.interceptors.clear();
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          capturedPosts.add(
            CapturedPost(path: options.path, body: options.data),
          );
          handler.reject(
            DioException(
              requestOptions: options,
              type: DioExceptionType.connectionError,
              message: 'offline',
            ),
          );
        },
      ),
    );
  }

  test(
    'syncs audit logs and marks sales as synced on successful sync',
    () async {
      syncService = SyncService(
        mockAuditRepository,
        mockSalesRepository,
        mockInventoryRepository,
        dio,
        role: 'EDGE_SERVER',
      );

      final unsynced = [
        InventoryMovement(
          id: 'mov-1',
          insumoId: 'i-1',
          type: MovementType.sale,
          quantity: -1,
          previousStock: 5,
          newStock: 4,
          timestamp: DateTime.parse('2026-01-01T10:00:00Z'),
        ),
        InventoryMovement(
          id: 'mov-2',
          insumoId: 'i-1',
          type: MovementType.reversal,
          quantity: 1,
          previousStock: 4,
          newStock: 5,
          timestamp: DateTime.parse('2026-01-01T10:00:01Z'),
        ),
      ];

      mockInventoryRepository.unsynced = unsynced;
      await syncService.triggerManualSync();

      expect(mockAuditRepository.syncCount, 1);
      expect(mockInventoryRepository.unsynced.length, 2);
    },
  );

  test(
    'does not mark sales as synced when sync endpoint returns error',
    () async {
      final unsynced = [
        InventoryMovement(
          id: 'mov-23',
          insumoId: 'i-1',
          type: MovementType.sale,
          quantity: -1,
          previousStock: 1,
          newStock: 0,
          timestamp: DateTime.parse('2026-01-01T11:00:00Z'),
        ),
      ];

      mockInventoryRepository.unsynced = unsynced;
      forcedError = DioException(
        requestOptions: RequestOptions(path: '/v1/sync/batch'),
        response: Response(
          data: {'error': 'Invalid invoice data'},
          statusCode: 400,
          requestOptions: RequestOptions(path: '/v1/sync/batch'),
        ),
        type: DioExceptionType.badResponse,
      );

      await syncService.triggerManualSync();
      expect(mockInventoryRepository.syncedIds, isEmpty);
      expect(mockInventoryRepository.failedIds, ['mov-23']);
    },
  );

  test('does not post when there are no unsynced sales', () async {
    mockInventoryRepository.unsynced = [];

    await syncService.triggerManualSync();

    expect(postCalls, 0);
  });

  test('sends plain JSON records when role is STANDALONE', () async {
    final unsynced = [
      InventoryMovement(
        id: 'mov-9',
        insumoId: 'i-9',
        type: MovementType.sale,
        quantity: -2,
        previousStock: 4,
        newStock: 2,
        timestamp: DateTime.parse('2026-01-01T12:00:00Z'),
      ),
    ];

    mockInventoryRepository.unsynced = unsynced;
    syncService = SyncService(
      mockAuditRepository,
      mockSalesRepository,
      mockInventoryRepository,
      dio,
      role: 'STANDALONE',
    );

    await syncService.triggerManualSync();

    expect(mockInventoryRepository.unsynced.length, 1);
  });

  test('syncs purchase documents before generic movement replay', () async {
    mockInventoryRepository.unsynced = [
      InventoryMovement(
        id: 'purchase-1',
        insumoId: 'i-9',
        type: MovementType.purchase,
        quantity: 2,
        previousStock: 1,
        newStock: 3,
        timestamp: DateTime.parse('2026-01-01T12:00:00Z'),
      ),
      InventoryMovement(
        id: 'sale-1',
        insumoId: 'i-9',
        type: MovementType.sale,
        quantity: -1,
        previousStock: 3,
        newStock: 2,
        timestamp: DateTime.parse('2026-01-01T12:05:00Z'),
      ),
    ];
    mockInventoryRepository.unsyncedPurchases = [
      Purchase(
        id: 'purchase-1',
        insumoId: 'i-9',
        supplierId: 'supplier-1',
        invoiceNumber: 'INV-1001',
        fiscalAuthorizationCode: 'CAE-ABC-123',
        quantity: 2,
        unitCost: 10,
        timestamp: DateTime.parse('2026-01-01T12:00:00Z'),
        invoiceDate: DateTime(2026, 1, 1),
        currency: 'USD',
        bcnRate: 36.5,
        fxRateMode: purchaseFxRateModeExplicit,
        unitCostNio: 365,
        projectedCppNio: 200,
        lotCode: 'LOT-1',
        receivedDate: DateTime(2026, 1, 1),
        expirationDate: DateTime(2026, 2, 1),
        requiresBatchTracking: true,
      ),
    ];

    await syncService.triggerManualSync();

    expect(mockInventoryRepository.syncedPurchaseIds, contains('purchase-1'));
    expect(mockInventoryRepository.syncedIds, contains('purchase-1'));
    expect(mockInventoryRepository.failedIds, isEmpty);
    expect(
      capturedPosts.any((post) => post.path == '/inventory/purchases'),
      true,
    );
    expect(capturedPosts.any((post) => post.path == '/v1/sync/batch'), true);
    final purchasePost = capturedPosts.firstWhere(
      (post) => post.path == '/inventory/purchases',
    );
    final purchaseBody = purchasePost.body as Map<String, Object?>;
    expect(purchaseBody['id'], 'purchase-1');
    expect(purchaseBody['supplierId'], 'supplier-1');
    expect(purchaseBody['invoiceNumber'], 'INV-1001');
    expect(purchaseBody['fiscalAuthorizationCode'], 'CAE-ABC-123');
    expect(purchaseBody['invoiceDate'], '2026-01-01');
    expect(purchaseBody['entryTimestamp'], '2026-01-01T12:00:00.000Z');
    expect(purchaseBody['fxRateMode'], purchaseFxRateModeExplicit);
    expect(purchaseBody['bcnRate'], 36.5);
    expect(purchaseBody.containsKey('supplierName'), isFalse);
  });

  test('omits bcnRate when syncing an official FX purchase document', () async {
    mockInventoryRepository.unsynced = [
      InventoryMovement(
        id: 'purchase-official-1',
        insumoId: 'i-9',
        type: MovementType.purchase,
        quantity: 2,
        previousStock: 1,
        newStock: 3,
        timestamp: DateTime.parse('2026-01-02T12:00:00Z'),
      ),
    ];
    mockInventoryRepository.unsyncedPurchases = [
      Purchase(
        id: 'purchase-official-1',
        insumoId: 'i-9',
        supplierId: 'supplier-1',
        invoiceNumber: 'INV-1002',
        quantity: 2,
        unitCost: 10,
        timestamp: DateTime.parse('2026-01-02T12:00:00Z'),
        invoiceDate: DateTime(2026, 1, 2),
        currency: 'USD',
        bcnRate: 36.7123,
        fxRateMode: purchaseFxRateModeOfficial,
      ),
    ];

    await syncService.triggerManualSync();

    final purchasePost = capturedPosts.firstWhere(
      (post) => post.path == '/inventory/purchases',
    );
    final purchaseBody = purchasePost.body as Map<String, Object?>;
    expect(purchaseBody['fxRateMode'], purchaseFxRateModeOfficial);
    expect(purchaseBody.containsKey('bcnRate'), isFalse);
    expect(
      mockInventoryRepository.syncedPurchaseIds,
      contains('purchase-official-1'),
    );
  });

  test(
    'reloads a migrated legacy purchase row and syncs backward-compatible payload semantics',
    () async {
      final dbPath =
          '${await databaseFactory.getDatabasesPath()}/legacy_purchase_sync_regression.db';
      await databaseFactory.deleteDatabase(dbPath);

      AppDatabase? database;
      try {
        final legacyDb = await databaseFactory.openDatabase(
          dbPath,
          options: OpenDatabaseOptions(
            version: 24,
            onCreate: (database, version) async {
              await database.execute('''
                CREATE TABLE purchases (
                  id TEXT NOT NULL PRIMARY KEY,
                  insumo_id TEXT NOT NULL,
                  supplier_id TEXT NOT NULL,
                  invoice_number TEXT NOT NULL DEFAULT '',
                  quantity REAL NOT NULL,
                  unit_cost REAL NOT NULL,
                  timestamp TEXT NOT NULL,
                  invoice_date TEXT NOT NULL,
                  currency TEXT NOT NULL,
                  bcn_rate REAL NOT NULL,
                  unit_cost_nio REAL,
                  cpp_before_nio REAL,
                  projected_cpp_nio REAL,
                  lot_code TEXT,
                  received_date TEXT,
                  expiration_date TEXT,
                  requires_batch_tracking INTEGER NOT NULL,
                  is_synced INTEGER NOT NULL DEFAULT 0
                )
              ''');
            },
          ),
        );

        await legacyDb.insert('purchases', {
          'id': 'purchase-legacy-migrated-1',
          'insumo_id': 'ins-1',
          'supplier_id': 'supplier-1',
          'invoice_number': 'INV-LEGACY-1',
          'quantity': 2.0,
          'unit_cost': 10.0,
          'timestamp': '2026-01-03T12:00:00.000Z',
          'invoice_date': '2026-01-03',
          'currency': 'USD',
          'bcn_rate': 36.5,
          'requires_batch_tracking': 0,
          'is_synced': 0,
        });
        await legacyDb.close();

        database = await $FloorAppDatabase
            .databaseBuilder(dbPath)
            .addMigrations(allMigrations)
            .build();

        final purchaseRepository = InventoryRepositoryImpl(
          insumoDao: database.insumoDao,
          recipeDao: database.recipeDao,
          movementDao: database.movementDao,
          movementSyncStateDao: database.movementSyncStateDao,
          supplierDao: database.supplierDao,
          warehouseDao: database.warehouseDao,
          forensicAlertDao: database.forensicAlertDao,
          uomConversionDao: database.uomConversionDao,
          batchDao: database.batchDao,
          purchaseDao: database.purchaseDao,
          recipeVersionDocumentDao: database.recipeVersionDocumentDao,
          productionOrderDocumentDao: database.productionOrderDocumentDao,
          dio: Dio(),
          database: database,
        );
        final repository =
            RepositoryBackedPurchaseInventoryRepository(purchaseRepository)
              ..unsynced = [
                InventoryMovement(
                  id: 'purchase-legacy-migrated-1',
                  insumoId: 'ins-1',
                  type: MovementType.purchase,
                  quantity: 2,
                  previousStock: 1,
                  newStock: 3,
                  timestamp: DateTime.parse('2026-01-03T12:00:00Z'),
                ),
              ];

        final reloadedPurchases = await purchaseRepository
            .getUnsyncedPurchases();
        expect(reloadedPurchases.single.fxRateMode, isNull);
        expect(reloadedPurchases.single.fiscalAuthorizationCode, isNull);

        final service = SyncService(
          mockAuditRepository,
          mockSalesRepository,
          repository,
          dio,
        );

        await service.triggerManualSync();

        final purchasePost = capturedPosts.firstWhere(
          (post) => post.path == '/inventory/purchases',
        );
        final purchaseBody = purchasePost.body as Map<String, Object?>;
        expect(purchaseBody['id'], 'purchase-legacy-migrated-1');
        expect(purchaseBody['fiscalAuthorizationCode'], isNull);
        expect(purchaseBody.containsKey('fxRateMode'), isFalse);
        expect(purchaseBody['bcnRate'], 36.5);
        expect(
          repository.syncedPurchaseIds,
          contains('purchase-legacy-migrated-1'),
        );
      } finally {
        if (database != null) {
          await database.close();
        }
        await databaseFactory.deleteDatabase(dbPath);
      }
    },
  );

  test(
    'does not sync purchase documents that lack fiscal identity or explicit USD bcnRate',
    () async {
      mockInventoryRepository.unsynced = [
        InventoryMovement(
          id: 'purchase-legacy-1',
          insumoId: 'i-9',
          type: MovementType.purchase,
          quantity: 2,
          previousStock: 1,
          newStock: 3,
          timestamp: DateTime.parse('2026-01-01T12:00:00Z'),
        ),
      ];
      mockInventoryRepository.unsyncedPurchases = [
        Purchase(
          id: 'purchase-legacy-1',
          insumoId: 'i-9',
          supplierId: 'supplier-1',
          invoiceNumber: '',
          quantity: 2,
          unitCost: 10,
          timestamp: DateTime.parse('2026-01-01T12:00:00Z'),
          invoiceDate: DateTime(2026, 1, 1),
          currency: 'USD',
          bcnRate: 0,
        ),
      ];

      await syncService.triggerManualSync();

      expect(
        capturedPosts.any((post) => post.path == '/inventory/purchases'),
        isFalse,
      );
      expect(mockInventoryRepository.syncedPurchaseIds, isEmpty);
      expect(mockInventoryRepository.failedIds, contains('purchase-legacy-1'));
    },
  );

  test(
    'syncs recipe version and production documents before generic inventory replay',
    () async {
      mockInventoryRepository.unsyncedRecipeVersions = [
        RecipeVersionDocument(
          id: 'rv-1',
          productId: 'prod-1',
          productName: 'Vanilla Latte',
          versionNumber: 8,
          yieldQuantity: 10,
          technicalShrinkPct: 6,
          createdAt: DateTime(2026, 6, 2, 10),
          components: const [
            RecipeVersionComponentDocument(
              ingredientId: 'ins-1',
              ingredientName: 'Leche',
              ingredientType: 'INSUMO',
              grossQuantity: 1,
              netQuantity: 0.94,
              technicalShrinkPct: 6,
              componentUom: 'lt',
            ),
          ],
        ),
      ];
      mockInventoryRepository.unsyncedProductionOrders = [
        ProductionOrderDocument(
          id: 'po-1',
          recipeVersionId: 'rv-1',
          recipeProductId: 'prod-1',
          recipeProductName: 'Vanilla Latte',
          producedInsumoId: 'ins-1',
          producedInsumoName: 'Base',
          plannedQuantity: 10,
          actualQuantity: 9,
          producedBatchNumber: 'PB-1',
          producedExpirationDate: DateTime(2026, 7, 1),
          operationDate: DateTime(2026, 6, 2, 10),
          status: 'CLOSED_PENDING_SYNC',
          movementReferences: const ['mov-prod-1'],
        ),
      ];
      mockInventoryRepository.unsynced = [
        InventoryMovement(
          id: 'mov-sale-1',
          insumoId: 'i-1',
          type: MovementType.sale,
          quantity: -1,
          previousStock: 3,
          newStock: 2,
          timestamp: DateTime.parse('2026-06-02T11:00:00Z'),
        ),
      ];

      await syncService.triggerManualSync();

      expect(mockInventoryRepository.syncedRecipeVersionIds, contains('rv-1'));
      expect(
        mockInventoryRepository.syncedProductionOrderIds,
        contains('po-1'),
      );
      expect(mockInventoryRepository.syncedIds, contains('mov-prod-1'));
      expect(
        capturedPosts.any((post) => post.path == '/inventory/recipes/versions'),
        true,
      );
      expect(
        capturedPosts.any(
          (post) => post.path == '/inventory/production-orders/close',
        ),
        true,
      );
      // Slice 2.2: the recipe version payload must include the component UOM so
      // the backend can validate/convert against the insumo base consumption UOM.
      final recipeVersionPost = capturedPosts.firstWhere(
        (post) => post.path == '/inventory/recipes/versions',
      );
      final recipeVersionComponents =
          (recipeVersionPost.body as Map<String, Object?>)['components']
              as List<dynamic>;
      expect(
        (recipeVersionComponents.first as Map<String, Object?>)['componentUom'],
        'lt',
      );
    },
  );

  test(
    'syncs count session documents before generic inventory replay and marks linked adjustments',
    () async {
      mockInventoryRepository.unsyncedCountSessions = [
        CountSessionDocument(
          id: 'count-1',
          warehouseId: 'wh-1',
          warehouseName: 'Bodega Central',
          cutoffAt: DateTime(2026, 6, 2, 10),
          status: CountSessionStatus.posted,
          createdAt: DateTime(2026, 6, 2, 9),
          updatedAt: DateTime(2026, 6, 2, 10),
          postedAt: DateTime(2026, 6, 2, 10),
          movementReferences: const ['count-1:line-1'],
          lines: const [
            CountSessionLineDocument(
              id: 'line-1',
              insumoId: 'ins-1',
              insumoName: 'Leche',
              uom: 'L',
              theoreticalQuantity: 15,
              approvedEntryIndex: 1,
              entries: [
                CountLineEntryDocument(
                  countedQuantity: 9,
                  countedAt: null,
                  disputed: true,
                ),
                CountLineEntryDocument(countedQuantity: 10, countedAt: null),
              ],
            ),
          ],
        ),
      ];
      mockInventoryRepository.unsynced = [
        InventoryMovement(
          id: 'count-1:line-1',
          insumoId: 'ins-1',
          type: MovementType.adjustment,
          quantity: -5,
          previousStock: 15,
          newStock: 10,
          timestamp: DateTime.parse('2026-06-02T10:00:00Z'),
        ),
      ];

      await syncService.triggerManualSync();

      expect(
        mockInventoryRepository.syncedCountSessionIds,
        contains('count-1'),
      );
      expect(mockInventoryRepository.syncedIds, contains('count-1:line-1'));
      expect(
        capturedPosts.any((post) => post.path == '/inventory/count-sessions'),
        true,
      );
    },
  );

  test('sync standalone inventory record without throwing', () async {
    final outboxRecord = InventoryMovement(
      id: 'mov-30',
      insumoId: 'i-30',
      type: MovementType.sale,
      quantity: 3.0,
      previousStock: 10,
      newStock: 13,
      timestamp: DateTime.parse('2026-01-01T12:00:00Z'),
    );

    mockInventoryRepository.unsynced = [outboxRecord];
    syncService = SyncService(
      mockAuditRepository,
      mockSalesRepository,
      mockInventoryRepository,
      dio,
      role: 'STANDALONE',
    );

    await expectLater(syncService.triggerManualSync(), completes);
    expect(mockAuditRepository.syncCount, 1);
  });

  test(
    'uses persisted outbox order and deterministic fallback sourceSequence',
    () async {
      final unsynced = [
        InventoryMovement(
          id: 'mov-older',
          insumoId: 'i-1',
          type: MovementType.sale,
          quantity: -1,
          previousStock: 10,
          newStock: 9,
          timestamp: DateTime.parse('2026-01-01T11:00:00Z'),
        ),
        InventoryMovement(
          id: 'mov-newer',
          insumoId: 'i-1',
          type: MovementType.reversal,
          quantity: 1,
          previousStock: 9,
          newStock: 10,
          timestamp: DateTime.parse('2026-01-01T10:00:00Z'),
        ),
      ];

      final body = syncService.buildOrderedBatchEnvelopeForTest(unsynced);
      final records = body['records'] as List<dynamic>;
      expect(records[0]['idempotencyKey'], 'inventory:dev-1:mov-older');
      expect(records[1]['idempotencyKey'], 'inventory:dev-1:mov-newer');
      expect(records[0]['sourceSequence'], 1);
      expect(records[1]['sourceSequence'], 2);
    },
  );

  test(
    'keeps idempotencyKey and sourceSequence stable across replays',
    () async {
      final unsynced = [
        InventoryMovement(
          id: 'mov-42',
          insumoId: 'i-2',
          type: MovementType.sale,
          quantity: -2,
          previousStock: 7,
          newStock: 5,
          timestamp: DateTime.parse('2026-01-01T12:00:00Z'),
        ),
      ];

      final first = syncService.buildOrderedBatchEnvelopeForTest(unsynced);
      final second = syncService.buildOrderedBatchEnvelopeForTest(unsynced);
      final firstRecord =
          (first['records'] as List<dynamic>).single as Map<String, dynamic>;
      final secondRecord =
          (second['records'] as List<dynamic>).single as Map<String, dynamic>;

      expect(firstRecord['idempotencyKey'], secondRecord['idempotencyKey']);
      expect(firstRecord['sourceSequence'], secondRecord['sourceSequence']);
    },
  );

  test(
    'sends terminal flow sequence metadata and preserves retry state per backend item result',
    () async {
      final unsynced = [
        InventoryMovement(
          id: 'mov-accepted',
          insumoId: 'i-1',
          type: MovementType.sale,
          quantity: -1,
          previousStock: 10,
          newStock: 9,
          timestamp: DateTime.parse('2026-01-01T10:00:00Z'),
        ),
        InventoryMovement(
          id: 'mov-staged',
          insumoId: 'i-1',
          type: MovementType.reversal,
          quantity: 1,
          previousStock: 9,
          newStock: 10,
          timestamp: DateTime.parse('2026-01-01T10:01:00Z'),
        ),
        InventoryMovement(
          id: 'mov-duplicate',
          insumoId: 'i-1',
          type: MovementType.adjustment,
          quantity: 3,
          previousStock: 10,
          newStock: 13,
          timestamp: DateTime.parse('2026-01-01T10:02:00Z'),
        ),
      ];
      mockInventoryRepository.unsynced = unsynced;
      dio.interceptors.clear();
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            capturedPosts.add(
              CapturedPost(path: options.path, body: options.data),
            );
            final records =
                ((options.data as Map<String, dynamic>)['records']
                        as List<dynamic>)
                    .cast<Map<String, dynamic>>();
            handler.resolve(
              Response<dynamic>(
                statusCode: 200,
                requestOptions: options,
                data: {
                  'status': 'PARTIAL',
                  'received': records.length,
                  'results': [
                    {
                      'idempotencyKey': records[0]['idempotencyKey'],
                      'terminalId': records[0]['terminalId'],
                      'flowType': records[0]['flowType'],
                      'sourceSequence': records[0]['sourceSequence'],
                      'status': 'ACCEPTED',
                      'retryable': false,
                    },
                    {
                      'idempotencyKey': records[1]['idempotencyKey'],
                      'terminalId': records[1]['terminalId'],
                      'flowType': records[1]['flowType'],
                      'sourceSequence': records[1]['sourceSequence'],
                      'status': 'STAGED_FUTURE',
                      'retryable': true,
                      'code': 'SEQUENCE_GAP',
                    },
                    {
                      'idempotencyKey': records[2]['idempotencyKey'],
                      'terminalId': records[2]['terminalId'],
                      'flowType': records[2]['flowType'],
                      'sourceSequence': records[2]['sourceSequence'],
                      'status': 'DUPLICATE',
                      'retryable': false,
                    },
                  ],
                },
              ),
            );
          },
        ),
      );

      await syncService.triggerManualSync();

      final body =
          capturedPosts
                  .singleWhere((post) => post.path == '/v1/sync/batch')
                  .body
              as Map<String, dynamic>;
      final records = (body['records'] as List<dynamic>)
          .cast<Map<String, dynamic>>();
      expect(
        records.map((record) => record['terminalId']),
        everyElement('dev-1'),
      );
      expect(
        records.map((record) => record['flowType']),
        everyElement('inventory'),
      );
      expect(records.map((record) => record['sourceSequence']), [1, 2, 3]);
      expect(records.map((record) => record['idempotencyKey']), [
        'inventory:dev-1:mov-accepted',
        'inventory:dev-1:mov-staged',
        'inventory:dev-1:mov-duplicate',
      ]);
      expect(mockInventoryRepository.syncedIds, [
        'mov-accepted',
        'mov-duplicate',
      ]);
      expect(mockInventoryRepository.retriedIds, ['mov-staged']);
      expect(
        mockInventoryRepository
            .syncMetadataByMovementId['mov-staged']
            ?.lastResultCode,
        'SEQUENCE_GAP',
      );
    },
  );

  test(
    'reads unsynced movements in deterministic local sequence order',
    () async {
      final database = await $FloorAppDatabase
          .inMemoryDatabaseBuilder()
          .build();
      try {
        await database.movementDao.insertMovement(
          MovementEntity(
            id: 'mov-seq-2',
            insumoId: 'i-1',
            type: 'SALE',
            quantity: -1,
            previousStock: 10,
            newStock: 9,
            timestamp: '2026-01-01T10:00:00.000Z',
          ),
        );
        await database.movementDao.insertMovement(
          MovementEntity(
            id: 'mov-seq-1',
            insumoId: 'i-1',
            type: 'SALE',
            quantity: -1,
            previousStock: 9,
            newStock: 8,
            timestamp: '2026-01-01T10:01:00.000Z',
          ),
        );
        await database.movementSyncStateDao.upsertSyncState(
          const MovementSyncStateEntity(
            movementId: 'mov-seq-2',
            syncStatus: MovementSyncStateStatus.pending,
            terminalId: 'dev-1',
            flowType: 'inventory',
            localSequence: 2,
            idempotencyKey: 'inventory:dev-1:mov-seq-2',
          ),
        );
        await database.movementSyncStateDao.upsertSyncState(
          const MovementSyncStateEntity(
            movementId: 'mov-seq-1',
            syncStatus: MovementSyncStateStatus.pending,
            terminalId: 'dev-1',
            flowType: 'inventory',
            localSequence: 1,
            idempotencyKey: 'inventory:dev-1:mov-seq-1',
          ),
        );

        final unsynced = await database.movementDao.findUnsyncedMovements();

        expect(unsynced.map((movement) => movement.id), [
          'mov-seq-1',
          'mov-seq-2',
        ]);
      } finally {
        await database.close();
      }
    },
  );

  test(
    'sends existing reserved sequence before newly reserved movement',
    () async {
      mockInventoryRepository.unsynced = [
        movement('mov-new', timestamp: DateTime.parse('2026-01-01T10:00:00Z')),
        movement(
          'mov-failed',
          timestamp: DateTime.parse('2026-01-01T10:01:00Z'),
        ),
      ];
      mockInventoryRepository.syncMetadataByMovementId['mov-failed'] =
          const MovementSyncMetadata(
            movementId: 'mov-failed',
            terminalId: 'dev-1',
            flowType: 'inventory',
            localSequence: 7,
            idempotencyKey: 'inventory:dev-1:mov-failed',
            syncStatus: MovementSyncStateStatus.failed,
          );
      respondToInventoryBatchWith(
        (records) => {
          'status': 'OK',
          'received': records.length,
          'results': records
              .map((record) => {...record, 'status': 'ACCEPTED'})
              .toList(growable: false),
        },
      );

      await syncService.triggerManualSync();

      final batchPost = capturedPosts.lastWhere(
        (post) => post.path == '/v1/sync/batch',
      );
      final records =
          (batchPost.body as Map<String, dynamic>)['records'] as List<dynamic>;
      expect(records.map((record) => record['idempotencyKey']), [
        'inventory:dev-1:mov-failed',
        'inventory:dev-1:mov-new',
      ]);
      expect(records.map((record) => record['sourceSequence']), [7, 8]);
      expect(mockInventoryRepository.syncedIds, ['mov-failed', 'mov-new']);
    },
  );

  test(
    'does not mark inventory movements synced when backend omits results',
    () async {
      mockInventoryRepository.unsynced = [movement('mov-missing-results')];
      respondToInventoryBatchWith(
        (records) => {'status': 'OK', 'received': records.length},
      );

      await syncService.triggerManualSync();

      expect(mockInventoryRepository.syncedIds, isEmpty);
      expect(mockInventoryRepository.retriedIds, ['mov-missing-results']);
      expect(
        mockInventoryRepository
            .syncMetadataByMovementId['mov-missing-results']
            ?.lastResultCode,
        'MISSING_RESULT',
      );
    },
  );

  test(
    'does not reserve or apply results to movements beyond the batch envelope limit',
    () async {
      mockInventoryRepository.unsynced = List.generate(
        501,
        (index) => movement(
          'mov-${index + 1}',
          timestamp: DateTime.parse(
            '2026-01-01T10:00:00Z',
          ).add(Duration(seconds: index)),
        ),
      );
      respondToInventoryBatchWith(
        (records) => {
          'status': 'OK',
          'received': records.length,
          'results': records
              .map((record) => {...record, 'status': 'ACCEPTED'})
              .toList(growable: false),
        },
      );

      await syncService.triggerManualSync();

      final batchPost = capturedPosts.lastWhere(
        (post) => post.path == '/v1/sync/batch',
      );
      final records =
          (batchPost.body as Map<String, dynamic>)['records'] as List<dynamic>;
      expect(records, hasLength(500));
      expect(mockInventoryRepository.syncedIds, hasLength(500));
      expect(mockInventoryRepository.syncedIds, isNot(contains('mov-501')));
      expect(mockInventoryRepository.retriedIds, isNot(contains('mov-501')));
      expect(
        mockInventoryRepository.syncMetadataByMovementId,
        isNot(contains('mov-501')),
      );
    },
  );

  test(
    'does not fail unsent inventory movements when batch POST fails',
    () async {
      mockInventoryRepository.unsynced = List.generate(
        501,
        (index) => movement(
          'mov-${index + 1}',
          timestamp: DateTime.parse(
            '2026-01-01T10:00:00Z',
          ).add(Duration(seconds: index)),
        ),
      );
      failInventoryBatchWithDioException();

      await syncService.triggerManualSync();

      final batchPost = capturedPosts.lastWhere(
        (post) => post.path == '/v1/sync/batch',
      );
      final records =
          (batchPost.body as Map<String, dynamic>)['records'] as List<dynamic>;
      expect(records, hasLength(500));
      expect(mockInventoryRepository.failedIds, hasLength(500));
      expect(mockInventoryRepository.failedIds, isNot(contains('mov-501')));
      expect(
        mockInventoryRepository.syncMetadataByMovementId,
        isNot(contains('mov-501')),
      );
    },
  );

  test(
    'does not mark inventory movements synced when backend returns empty results',
    () async {
      mockInventoryRepository.unsynced = [movement('mov-empty-results')];
      respondToInventoryBatchWith(
        (records) => {
          'status': 'OK',
          'received': records.length,
          'results': [],
        },
      );

      await syncService.triggerManualSync();

      expect(mockInventoryRepository.syncedIds, isEmpty);
      expect(mockInventoryRepository.retriedIds, ['mov-empty-results']);
      expect(
        mockInventoryRepository
            .syncMetadataByMovementId['mov-empty-results']
            ?.lastResultCode,
        'MISSING_RESULT',
      );
    },
  );

  test(
    'does not mark inventory movements synced when result rows are malformed',
    () async {
      mockInventoryRepository.unsynced = [movement('mov-malformed-result')];
      respondToInventoryBatchWith(
        (records) => {
          'status': 'OK',
          'received': records.length,
          'results': [
            {'idempotencyKey': records.single['idempotencyKey']},
          ],
        },
      );

      await syncService.triggerManualSync();

      expect(mockInventoryRepository.syncedIds, isEmpty);
      expect(mockInventoryRepository.retriedIds, ['mov-malformed-result']);
      expect(
        mockInventoryRepository
            .syncMetadataByMovementId['mov-malformed-result']
            ?.lastResultCode,
        'MISSING_RESULT',
      );
    },
  );

  test(
    'treats malformed optional result fields as row retry data without batch fallback',
    () async {
      mockInventoryRepository.unsynced = [
        movement('mov-numeric-code'),
        movement('mov-object-message'),
      ];
      respondToInventoryBatchWith(
        (records) => {
          'status': 'PARTIAL',
          'received': records.length,
          'results': [
            {...records[0], 'status': 'REJECTED', 'code': 409},
            {
              ...records[1],
              'status': 'REJECTED',
              'message': {'detail': 'bad row'},
            },
          ],
        },
      );

      await syncService.triggerManualSync();

      expect(mockInventoryRepository.syncedIds, isEmpty);
      expect(mockInventoryRepository.failedIds, isEmpty);
      expect(mockInventoryRepository.retriedIds, [
        'mov-numeric-code',
        'mov-object-message',
      ]);
      expect(
        mockInventoryRepository.syncMetadataByMovementId.map(
          (id, state) => MapEntry(id, state.lastResultCode),
        ),
        equals(<String, String>{
          'mov-numeric-code': 'MISSING_RESULT',
          'mov-object-message': 'MISSING_RESULT',
        }),
      );
    },
  );

  test(
    'records retry state for rejected, blocked, mismatch, unknown, and metadata-mismatched results',
    () async {
      mockInventoryRepository.unsynced = [
        movement(
          'mov-rejected',
          timestamp: DateTime.parse('2026-01-01T10:00:00Z'),
        ),
        movement(
          'mov-blocked',
          timestamp: DateTime.parse('2026-01-01T10:01:00Z'),
        ),
        movement(
          'mov-mismatch',
          timestamp: DateTime.parse('2026-01-01T10:02:00Z'),
        ),
        movement(
          'mov-unknown',
          timestamp: DateTime.parse('2026-01-01T10:03:00Z'),
        ),
        movement(
          'mov-meta-mismatch',
          timestamp: DateTime.parse('2026-01-01T10:04:00Z'),
        ),
      ];
      respondToInventoryBatchWith(
        (records) => {
          'status': 'PARTIAL',
          'received': records.length,
          'results': [
            {
              ...records[0],
              'status': 'REJECTED',
              'retryable': false,
              'code': 'INVALID_DELTA',
            },
            {
              ...records[1],
              'status': 'BLOCKED_BY_PRIOR_FAILURE',
              'retryable': true,
              'code': 'PRIOR_FAILURE',
            },
            {
              ...records[2],
              'status': 'IDEMPOTENCY_MISMATCH',
              'retryable': false,
              'code': 'CRITICAL_IDEMPOTENCY_MISMATCH',
            },
            {...records[3], 'status': 'BOGUS_STATUS', 'retryable': true},
            {
              ...records[4],
              'sourceSequence': (records[4]['sourceSequence'] as int) + 10,
              'status': 'DUPLICATE',
              'retryable': false,
              'code': 'DUPLICATE_REPLAY',
            },
          ],
        },
      );

      await syncService.triggerManualSync();

      expect(mockInventoryRepository.syncedIds, isEmpty);
      expect(mockInventoryRepository.retriedIds, [
        'mov-rejected',
        'mov-blocked',
        'mov-mismatch',
        'mov-unknown',
        'mov-meta-mismatch',
      ]);
      expect(
        mockInventoryRepository.syncMetadataByMovementId.map(
          (id, state) => MapEntry(id, state.lastResultCode),
        ),
        equals(<String, String>{
          'mov-rejected': 'INVALID_DELTA',
          'mov-blocked': 'PRIOR_FAILURE',
          'mov-mismatch': 'CRITICAL_IDEMPOTENCY_MISMATCH',
          'mov-unknown': 'BOGUS_STATUS',
          'mov-meta-mismatch': 'DUPLICATE_REPLAY',
        }),
      );
    },
  );

  test(
    'syncs alert lifecycle documents and refreshes the persistent inbox',
    () async {
      mockInventoryRepository.unsyncedForensicAlerts = [
        ForensicAlert(
          id: 'alert-1',
          alertType: 'LOW_STOCK',
          severity: 'high',
          message: 'Stock bajo en leche.',
          createdAt: DateTime(2026, 6, 2, 10),
          status: 'acknowledged',
          note: 'Revisado por gerente',
          actorLabel: 'manager-1',
          actedAt: DateTime(2026, 6, 2, 10, 5),
          sourceMovementId: 'mov-1',
          sourceDocumentId: 'purchase-1',
          sourceDocumentType: 'PURCHASE',
          isSynced: false,
        ),
      ];
      mockInventoryRepository.forensicAlerts = const <ForensicAlert>[];
      capturedGets['/inventory/alerts'] = {
        'alerts': [
          {
            'id': 'alert-remote',
            'alertType': 'COUNT_VARIANCE',
            'severity': 'critical',
            'message': 'Conteo con variación relevante.',
            'status': 'active',
            'createdAt': '2026-06-02T11:00:00.000Z',
            'sourceMovementId': 'mov-9',
            'sourceDocumentId': 'count-1',
            'sourceDocumentType': 'COUNT_SESSION',
          },
        ],
      };

      await syncService.triggerManualSync();

      expect(
        mockInventoryRepository.syncedForensicAlertIds,
        contains('alert-1'),
      );
      expect(
        capturedPosts.any(
          (post) => post.path == '/inventory/alerts/alert-1/lifecycle',
        ),
        true,
      );
      expect(mockInventoryRepository.forensicAlerts.single.id, 'alert-remote');
    },
  );

  test(
    'marks linked movement ids as failed without mutating movement history on document sync errors',
    () async {
      mockInventoryRepository.unsyncedProductionOrders = [
        ProductionOrderDocument(
          id: 'po-1',
          recipeVersionId: 'rv-1',
          recipeProductId: 'prod-1',
          recipeProductName: 'Vanilla Latte',
          producedInsumoId: 'ins-1',
          producedInsumoName: 'Base',
          plannedQuantity: 10,
          actualQuantity: 9,
          producedBatchNumber: 'PB-1',
          producedExpirationDate: DateTime(2026, 7, 1),
          operationDate: DateTime(2026, 6, 2, 10),
          status: 'CLOSED_PENDING_SYNC',
          movementReferences: const ['mov-prod-1', 'mov-prod-2'],
        ),
      ];
      forcedError = DioException(
        requestOptions: RequestOptions(
          path: '/inventory/production-orders/close',
        ),
        response: Response(
          data: {'error': 'production sync failed'},
          statusCode: 400,
          requestOptions: RequestOptions(
            path: '/inventory/production-orders/close',
          ),
        ),
        type: DioExceptionType.badResponse,
      );

      await syncService.triggerManualSync();

      expect(mockInventoryRepository.syncedIds, isEmpty);
      expect(
        mockInventoryRepository.failedIds,
        containsAll(const ['mov-prod-1', 'mov-prod-2']),
      );
    },
  );
}
