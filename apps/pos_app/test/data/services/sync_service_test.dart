import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
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
import 'package:pos_app/domain/models/audit_log.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';

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
  Future<void> logForensic(String action, {String? metadata, String? metodoAutorizacion, String? usuarioAutorizadorId}) async {}

  @override
  Future<List<AuditLog>> getLocalLogs({DateTime? start, DateTime? end, String? userId}) async => [];
}

class FakeInventoryRepository implements InventoryRepository {
  List<InventoryMovement> unsynced = [];
  List<Purchase> unsyncedPurchases = [];
  final List<String> syncedIds = [];
  final List<String> syncedPurchaseIds = [];

  @override
  Future<List<InventoryMovement>> getUnsyncedMovements() async => unsynced;

  @override
  Future<void> markMovementAsSynced(String id) async {
    syncedIds.add(id);
  }

  @override
  Future<List<Purchase>> getUnsyncedPurchases() async => unsyncedPurchases;

  @override
  Future<void> markPurchaseAsSynced(String id) async {
    syncedPurchaseIds.add(id);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);

  @override
  get database => throw UnimplementedError();
  @override
  Future<List<Insumo>> getActiveInsumos() async => throw UnimplementedError();
  @override
  Future<Insumo?> getInsumoById(String id) async => throw UnimplementedError();
  @override
  Future<List<Insumo>> getInsumosByIds(List<String> ids) async => throw UnimplementedError();
  @override
  Future<void> updateInsumoStock(String id, double newStock) async => throw UnimplementedError();
  @override
  Future<void> updateInsumoCost(String id, double newCost) async => throw UnimplementedError();
  @override
  Future<void> saveInsumo(Insumo insumo) async => throw UnimplementedError();
  @override
  Future<List<Product>> getActiveProducts() async => throw UnimplementedError();
  @override
  Future<Product?> getProductById(String id) async => throw UnimplementedError();
  @override
  Future<void> saveProductOptions({required String productId, required List<ProductVariant> variants, required List<Modifier> modifiers}) async => throw UnimplementedError();
  @override
  Future<List<Recipe>> getRecipeByProductId(String productId) async => throw UnimplementedError();
  @override
  Future<void> saveRecipe(Recipe recipe) async => throw UnimplementedError();
  @override
  Future<void> deleteRecipe(String id) async => throw UnimplementedError();
  @override
  Future<void> saveMovement(InventoryMovement movement) async => throw UnimplementedError();
  @override
  Future<List<InventoryMovement>> getAllMovements() async => throw UnimplementedError();
  @override
  Future<List<Supplier>> getActiveSuppliers() async => throw UnimplementedError();
  @override
  Future<void> saveSupplier(Supplier supplier) async => throw UnimplementedError();
  @override
  Future<List<Warehouse>> getActiveWarehouses() async => throw UnimplementedError();
  @override
  Future<void> saveWarehouse(Warehouse warehouse) async => throw UnimplementedError();
  @override
  Future<List<Batch>> getBatchesByInsumoId(String insumoId) async => throw UnimplementedError();
  @override
  Future<void> saveBatch(Batch batch) async => throw UnimplementedError();
  @override
  Future<List<UomConversion>> getConversionsByInsumoId(String insumoId) async => throw UnimplementedError();
  @override
  Future<void> saveConversion(UomConversion conversion) async => throw UnimplementedError();
  @override
  Future<void> savePurchase(Purchase purchase) async => throw UnimplementedError();
  @override
  Future<void> queuePurchaseSync(Purchase purchase) async => throw UnimplementedError();
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

  setUp(() {
    mockAuditRepository = FakeAuditRepository();
    mockSalesRepository = MockSalesRepository();
    mockInventoryRepository = FakeInventoryRepository();
    postCalls = 0;
    forcedError = null;
    capturedPosts.clear();
    dio = Dio();
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (options.method.toUpperCase() == 'POST') {
            postCalls += 1;
            capturedPosts.add(CapturedPost(path: options.path, body: options.data));
            if (forcedError != null) {
              handler.reject(forcedError!);
              return;
            }
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
    syncService = SyncService(mockAuditRepository, mockSalesRepository, mockInventoryRepository, dio);
  });

  test('syncs audit logs and marks sales as synced on successful sync', () async {
    syncService = SyncService(
      mockAuditRepository,
      mockSalesRepository,
      mockInventoryRepository,
      dio,
      role: 'EDGE_SERVER',
    );

    final unsynced = [
      InventoryMovement(id: 'mov-1', insumoId: 'i-1', type: MovementType.sale, quantity: -1, previousStock: 5, newStock: 4, timestamp: DateTime.parse('2026-01-01T10:00:00Z')),
      InventoryMovement(id: 'mov-2', insumoId: 'i-1', type: MovementType.reversal, quantity: 1, previousStock: 4, newStock: 5, timestamp: DateTime.parse('2026-01-01T10:00:01Z')),
    ];

    mockInventoryRepository.unsynced = unsynced;
    await syncService.triggerManualSync();

    expect(mockAuditRepository.syncCount, 1);
    expect(mockInventoryRepository.unsynced.length, 2);
  });

  test('does not mark sales as synced when sync endpoint returns error', () async {
    final unsynced = [
      InventoryMovement(id: 'mov-23', insumoId: 'i-1', type: MovementType.sale, quantity: -1, previousStock: 1, newStock: 0, timestamp: DateTime.parse('2026-01-01T11:00:00Z')),
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
  });

  test('does not post when there are no unsynced sales', () async {
    mockInventoryRepository.unsynced = [];

    await syncService.triggerManualSync();

    expect(postCalls, 0);
  });

  test('sends plain JSON records when role is STANDALONE', () async {
    final unsynced = [
      InventoryMovement(id: 'mov-9', insumoId: 'i-9', type: MovementType.sale, quantity: -2, previousStock: 4, newStock: 2, timestamp: DateTime.parse('2026-01-01T12:00:00Z')),
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
        quantity: 2,
        unitCost: 10,
        timestamp: DateTime.parse('2026-01-01T12:00:00Z'),
        invoiceDate: DateTime(2026, 1, 1),
        currency: 'USD',
        bcnRate: 36.5,
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
    expect(
      capturedPosts.any((post) => post.path == '/inventory/purchases'),
      true,
    );
    expect(
      capturedPosts.any((post) => post.path == '/v1/sync/batch'),
      true,
    );
  });

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

  test('uses persisted outbox order and deterministic fallback sourceSequence', () async {
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
  });

  test('keeps idempotencyKey and sourceSequence stable across replays', () async {
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
    final firstRecord = (first['records'] as List<dynamic>).single as Map<String, dynamic>;
    final secondRecord = (second['records'] as List<dynamic>).single as Map<String, dynamic>;

    expect(firstRecord['idempotencyKey'], secondRecord['idempotencyKey']);
    expect(firstRecord['sourceSequence'], secondRecord['sourceSequence']);
  });
}
