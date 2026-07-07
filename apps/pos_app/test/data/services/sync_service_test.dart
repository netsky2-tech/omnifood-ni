import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:pos_app/data/repositories/inventory/inventory_repository_impl.dart';
import 'package:pos_app/data/services/sync_service.dart';
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

class FakeInventoryRepository implements InventoryRepository {
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
      expect(records[0]['idempotencyKey'], 'inventory:mov-older');
      expect(records[1]['idempotencyKey'], 'inventory:mov-newer');
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
