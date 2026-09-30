import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:package_info_plus_platform_interface/package_info_data.dart';
import 'package:package_info_plus_platform_interface/package_info_platform_interface.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:pos_app/data/models/human_authorization/canonical.dart';
import 'package:pos_app/data/models/human_authorization/error_codes.dart';
import 'package:pos_app/data/models/human_authorization/ohac_acknowledgement_request.dart';
import 'package:pos_app/data/models/human_authorization/ohac_delivery_entities.dart';
import 'package:pos_app/data/models/human_authorization/staff_policy_epoch_v1.dart';
import 'package:pos_app/data/repositories/inventory/inventory_repository_impl.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'package:pos_app/data/services/network_connectivity_service.dart';
import 'package:pos_app/domain/models/fulfillment/fulfillment_checkout_context.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/models/user_entity.dart';
import 'package:pos_app/data/models/customer/customer_entity.dart';
import 'package:pos_app/data/models/customer/customer_point_transaction_entity.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
import 'package:pos_app/data/models/sales/cash_movement_entity.dart';
import 'package:pos_app/data/models/inventory/movement_sync_state_entity.dart';
import 'package:pos_app/data/models/inventory/movement_entity.dart';
import 'package:pos_app/data/models/inventory/forensic_alert_entity.dart';
import 'package:pos_app/data/models/inventory/kardex_correction_entity.dart';
import 'package:pos_app/data/models/inventory/kardex_recalculate_queue_entity.dart';
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
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/security/ohac_outbox_registry.dart';
import 'package:pos_app/domain/security/ohac_observability.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart' hide Batch;

import '../models/human_authorization/ohac_test_helpers.dart';

class CapturedPost {
  final String path;
  final dynamic body;

  CapturedPost({required this.path, required this.body});
}


/// The decision-31 test registrant for the drain gate (B3): a mutable
/// assertion-bearing outbox whose drain state the tests move directly.
class MutableOhacTestOutbox
    implements OhacAssertionBearingOutbox, OhacQuarantineReportingOutbox {
  @override
  final String outboxId;

  int? lowestUnconsumed;
  int? lowestQuarantined;

  MutableOhacTestOutbox(this.outboxId,
      {this.lowestUnconsumed, this.lowestQuarantined});

  @override
  Future<int?> lowestUnconsumedAssertionSequence() async => lowestUnconsumed;

  @override
  Future<int?> lowestQuarantinedAssertionSequence() async => lowestQuarantined;
}

class MockSalesRepository implements SalesRepository {
  List<Map<String, dynamic>> unsyncedAggregates = [];
  final List<List<String>> syncedInvoiceIdBatches = [];

  @override
  Future<List<Map<String, dynamic>>> getUnsyncedAggregates() async =>
      unsyncedAggregates;

  final List<
    ({
      String invoiceId,
      String? outcome,
      List<String> acknowledgedCorrelationIds,
    })
  >
  acknowledgedSales = [];
  bool failNextAcknowledge = false;

  @override
  Future<int> getInventoryEnrichmentPendingCount() async => 0;

  @override
  Future<void> markAsSynced(List<String> invoiceIds) async {
    syncedInvoiceIdBatches.add(invoiceIds);
  }

  @override
  Future<void> acknowledgeSaleSync({
    required String invoiceId,
    required String? outcome,
    required List<String> acknowledgedCorrelationIds,
  }) async {
    if (failNextAcknowledge) {
      throw StateError('Integrity failure acknowledging sale $invoiceId');
    }
    acknowledgedSales.add((
      invoiceId: invoiceId,
      outcome: outcome,
      acknowledgedCorrelationIds: acknowledgedCorrelationIds,
    ));
    syncedInvoiceIdBatches.add([invoiceId]);
  }

  @override
  Future<String> createCreditNote({
    required String originalInvoiceId,
    required String reason,
    required String authorizedByUserId,
    required UserRole authorizedByRole,
    RefundReasonPolicy refundReasonPolicy =
        RefundReasonPolicy.restockOriginalBom,
    String? terminalId,
    List<CreditNoteRefundLine>? lines,
  }) async => throw UnimplementedError();

  @override
  Future<Invoice?> getInvoiceById(String id) async =>
      throw UnimplementedError();

  @override
  Future<Invoice?> getInvoiceByNumber(String number) async =>
      throw UnimplementedError();

  @override
  Future<List<Invoice>> getInvoicesBySessionId(String sessionId) async =>
      throw UnimplementedError();

  @override
  Future<List<Payment>> getPaymentsBySessionId(String sessionId) async =>
      throw UnimplementedError();

  @override
  Future<List<Invoice>> getUnsyncedInvoices() async =>
      throw UnimplementedError();

  @override
  Future<void> saveSale({
    required Invoice invoice,
    required List<InvoiceItem> items,
    required List<Payment> payments,
    FulfillmentCheckoutContext? fulfillmentContext,
  }) async => throw UnimplementedError();

  @override
  Future<ReprintPreparation> prepareReprintInvoice(
    String invoiceId,
    String reasonCode, {
    String? reasonDetail,
  }) async =>
      throw UnimplementedError();

  @override
  Future<void> voidInvoice(String invoiceId, String reasonCode,
      {String? reasonDetail}) async => throw UnimplementedError();
}

class FakeAuditRepository implements AuditRepository {
  @override
  String get deviceId => 'dev-1';

  var syncCount = 0;
  AuditSyncOutcome nextOutcome = const AuditSyncOutcome.complete();

  @override
  Future<AuditSyncOutcome> syncLogs() async {
    syncCount += 1;
    return nextOutcome;
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
  final List<String> syncMarkEvents = [];
  final Map<String, MovementSyncMetadata> syncMetadataByMovementId = {};
  final List<String> retriedIds = [];
  final Set<String> movementIdsThatFailMarkSynced = <String>{};

  // Slice 5a (finding H1): inject a failure into the per-domain outbox
  // pending-count query to prove fault isolation and that the failure path
  // is actually entered.
  bool failUnsyncedMovementsQuery = false;
  int unsyncedMovementsQueryCalls = 0;

  @override
  Future<List<InventoryMovement>> getUnsyncedMovements() async {
    unsyncedMovementsQueryCalls += 1;
    if (failUnsyncedMovementsQuery) {
      throw StateError('injected outbox count query failure');
    }
    return unsynced;
  }

  @override
  Future<void> markMovementAsSynced(String id) async {
    if (movementIdsThatFailMarkSynced.remove(id)) {
      throw StateError('Injected markMovementAsSynced failure for $id');
    }
    syncMarkEvents.add('movement:$id');
    syncedIds.add(id);
    syncMetadataByMovementId.remove(id);
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
    syncMarkEvents.add('production:$id');
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

  @override
  Future<List<KardexCorrectionEntity>> getKardexCorrections() async => [];
  @override
  Future<List<KardexRecalculateQueueEntity>> getPendingKardexQueue() async =>
      [];
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
  final List<String> capturedGetPaths = [];

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
    capturedGetPaths.clear();
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
            if (options.path == '/v1/sync/batch') {
              final records =
                  ((options.data as Map<String, dynamic>)['records']
                          as List<dynamic>)
                      .cast<Map<String, dynamic>>();
              handler.resolve(
                Response<dynamic>(
                  data: {
                    'status': 'OK',
                    'received': records.length,
                    'results': records
                        .map((record) => {...record, 'status': 'ACCEPTED'})
                        .toList(growable: false),
                  },
                  statusCode: 200,
                  requestOptions: options,
                ),
              );
              return;
            }
          }
          if (options.method.toUpperCase() == 'GET') {
            capturedGetPaths.add(options.path);
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

  InventoryMovement movement(
    String id, {
    DateTime? timestamp,
    MovementType type = MovementType.adjustment,
    String deliveryOwner = 'GENERIC_INVENTORY',
    String deliveryState = 'LOCAL_APPLIED',
    String? sourceDocumentType,
  }) {
    return InventoryMovement(
      id: id,
      insumoId: 'i-1',
      type: type,
      quantity: -1,
      previousStock: 10,
      newStock: 9,
      timestamp: timestamp ?? DateTime.parse('2026-01-01T10:00:00Z'),
      deliveryOwner: deliveryOwner,
      deliveryState: deliveryState,
      sourceDocumentType: sourceDocumentType,
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
    'continues later domains and reports partial when audit transport is retryable',
    () async {
      mockAuditRepository.nextOutcome = const AuditSyncOutcome.retryable(
        failedStreams: 1,
      );
      mockSalesRepository.unsyncedAggregates = [
        {
          'id': 'sale-1',
          'number': 'F-001',
          'documentType': 'INVOICE',
          'terminalId': 'terminal-1',
          'sourceSequence': 1,
          'idempotencyKey': 'sales:terminal-1:sale-1',
          'items': <Map<String, Object?>>[],
          'payments': <Map<String, Object?>>[],
        },
      ];

      final outcome = await syncService.triggerManualSync();

      expect(outcome.status, SyncRunStatus.partial);
      expect(mockSalesRepository.syncedInvoiceIdBatches, [
        ['sale-1'],
      ]);
    },
  );

  test('reports complete when every domain has no pending work', () async {
    final outcome = await syncService.triggerManualSync();

    expect(outcome.status, SyncRunStatus.complete);
  });

  test(
    'releases the sync guard after a retryable audit timeout outcome',
    () async {
      mockAuditRepository.nextOutcome = const AuditSyncOutcome.retryable(
        failedStreams: 1,
      );

      await syncService.triggerManualSync();
      await syncService.triggerManualSync();

      expect(mockAuditRepository.syncCount, 2);
    },
  );

  test(
    'continues inventory after a sales timeout and reports partial',
    () async {
      mockSalesRepository.unsyncedAggregates = [
        {
          'id': 'sale-timeout',
          'number': 'F-002',
          'documentType': 'INVOICE',
          'terminalId': 'terminal-1',
          'sourceSequence': 1,
          'idempotencyKey': 'sales:terminal-1:sale-timeout',
          'items': <Map<String, Object?>>[],
          'payments': <Map<String, Object?>>[],
        },
      ];
      mockInventoryRepository.unsynced = [movement('inventory-after-sales')];
      forcedError = DioException(
        requestOptions: RequestOptions(path: '/v1/sync/batch'),
        type: DioExceptionType.connectionTimeout,
      );

      final outcome = await syncService.triggerManualSync();

      expect(outcome.status, SyncRunStatus.partial);
      expect(capturedPosts.length, greaterThanOrEqualTo(2));
    },
  );

  test('reports partial when inventory transport fails', () async {
    mockInventoryRepository.unsynced = [movement('inventory-timeout')];
    forcedError = DioException(
      requestOptions: RequestOptions(path: '/v1/sync/batch'),
      type: DioExceptionType.connectionError,
    );

    final outcome = await syncService.triggerManualSync();

    expect(outcome.status, SyncRunStatus.partial);
    expect(mockInventoryRepository.failedIds, ['inventory-timeout']);
  });

  test(
    'aggregates multiple domain transport failures deterministically',
    () async {
      mockSalesRepository.unsyncedAggregates = [
        {
          'id': 'sale-failure',
          'number': 'F-003',
          'documentType': 'INVOICE',
          'terminalId': 'terminal-1',
          'sourceSequence': 1,
          'idempotencyKey': 'sales:terminal-1:sale-failure',
          'items': <Map<String, Object?>>[],
          'payments': <Map<String, Object?>>[],
        },
      ];
      mockInventoryRepository.unsynced = [movement('inventory-failure')];
      forcedError = DioException(
        requestOptions: RequestOptions(path: '/v1/sync/batch'),
        type: DioExceptionType.connectionTimeout,
      );

      final first = await syncService.triggerManualSync();
      final second = await syncService.triggerManualSync();

      expect(
        [first.status, second.status],
        [SyncRunStatus.partial, SyncRunStatus.partial],
      );
      expect(capturedPosts.length, greaterThanOrEqualTo(4));
    },
  );

  test(
    'does not mark sales as synced when sync endpoint returns error',
    () async {
      final unsynced = [
        InventoryMovement(
          id: 'mov-23',
          insumoId: 'i-1',
          type: MovementType.adjustment,
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

  test(
    'DSI-6: holds local credit notes OUT of the device sales batch',
    () async {
      // SyncCreditNoteAuthGuard (sync-credit-note-auth.guard.ts:38-73)
      // fails closed with 403 for ANY device batch containing CREDIT_NOTE,
      // stalling unrelated sales and tripping AUTH_BLOCKED
      // (AP_KNOWN_LIMITATIONS.md L3). The client therefore never puts a
      // credit note on the wire while DSI-6 is unimplemented: the note
      // stays pending locally and nothing is posted.
      mockSalesRepository.unsyncedAggregates = [
        {
          'id': 'credit-note-1',
          'number': 'NC-001',
          'documentType': 'CREDIT_NOTE',
          'terminalId': 'pos-terminal-1',
          'sourceSequence': 12,
          'idempotencyKey': 'credit-note:pos-terminal-1:credit-note-1',
          'originInvoiceId': 'sale-1',
          'refundReasonPolicy': 'FINANCIAL_ONLY',
          'items': [
            {
              'id': 'credit-line-1',
              'originInvoiceItemId': 'sale-line-1',
              'quantity': -1,
              'total': -57.5,
            },
          ],
        },
      ];

      await syncService.triggerManualSync();

      final salesPosts = capturedPosts
          .where((post) => post.path == '/v1/sync/batch')
          .toList(growable: false);
      expect(salesPosts, isEmpty,
          reason: 'a device envelope with a CREDIT_NOTE record would be '
              'rejected wholesale with 403');
      // The held note is NOT acknowledged locally — it stays pending for
      // DSI-6.
      expect(mockSalesRepository.syncedInvoiceIdBatches, isEmpty);
    },
  );

  test(
    'DSI-6: a normal sale still syncs when a credit note is pending',
    () async {
      mockSalesRepository.unsyncedAggregates = [
        {
          'id': 'credit-note-1',
          'number': 'NC-001',
          'documentType': 'CREDIT_NOTE',
          'terminalId': 'pos-terminal-1',
          'sourceSequence': 12,
          'idempotencyKey': 'credit-note:pos-terminal-1:credit-note-1',
          'originInvoiceId': 'sale-1',
          'refundReasonPolicy': 'FINANCIAL_ONLY',
          'items': [
            {
              'id': 'credit-line-1',
              'originInvoiceItemId': 'sale-line-1',
              'quantity': -1,
              'total': -57.5,
            },
          ],
        },
        {
          'id': 'sale-1',
          'number': 'F001-000001',
          'documentType': 'SALE',
          'terminalId': 'pos-terminal-1',
          'sourceSequence': 11,
          'idempotencyKey': 'sale:pos-terminal-1:sale-1',
          'items': <Map<String, Object?>>[],
          'payments': <Map<String, Object?>>[],
        },
      ];

      await syncService.triggerManualSync();

      final salesPosts = capturedPosts
          .where((post) => post.path == '/v1/sync/batch')
          .toList(growable: false);
      expect(salesPosts, hasLength(1));
      final postedRecords =
          (salesPosts.single.body as Map<String, dynamic>)['records']
              as List<dynamic>;
      // Only the sale travels; the pending credit note is held back.
      expect(postedRecords, hasLength(1));
      expect((postedRecords.single as Map<String, dynamic>)['documentType'],
          'SALE');
      expect(
        (postedRecords.single as Map<String, dynamic>)['idempotencyKey'],
        'sale:pos-terminal-1:sale-1',
      );
      // The sale is acknowledged; the credit note stays pending locally.
      expect(mockSalesRepository.syncedInvoiceIdBatches, [
        ['sale-1'],
      ]);
    },
  );

  test(
    'marks only accepted and matching duplicate sales results as synced',
    () async {
      mockSalesRepository.unsyncedAggregates = [
        {
          'id': 'sale-accepted',
          'number': 'F001-ACCEPTED',
          'documentType': 'SALE',
          'terminalId': 'pos-terminal-1',
          'sourceSequence': 14,
          'idempotencyKey': 'sale:pos-terminal-1:sale-accepted',
        },
        {
          'id': 'sale-duplicate',
          'number': 'F001-DUPLICATE',
          'documentType': 'SALE',
          'terminalId': 'pos-terminal-1',
          'sourceSequence': 15,
          'idempotencyKey': 'sale:pos-terminal-1:sale-duplicate',
        },
        {
          'id': 'sale-mismatch',
          'number': 'F001-MISMATCH',
          'documentType': 'SALE',
          'terminalId': 'pos-terminal-1',
          'sourceSequence': 16,
          'idempotencyKey': 'sale:pos-terminal-1:sale-mismatch',
        },
      ];
      respondToInventoryBatchWith(
        (records) => {
          'status': 'OK',
          'received': records.length,
          'results': [
            {...records[0], 'status': 'ACCEPTED'},
            {...records[1], 'status': 'DUPLICATE'},
            {...records[2], 'status': 'IDEMPOTENCY_MISMATCH'},
          ],
        },
      );

      await syncService.triggerManualSync();

      expect(mockSalesRepository.syncedInvoiceIdBatches, [
        ['sale-accepted', 'sale-duplicate'],
      ]);
    },
  );

  test(
    'surfaces per-record sales rejections that are not accepted (issue #506)',
    () async {
      mockSalesRepository.unsyncedAggregates = [
        {
          'id': 'sale-terminal-ok',
          'number': 'F001-OK',
          'documentType': 'SALE',
          'terminalId': 'pos-terminal-1',
          'sourceSequence': 20,
          'idempotencyKey': 'sale:pos-terminal-1:sale-terminal-ok',
        },
        {
          'id': 'sale-terminal-bad',
          'number': 'F001-BAD',
          'documentType': 'SALE',
          'terminalId': 'pos-terminal-1',
          'sourceSequence': 21,
          'idempotencyKey': 'sale:pos-terminal-1:sale-terminal-bad',
        },
      ];
      respondToInventoryBatchWith(
        (records) => {
          'status': 'OK',
          'received': records.length,
          'results': [
            {...records[0], 'status': 'ACCEPTED'},
            {
              ...records[1],
              'status': 'IDEMPOTENCY_MISMATCH',
              'retryable': false,
              'code': 'CRITICAL_PAYLOAD_MISMATCH',
              'message': 'payload hash mismatch',
            },
          ],
        },
      );

      final rejections = <SalesRecordRejection>[];
      final subscription = syncService.onSalesRecordRejected.listen(
        rejections.add,
      );

      await syncService.triggerManualSync();
      await Future<void>.delayed(Duration.zero);

      // Acceptance semantics unchanged: only the accepted record is synced;
      // the rejected one stays pending, but is now operator-visible with
      // enough information to tell a terminal rejection from a transient
      // failure.
      expect(mockSalesRepository.syncedInvoiceIdBatches, [
        ['sale-terminal-ok'],
      ]);
      expect(rejections, hasLength(1));
      expect(rejections.single.invoiceId, 'sale-terminal-bad');
      expect(rejections.single.idempotencyKey,
          'sale:pos-terminal-1:sale-terminal-bad');
      expect(rejections.single.status, 'IDEMPOTENCY_MISMATCH');
      expect(rejections.single.code, 'CRITICAL_PAYLOAD_MISMATCH');
      expect(rejections.single.retryable, isFalse);
      expect(rejections.single.message, 'payload hash mismatch');

      await subscription.cancel();
    },
  );

  test(
    'syncs only the first sales batch envelope and leaves unsent aggregates pending',
    () async {
      mockSalesRepository.unsyncedAggregates = List.generate(501, (index) {
        final sequence = index + 1;
        return {
          'id': 'sale-$sequence',
          'number': 'F001-$sequence',
          'documentType': 'SALE',
          'terminalId': 'pos-terminal-1',
          'sourceSequence': sequence,
          'idempotencyKey': 'sale:pos-terminal-1:sale-$sequence',
          'items': const <Map<String, Object?>>[],
        };
      });

      await syncService.triggerManualSync();

      final salesPost = capturedPosts.firstWhere(
        (post) => post.path == '/v1/sync/batch',
      );
      final records =
          (salesPost.body as Map<String, dynamic>)['records'] as List<dynamic>;
      expect(records, hasLength(500));
      expect(mockSalesRepository.syncedInvoiceIdBatches, hasLength(1));
      expect(mockSalesRepository.syncedInvoiceIdBatches.single, hasLength(500));
      expect(
        mockSalesRepository.syncedInvoiceIdBatches.single,
        isNot(contains('sale-501')),
      );
    },
  );

  test(
    'syncs regular offline sale aggregates with deterministic source metadata',
    () async {
      mockSalesRepository.unsyncedAggregates = [
        {
          'id': 'sale-regular-offline',
          'number': 'F001-000129',
          'documentType': 'SALE',
          'terminalId': 'pos-cashier-1',
          'sourceSequence': 20,
          'idempotencyKey': 'sale:pos-cashier-1:sale-regular-offline',
          'items': const <Map<String, Object?>>[],
        },
      ];

      await syncService.triggerManualSync();

      final salesPost = capturedPosts.firstWhere(
        (post) => post.path == '/v1/sync/batch',
      );
      final record =
          ((salesPost.body as Map<String, dynamic>)['records'] as List<dynamic>)
                  .single
              as Map<String, dynamic>;
      expect(record['flowType'], 'sales');
      expect(record['documentType'], 'SALE');
      expect(record['terminalId'], 'pos-cashier-1');
      expect(record['sourceSequence'], 20);
      expect(
        record['idempotencyKey'],
        'sale:pos-cashier-1:sale-regular-offline',
      );
      expect(mockSalesRepository.syncedInvoiceIdBatches.single, [
        'sale-regular-offline',
      ]);
    },
  );

  test(
    'DSI-6: orders sale aggregates by local source sequence and holds the '
    'credit note out of the batch',
    () async {
      mockSalesRepository.unsyncedAggregates = [
        {
          'id': 'credit-note-after-sale',
          'number': 'NC-000130',
          'documentType': 'CREDIT_NOTE',
          'terminalId': 'pos-terminal-1',
          'sourceSequence': 31,
          'idempotencyKey': 'credit-note:pos-terminal-1:credit-note-after-sale',
          'originInvoiceId': 'sale-before-credit-note',
          'refundReasonPolicy': 'FINANCIAL_ONLY',
        },
        {
          'id': 'sale-before-credit-note',
          'number': 'F001-000130',
          'documentType': 'SALE',
          'terminalId': 'pos-terminal-1',
          'sourceSequence': 30,
          'idempotencyKey': 'sale:pos-terminal-1:sale-before-credit-note',
        },
      ];

      await syncService.triggerManualSync();

      final salesPost = capturedPosts.firstWhere(
        (post) => post.path == '/v1/sync/batch',
      );
      final records =
          ((salesPost.body as Map<String, dynamic>)['records'] as List<dynamic>)
              .cast<Map<String, dynamic>>();
      // Only the sale travels (DSI-6 hold); ordering by source sequence is
      // preserved for the documents that do travel.
      expect(records.map((record) => record['invoiceId']), [
        'sale-before-credit-note',
      ]);
      expect(mockSalesRepository.syncedInvoiceIdBatches.single, [
        'sale-before-credit-note',
      ]);
    },
  );

  test(
    'does not independently replay local credit-note restock movements',
    () async {
      mockInventoryRepository.unsynced = [
        InventoryMovement(
          id: 'credit-note-restock-local',
          insumoId: 'i-restock',
          type: MovementType.reversal,
          quantity: 1,
          previousStock: 3,
          newStock: 4,
          timestamp: DateTime.parse('2026-07-13T10:00:00Z'),
          sourceDocumentType: 'CREDIT_NOTE_RESTOCK',
          sourceDocumentId: 'credit-note-1',
          originInvoiceItemId: 'sale-line-1',
        ),
        InventoryMovement(
          id: 'regular-inventory-movement',
          insumoId: 'i-sale',
          type: MovementType.adjustment,
          quantity: -1,
          previousStock: 5,
          newStock: 4,
          timestamp: DateTime.parse('2026-07-13T10:01:00Z'),
        ),
      ];
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

      final inventoryPost = capturedPosts.lastWhere(
        (post) => post.path == '/v1/sync/batch',
      );
      final records =
          ((inventoryPost.body as Map<String, dynamic>)['records']
                  as List<dynamic>)
              .cast<Map<String, dynamic>>();
      expect(records, hasLength(1));
      expect(
        records.single['idempotencyKey'],
        'inventory:dev-1:regular-inventory-movement',
      );
      expect(
        mockInventoryRepository.syncedIds,
        contains('regular-inventory-movement'),
      );
      expect(
        mockInventoryRepository.syncedIds,
        isNot(contains('credit-note-restock-local')),
      );
    },
  );

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
        type: MovementType.adjustment,
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
              await database.execute(
                'CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY);',
              );
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
          actualQuantity: 0,
          producedBatchNumber: 'PB-1',
          producedExpirationDate: DateTime(2026, 7, 1),
          operationDate: DateTime(2026, 6, 2, 10),
          status: 'CLOSED_PENDING_SYNC',
          outcome: 'FAILED',
          failureReason: 'DESECHO_COCINA',
          terminalId: 'pos-terminal-7',
          sourceSequence: 42,
          idempotencyKey: 'production:pos-terminal-7:po-1',
          payloadHash: 'hash-po-1',
          totalConsumedCostNio: 180,
          producedUnitCostNio: 0,
          movementReferences: const ['mov-prod-1'],
        ),
      ];
      mockInventoryRepository.unsynced = [
        InventoryMovement(
          id: 'mov-adj-1',
          insumoId: 'i-1',
          type: MovementType.adjustment,
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
      final productionPost = capturedPosts.firstWhere(
        (post) => post.path == '/inventory/production-orders/close',
      );
      final productionPayload = productionPost.body as Map<String, Object?>;
      expect(productionPayload['outcome'], 'FAILED');
      expect(productionPayload['failureReason'], 'DESECHO_COCINA');
      expect(productionPayload['terminalId'], 'pos-terminal-7');
      expect(productionPayload['sourceSequence'], 42);
      expect(
        productionPayload['idempotencyKey'],
        'production:pos-terminal-7:po-1',
      );
      expect(productionPayload['payloadHash'], 'hash-po-1');
      expect(productionPayload['totalConsumedCostNio'], 180);
      expect(productionPayload['producedUnitCostNio'], 0);
    },
  );

  test(
    'does not generically replay production-linked movements when the production document fails',
    () async {
      forcedError = DioException(
        requestOptions: RequestOptions(
          path: '/inventory/production-orders/close',
        ),
        type: DioExceptionType.connectionError,
      );
      mockInventoryRepository.unsyncedProductionOrders = [
        ProductionOrderDocument(
          id: 'po-failed-sync',
          recipeVersionId: 'rv-1',
          recipeProductId: 'prod-1',
          recipeProductName: 'Vanilla Latte',
          producedInsumoId: 'ins-finished',
          producedInsumoName: 'Base',
          plannedQuantity: 10,
          actualQuantity: 0,
          producedBatchNumber: 'PB-1',
          producedExpirationDate: DateTime(2026, 7, 1),
          operationDate: DateTime(2026, 6, 2, 10),
          status: 'CLOSED_PENDING_SYNC',
          terminalId: 'pos-terminal-7',
          sourceSequence: 42,
          movementReferences: const ['mov-prod-out', 'mov-prod-in'],
        ),
      ];
      mockInventoryRepository.unsynced = [
        InventoryMovement(
          id: 'mov-prod-out',
          insumoId: 'raw-1',
          type: MovementType.production,
          quantity: -2,
          previousStock: 10,
          newStock: 8,
          timestamp: DateTime.parse('2026-06-02T10:00:00Z'),
          sourceDocumentType: 'PRODUCTION_CLOSE',
          sourceDocumentId: 'po-failed-sync',
        ),
        InventoryMovement(
          id: 'mov-adj-1',
          insumoId: 'raw-2',
          type: MovementType.adjustment,
          quantity: -1,
          previousStock: 5,
          newStock: 4,
          timestamp: DateTime.parse('2026-06-02T11:00:00Z'),
        ),
      ];

      await syncService.triggerManualSync();

      expect(mockInventoryRepository.failedIds, contains('mov-prod-out'));
      expect(mockInventoryRepository.failedIds, contains('mov-prod-in'));
      final genericPosts = capturedPosts.where(
        (post) => post.path == '/v1/sync/batch',
      );
      expect(genericPosts, hasLength(1));
      final body = genericPosts.single.body as Map<String, Object?>;
      final records = body['records'] as List<dynamic>;
      expect(records, hasLength(1));
      final record = records.single as Map<String, Object?>;
      expect(record['idempotencyKey'], 'inventory:dev-1:mov-adj-1');
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
    'syncs product merma valuation and source metadata without absolute stock fields',
    () async {
      final unsynced = [
        InventoryMovement(
          id: 'merma-product-1:bun',
          insumoId: 'bun',
          type: MovementType.shrinkage,
          quantity: -4,
          previousStock: 10,
          newStock: 6,
          timestamp: DateTime.parse('2026-01-01T12:00:00Z'),
          unitCostNio: 8.5,
          sourceDocumentType: 'PRODUCT_MERMA',
          sourceDocumentId: 'burger-plate',
        ),
      ];

      final body = syncService.buildOrderedBatchEnvelopeForTest(unsynced);
      final record =
          (body['records'] as List<dynamic>).single as Map<String, dynamic>;
      final movement =
          (record['movements'] as List<dynamic>).single as Map<String, dynamic>;

      expect(movement['insumoId'], 'bun');
      expect(movement['quantity'], -4);
      expect(movement['unitCostNio'], 8.5);
      expect(movement['sourceDocumentType'], 'PRODUCT_MERMA');
      expect(movement['sourceDocumentId'], 'burger-plate');
      expect(movement.containsKey('previousStock'), isFalse);
      expect(movement.containsKey('newStock'), isFalse);
      expect(record.containsKey('previousStock'), isFalse);
      expect(record.containsKey('newStock'), isFalse);
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
          type: MovementType.adjustment,
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

      expect(mockInventoryRepository.syncedIds, ['mov-meta-mismatch']);
      expect(mockInventoryRepository.retriedIds, [
        'mov-rejected',
        'mov-blocked',
        'mov-mismatch',
        'mov-unknown',
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
        }),
      );
    },
  );

  test(
    'never targets the retired inventory-alert routes and keeps alert lifecycle terminal-local',
    () async {
      // ST-05: the lifecycle POST (no backend route, always 404) and the
      // inbox refresh GET (incompatible stock-summary shape) are both gone.
      // Local acknowledgement/resolution stays enabled and terminal-local.
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
          },
        ],
      };

      await syncService.triggerManualSync();

      expect(
        capturedPosts.where(
          (post) => post.path.startsWith('/inventory/alerts'),
        ),
        isEmpty,
      );
      expect(
        capturedGetPaths.where((path) => path.startsWith('/inventory/alerts')),
        isEmpty,
      );
      // The locally acknowledged alert was never uploaded nor overwritten:
      // its lifecycle state is terminal-local and stays untouched.
      expect(mockInventoryRepository.syncedForensicAlertIds, isEmpty);
      expect(mockInventoryRepository.forensicAlerts, isEmpty);
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
          terminalId: 'pos-terminal-7',
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

  test(
    'keeps production document retryable when linked movement marking fails and completes local marking on idempotent retry',
    () async {
      mockInventoryRepository.unsyncedProductionOrders = [
        ProductionOrderDocument(
          id: 'po-mark-fails',
          recipeVersionId: 'rv-1',
          recipeProductId: 'prod-1',
          recipeProductName: 'Vanilla Latte',
          producedInsumoId: 'ins-finished',
          producedInsumoName: 'Base',
          plannedQuantity: 10,
          actualQuantity: 9,
          producedBatchNumber: 'PB-1',
          producedExpirationDate: DateTime(2026, 7, 1),
          operationDate: DateTime(2026, 6, 2, 10),
          status: 'CLOSED_PENDING_SYNC',
          terminalId: 'pos-terminal-7',
          sourceSequence: 42,
          idempotencyKey: 'production:pos-terminal-7:po-mark-fails',
          payloadHash: 'hash-po-mark-fails',
          movementReferences: const ['mov-prod-after-success'],
        ),
      ];
      mockInventoryRepository.unsynced = [
        InventoryMovement(
          id: 'mov-prod-after-success',
          insumoId: 'raw-1',
          type: MovementType.production,
          quantity: -2,
          previousStock: 10,
          newStock: 8,
          timestamp: DateTime.parse('2026-06-02T10:00:00Z'),
          sourceDocumentType: 'PRODUCTION_CLOSE',
          sourceDocumentId: 'po-mark-fails',
        ),
      ];
      mockInventoryRepository.movementIdsThatFailMarkSynced.add(
        'mov-prod-after-success',
      );

      await syncService.triggerManualSync();

      expect(mockInventoryRepository.syncedIds, isEmpty);
      expect(
        mockInventoryRepository.syncedProductionOrderIds,
        isNot(contains('po-mark-fails')),
      );
      expect(
        mockInventoryRepository.syncMarkEvents,
        isNot(contains('production:po-mark-fails')),
      );
      capturedPosts.clear();

      await syncService.triggerManualSync();

      expect(
        capturedPosts.where(
          (post) => post.path == '/inventory/production-orders/close',
        ),
        hasLength(1),
      );
      expect(
        capturedPosts.where((post) => post.path == '/v1/sync/batch'),
        isEmpty,
      );
      expect(
        mockInventoryRepository.syncedIds,
        contains('mov-prod-after-success'),
      );
      expect(
        mockInventoryRepository.syncedProductionOrderIds,
        contains('po-mark-fails'),
      );
      expect(mockInventoryRepository.syncMarkEvents, const [
        'movement:mov-prod-after-success',
        'production:po-mark-fails',
      ]);
    },
  );

  group('Slice 8.2 Inbound Catalog & Security Delta Sync', () {
    test(
      'pullInboundDeltas downloads deltas and hydrates SQLite tables',
      () async {
        final database = await $FloorAppDatabase
            .inMemoryDatabaseBuilder()
            .build();

        try {
          final syncServiceWithDb = SyncService(
            mockAuditRepository,
            mockSalesRepository,
            mockInventoryRepository,
            dio,
            database: database,
          );

          capturedGets['/v1/sync/inbound/deltas'] = {
            'status': 'success',
            'serverTime': '2026-08-26T18:00:00.000Z',
            'currentVersion': 1787745600000,
            'deltas': {
              'products': [
                {
                  'id': 'prod-101',
                  'name': 'Café Espresso Doble',
                  'uom': 'CUP',
                  'stock': 25.0,
                  'averageCost': 12.0,
                  'sellPrice': 55.0,
                  'isActive': true,
                  'isPerishable': false,
                  'createdAt': '2026-08-26T10:00:00.000Z',
                },
              ],
              'catalogValues': [
                {
                  'id': 'cat-101',
                  'catalogType': 'CATEGORY',
                  'code': 'HOT_BEVERAGE',
                  'name': 'Bebidas Calientes',
                  'isActive': true,
                  'sortOrder': 1,
                },
              ],
              'insumos': [
                {
                  'id': 'ins-101',
                  'name': 'Grano de Café Especial',
                  'purchaseUom': 'KG',
                  'consumptionUom': 'G',
                  'conversionFactor': 1000.0,
                  'stock': 5000.0,
                  'averageCost': 0.45,
                  'isActive': true,
                  'isPerishable': false,
                  // Issue #521 S1: stock alert thresholds must survive the
                  // sync pull into the local entity.
                  'parLevel': 6000.0,
                  'minStock': 1000.0,
                  'maxStock': 12000.0,
                },
                {
                  // Null case: an insumo without configured thresholds.
                  'id': 'ins-102',
                  'name': 'Leche Entera',
                  'purchaseUom': 'L',
                  'consumptionUom': 'ml',
                  'stock': 3.5,
                  'averageCost': 1.2,
                  'isActive': true,
                  'isPerishable': true,
                },
              ],
              'recipes': [
                {
                  'id': 'rec-101',
                  'productId': 'prod-101',
                  'ingredientId': 'ins-101',
                  'ingredientType': 'INSUMO',
                  'quantity': 18.0,
                },
              ],
              'users': [
                {
                  'id': 'user-201',
                  'name': 'Barista Principal',
                  'email': 'barista@omnifood.ni',
                  'role': 'CASHIER',
                  'isActive': true,
                  'securityProfile': {
                    'isPinEnabled': true,
                    'isTotpEnabled': false,
                    'pinHash': '\$2b\$10\$inboundhashedpin',
                  },
                },
              ],
            },
          };

          final result = await syncServiceWithDb.pullInboundDeltas();

          expect(result, isNotNull);
          expect(result!.productsCount, 1);
          expect(result.catalogValuesCount, 1);
          expect(result.insumosCount, 2);
          expect(result.recipesCount, 1);
          expect(result.usersCount, 1);

          // Verify SQLite hydration
          final savedProduct = await database.productDao.findProductById(
            'prod-101',
          );
          expect(savedProduct, isNotNull);
          expect(savedProduct!.name, 'Café Espresso Doble');
          expect(savedProduct.sellPrice, 55.0);
          // B2e D-3 fail-closed: the delta omits taxRate, so the stored rate
          // must default to 0.0 (exempt), never an invented 15%.
          expect(savedProduct.taxRate, 0.0);

          final savedCategory = await database.catalogValueDao
              .findByTypeAndCode('CATEGORY', 'HOT_BEVERAGE');
          expect(savedCategory, isNotNull);
          expect(savedCategory!.name, 'Bebidas Calientes');

          final savedInsumo = await database.insumoDao.findInsumoById(
            'ins-101',
          );
          expect(savedInsumo, isNotNull);
          expect(savedInsumo!.name, 'Grano de Café Especial');
          expect(savedInsumo.consumptionUom, 'G');
          // Issue #521 S1: thresholds carried through the delta payload.
          expect(savedInsumo.parLevel, 6000.0);
          expect(savedInsumo.stockMin, 1000.0);
          expect(savedInsumo.stockMax, 12000.0);

          // Issue #521 S1: absent keys ingest as null, never as 0.
          final savedInsumoNoThresholds = await database.insumoDao
              .findInsumoById('ins-102');
          expect(savedInsumoNoThresholds, isNotNull);
          expect(savedInsumoNoThresholds!.parLevel, isNull);
          expect(savedInsumoNoThresholds.stockMin, isNull);
          expect(savedInsumoNoThresholds.stockMax, isNull);

          final savedRecipes = await database.recipeDao.findRecipeByProductId(
            'prod-101',
          );
          expect(savedRecipes, hasLength(1));
          expect(savedRecipes.first.quantity, 18.0);

          final savedUser = await database.userDao.findUserById('user-201');
          expect(savedUser, isNotNull);
          expect(savedUser!.name, 'Barista Principal');
          expect(savedUser.pinHash, '\$2b\$10\$inboundhashedpin');

          final savedProfile = await database.securityProfileDao.findByUserId(
            'user-201',
          );
          expect(savedProfile, isNotNull);
          expect(savedProfile!.pinHash, '\$2b\$10\$inboundhashedpin');

          // Verify watermark saved in local_configs
          final savedVersionConfig = await database.localConfigDao
              .getConfigByKey('last_inbound_sync_version');
          expect(savedVersionConfig, isNotNull);
          expect(savedVersionConfig!.value, '1787745600000');
        } finally {
          await database.close();
        }
      },
    );

    test(
      'user delta with tenantId stores the inbound tenant id on the user row',
      () async {
        final database = await $FloorAppDatabase
            .inMemoryDatabaseBuilder()
            .build();

        try {
          final syncServiceWithDb = SyncService(
            mockAuditRepository,
            mockSalesRepository,
            mockInventoryRepository,
            dio,
            database: database,
          );

          capturedGets['/v1/sync/inbound/deltas'] = {
            'status': 'success',
            'serverTime': '2026-09-03T10:00:00.000Z',
            'currentVersion': 1787745600001,
            'deltas': {
              'users': [
                {
                  'id': 'user-301',
                  'name': 'Mesera Con Tenant',
                  'email': 'tenant@omnifood.ni',
                  'role': 'CASHIER',
                  'isActive': true,
                  'tenantId': 'tenant-inbound',
                },
              ],
            },
          };

          final result = await syncServiceWithDb.pullInboundDeltas();

          expect(result, isNotNull);
          expect(result!.usersCount, 1);

          final savedUser = await database.userDao.findUserById('user-301');
          expect(savedUser, isNotNull);
          expect(savedUser!.name, 'Mesera Con Tenant');
          // The inbound delta carries the tenant binding; the replace-upsert
          // must not lose it.
          expect(savedUser.tenantId, 'tenant-inbound');
        } finally {
          await database.close();
        }
      },
    );

    test(
      'user delta missing tenantId preserves the existing row tenant id',
      () async {
        final database = await $FloorAppDatabase
            .inMemoryDatabaseBuilder()
            .build();

        try {
          // A locally provisioned user row that already carries a tenant
          // binding from a previous pull or local activation.
          await database.userDao.insertUsers([
            UserEntity(
              id: 'user-302',
              name: 'Barista Antiguo',
              role: 'CASHIER',
              pinHash: 'old-pin',
              isActive: true,
              tenantId: 'tenant-existing',
            ),
          ]);

          final syncServiceWithDb = SyncService(
            mockAuditRepository,
            mockSalesRepository,
            mockInventoryRepository,
            dio,
            database: database,
          );

          capturedGets['/v1/sync/inbound/deltas'] = {
            'status': 'success',
            'serverTime': '2026-09-03T11:00:00.000Z',
            'currentVersion': 1787745600002,
            'deltas': {
              'users': [
                {
                  'id': 'user-302',
                  'name': 'Barista Actualizado',
                  'email': 'barista2@omnifood.ni',
                  'role': 'CASHIER',
                  'isActive': true,
                  // Legacy backend payload: no tenantId field at all.
                },
              ],
            },
          };

          final result = await syncServiceWithDb.pullInboundDeltas();

          expect(result, isNotNull);
          expect(result!.usersCount, 1);

          final savedUser = await database.userDao.findUserById('user-302');
          expect(savedUser, isNotNull);
          // The delta fields are applied...
          expect(savedUser!.name, 'Barista Actualizado');
          // ...but the previously stored tenant id must survive the
          // replace-upsert instead of being erased to NULL.
          expect(savedUser.tenantId, 'tenant-existing');
        } finally {
          await database.close();
        }
      },
    );

    test(
      'user delta missing tenantId with NULL existing row cures from local_configs',
      () async {
        final database = await $FloorAppDatabase
            .inMemoryDatabaseBuilder()
            .build();

        try {
          // Terminal already activated: local_configs holds the tenant
          // binding key used by authority hydration, fulfillment, loyalty.
          await database.localConfigDao.saveConfig(
            LocalConfigEntity(key: 'tenant_id', value: 'tenant-cure'),
          );

          final syncServiceWithDb = SyncService(
            mockAuditRepository,
            mockSalesRepository,
            mockInventoryRepository,
            dio,
            database: database,
          );

          capturedGets['/v1/sync/inbound/deltas'] = {
            'status': 'success',
            'serverTime': '2026-09-03T12:00:00.000Z',
            'currentVersion': 1787745600003,
            'deltas': {
              'users': [
                {
                  'id': 'user-303',
                  'name': 'Supervisora Curada',
                  'email': 'supervisora@omnifood.ni',
                  'role': 'SUPERVISOR',
                  'isActive': true,
                },
              ],
            },
          };

          final result = await syncServiceWithDb.pullInboundDeltas();

          expect(result, isNotNull);
          expect(result!.usersCount, 1);

          final savedUser = await database.userDao.findUserById('user-303');
          expect(savedUser, isNotNull);
          // No inbound tenantId and no existing row: the terminal-local
          // tenant binding is the last-resort cure for already-NULL rows.
          expect(savedUser!.tenantId, 'tenant-cure');
        } finally {
          await database.close();
        }
      },
    );

    test(
      'projects inbound forensic alerts into the local inbox with insert-if-absent replay semantics',
      () async {
        final database = await $FloorAppDatabase
            .inMemoryDatabaseBuilder()
            .build();

        try {
          final syncServiceWithDb = SyncService(
            mockAuditRepository,
            mockSalesRepository,
            mockInventoryRepository,
            dio,
            database: database,
          );

          // A locally acknowledged alert that the cloud replays: the replay
          // must never clobber the terminal-local lifecycle state.
          await database.forensicAlertDao.upsertAlert(
            ForensicAlertEntity(
              id: 'alert-replayed',
              alertType: 'COUNT_VARIANCE',
              severity: 'high',
              message: 'Mensaje original de nube.',
              createdAt: '2026-09-01T10:00:00.000Z',
              status: 'acknowledged',
              note: 'Revisado por gerente',
              actorLabel: 'local-manager',
              actedAt: '2026-09-01T10:05:00.000Z',
            ),
          );

          capturedGets['/v1/sync/inbound/deltas'] = {
            'status': 'success',
            'serverTime': '2026-09-02T12:00:00.000Z',
            'currentVersion': 1787745600000,
            'deltas': {
              'alerts': [
                {
                  // Replayed: locally acknowledged, must stay untouched.
                  'id': 'alert-replayed',
                  'alertType': 'COUNT_VARIANCE',
                  'severity': 'high',
                  'message': 'Mensaje actualizado de nube.',
                  'actorRole': 'MANAGER',
                  'resolvedAt': null,
                  'createdAt': '2026-09-01T10:00:00.000Z',
                },
                {
                  // Resolved upstream: derived status, actor label from role.
                  'id': 'alert-resolved',
                  'alertType': 'AUDIT_BACKEND_TERMINAL_REJECTION',
                  'severity': 'critical',
                  'message': 'Rechazo de terminal registrado.',
                  'actorRole': null,
                  'resolvedAt': '2026-09-02T12:00:00.000Z',
                  'createdAt': '2026-09-01T11:00:00.000Z',
                },
                {
                  // Active upstream: stays active.
                  'id': 'alert-active',
                  'alertType': 'LOW_STOCK',
                  'severity': 'high',
                  'message': 'Stock bajo en leche.',
                  'actorRole': 'CASHIER',
                  'resolvedAt': null,
                  'createdAt': '2026-09-01T09:00:00.000Z',
                },
                {
                  // Malformed: missing id and createdAt must be skipped
                  // strictly, never fabricated with defaults.
                  'alertType': 'BROKEN',
                  'severity': 'low',
                  'message': 'Sin identidad.',
                },
                {
                  // Malformed lifecycle: a non-null but unparsable resolvedAt
                  // is malformed, not "active" — the row must be skipped.
                  'id': 'alert-bad-resolved-at',
                  'alertType': 'COUNT_VARIANCE',
                  'severity': 'medium',
                  'message': 'resolvedAt ilegible.',
                  'actorRole': null,
                  'resolvedAt': 'not-a-timestamp',
                  'createdAt': '2026-09-01T12:00:00.000Z',
                },
              ],
            },
          };

          final result = await syncServiceWithDb.pullInboundDeltas();

          expect(result, isNotNull);
          // alertsCount reports rows actually INSERTED, not rows received:
          // the replayed alert already exists locally, so its INSERT OR
          // IGNORE changes nothing and must not be counted.
          expect(result!.alertsCount, 2);

          final alerts = await database.forensicAlertDao.findAllAlerts();
          expect(alerts, hasLength(3));
          final byId = {
            for (final alert in alerts) alert.id: alert,
          };

          // The unparsable-resolvedAt row was skipped, never stored.
          expect(byId.containsKey('alert-bad-resolved-at'), isFalse);

          // Replay preservation: the local acknowledgement survived.
          final replayed = byId['alert-replayed']!;
          expect(replayed.status, 'acknowledged');
          expect(replayed.note, 'Revisado por gerente');
          expect(replayed.actorLabel, 'local-manager');
          expect(replayed.actedAt, '2026-09-01T10:05:00.000Z');
          expect(replayed.message, 'Mensaje original de nube.');

          // resolved_at derives lifecycle status; nothing else is fabricated.
          final resolved = byId['alert-resolved']!;
          expect(resolved.status, 'resolved');
          expect(resolved.actorLabel, isNull);
          expect(resolved.createdAt, '2026-09-01T11:00:00.000Z');

          final active = byId['alert-active']!;
          expect(active.status, 'active');
          expect(active.actorLabel, 'CASHIER');
        } finally {
          await database.close();
        }
      },
    );

    test(
      'pullInboundDeltas sends sinceVersion query parameter when watermark exists',
      () async {
        final database = await $FloorAppDatabase
            .inMemoryDatabaseBuilder()
            .build();

        try {
          await database.localConfigDao.saveConfig(
            LocalConfigEntity(
              key: 'last_inbound_sync_version',
              value: '1787700000000',
            ),
          );

          String? requestedSinceVersion;
          String? requestedTerminalId;

          final testDio = Dio();
          testDio.interceptors.add(
            InterceptorsWrapper(
              onRequest: (options, handler) {
                if (options.path == '/v1/sync/inbound/deltas') {
                  requestedSinceVersion = options
                      .queryParameters['sinceVersion']
                      ?.toString();
                  requestedTerminalId = options.queryParameters['terminalId']
                      ?.toString();
                  handler.resolve(
                    Response<dynamic>(
                      statusCode: 200,
                      requestOptions: options,
                      data: {
                        'status': 'success',
                        'serverTime': '2026-08-26T18:30:00.000Z',
                        'currentVersion': 1787750000000,
                        'deltas': {
                          'products': [],
                          'catalogValues': [],
                          'insumos': [],
                          'recipes': [],
                          'users': [],
                        },
                      },
                    ),
                  );
                  return;
                }
                handler.resolve(
                  Response<dynamic>(
                    statusCode: 200,
                    requestOptions: options,
                    data: {'ok': true},
                  ),
                );
              },
            ),
          );

          final syncServiceWithDb = SyncService(
            mockAuditRepository,
            mockSalesRepository,
            mockInventoryRepository,
            testDio,
            database: database,
          );

          await syncServiceWithDb.pullInboundDeltas();

          expect(requestedSinceVersion, '1787700000000');
          expect(requestedTerminalId, 'dev-1');

          final updatedVersionConfig = await database.localConfigDao
              .getConfigByKey('last_inbound_sync_version');
          expect(updatedVersionConfig?.value, '1787750000000');
        } finally {
          await database.close();
        }
      },
    );

    group('OHAC pull negotiation (design §11.5 decision 30)', () {
      test(
        'omits every negotiation parameter when the version read throws '
        '(fail-closed, decision 30)',
        () async {
          // Order-coupled by the package, not by choice: the injected
          // failing platform is only consulted while package_info_plus'
          // private static cache is empty, and package_info_plus 9.x caches
          // the first successful `fromPlatform` read with no public reset.
          // This test therefore must run before any successful
          // `PackageInfo.setMockInitialValues` in this file. Removing the
          // coupling needs a production seam (an injectable version reader)
          // and is out of scope for a test-only change.
          final originalPlatform = PackageInfoPlatform.instance;
          PackageInfoPlatform.instance = _FailingPackageInfoPlatform();
          addTearDown(() => PackageInfoPlatform.instance = originalPlatform);

          final database = await $FloorAppDatabase
              .inMemoryDatabaseBuilder()
              .build();

          try {
            Map<String, dynamic> captured = {};
            final testDio = Dio();
            testDio.interceptors.add(
              InterceptorsWrapper(
                onRequest: (options, handler) {
                  if (options.path == '/v1/sync/inbound/deltas') {
                    captured = Map<String, dynamic>.from(
                      options.queryParameters,
                    );
                    handler.resolve(
                      Response<dynamic>(
                        statusCode: 200,
                        requestOptions: options,
                        data: {
                          'status': 'success',
                          'serverTime': '2026-08-26T18:30:00.000Z',
                          'currentVersion': 1787750000000,
                          'deltas': {
                            'products': [],
                            'catalogValues': [],
                            'insumos': [],
                            'recipes': [],
                            'users': [],
                          },
                        },
                      ),
                    );
                    return;
                  }
                  handler.resolve(
                    Response<dynamic>(
                      statusCode: 200,
                      requestOptions: options,
                      data: {'ok': true},
                    ),
                  );
                },
              ),
            );

            final syncServiceWithDb = SyncService(
              mockAuditRepository,
              mockSalesRepository,
              mockInventoryRepository,
              testDio,
              database: database,
            );

            await syncServiceWithDb.pullInboundDeltas();

            // A legacy client: the backend omits the humanAuthorization
            // member when none of the four parameters is sent.
            expect(captured.containsKey('ohacPosBuild'), isFalse);
            expect(captured.containsKey('ohacPolicySchemas'), isFalse);
            expect(captured.containsKey('ohacAssertionSchemas'), isFalse);
            expect(captured.containsKey('ohacFloorSequence'), isFalse);
          } finally {
            await database.close();
          }
        },
      );

      test(
        'omits every negotiation parameter when the floor-state read fails '
        '(fail-closed, decision 30)',
        () async {
          // The version read succeeds here (a healthy PackageInfo mock), so
          // the omission below can only come from the floor-state read the
          // `ohacFloorSequence` parameter depends on: dropping the table
          // makes ensureTerminalState/findTerminalState throw, and the
          // builder must answer by omitting all four parameters rather than
          // claiming a negotiation it cannot state. This test is
          // declaration-order independent: it establishes its own
          // PackageInfo state instead of relying on an empty static cache.
          PackageInfo.setMockInitialValues(
            appName: 'OmniFood POS',
            packageName: 'com.omnifood.pos',
            version: '2.3.4',
            buildNumber: '11',
            buildSignature: '',
          );

          final database = await $FloorAppDatabase
              .inMemoryDatabaseBuilder()
              .build();

          try {
            await database.database
                .execute('DROP TABLE human_auth_terminal_state');

            Map<String, dynamic> captured = {};
            final testDio = Dio();
            testDio.interceptors.add(
              InterceptorsWrapper(
                onRequest: (options, handler) {
                  if (options.path == '/v1/sync/inbound/deltas') {
                    captured = Map<String, dynamic>.from(
                      options.queryParameters,
                    );
                    handler.resolve(
                      Response<dynamic>(
                        statusCode: 200,
                        requestOptions: options,
                        data: {
                          'status': 'success',
                          'serverTime': '2026-08-26T18:30:00.000Z',
                          'currentVersion': 1787750000000,
                          'deltas': {
                            'products': [],
                            'catalogValues': [],
                            'insumos': [],
                            'recipes': [],
                            'users': [],
                          },
                        },
                      ),
                    );
                    return;
                  }
                  handler.resolve(
                    Response<dynamic>(
                      statusCode: 200,
                      requestOptions: options,
                      data: {'ok': true},
                    ),
                  );
                },
              ),
            );

            final syncServiceWithDb = SyncService(
              mockAuditRepository,
              mockSalesRepository,
              mockInventoryRepository,
              testDio,
              database: database,
            );

            await syncServiceWithDb.pullInboundDeltas();

            // A pull that cannot state its floor coherently must not claim
            // negotiation it cannot support: all four parameters omitted.
            expect(captured.containsKey('ohacPosBuild'), isFalse);
            expect(captured.containsKey('ohacPolicySchemas'), isFalse);
            expect(captured.containsKey('ohacAssertionSchemas'), isFalse);
            expect(captured.containsKey('ohacFloorSequence'), isFalse);
          } finally {
            await database.close();
          }
        },
      );

      test(
        'sends the four negotiation parameters, reading the floor from the '
        'terminal\'s local server-confirmed floor',
        () async {
          PackageInfo.setMockInitialValues(
            appName: 'OmniFood POS',
            packageName: 'com.omnifood.pos',
            version: '2.3.4',
            buildNumber: '11',
            buildSignature: '',
          );

          final database = await $FloorAppDatabase
              .inMemoryDatabaseBuilder()
              .build();

          try {
            await database.ohacDeliveryDao.insertTerminalState(
              OhacTerminalStateEntity(
                tenantId: 'tenant-1',
                terminalId: 'dev-1',
                state: 'ACTIVE',
                // Deliberately different from serverFloorSequence below: the
                // active sequence runs ahead of the acknowledged floor while
                // a candidate is unacknowledged, so the assertion on
                // `ohacFloorSequence` fails if the builder ever reads
                // `active_sequence` instead of `server_floor_sequence`.
                activeSequence: 9,
                activeDigest: 'sha256:${'c' * 64}',
                candidateSequence: 0,
                candidateDigest: '',
                serverFloorSequence: 5,
                serverFloorDigest: 'sha256:${'c' * 64}',
                negotiatedPosBuild: '',
                negotiatedBackendBuild: '',
                negotiatedPolicySchema: '',
                negotiatedAssertionSchema: '',
                integrityClassification: '',
                localAuthorizationSequence: 0,
                revision: 1,
                updatedAt: '2026-01-01T00:00:00.000Z',
              ),
            );

            Map<String, dynamic> captured = {};
            final testDio = Dio();
            testDio.interceptors.add(
              InterceptorsWrapper(
                onRequest: (options, handler) {
                  if (options.path == '/v1/sync/inbound/deltas') {
                    captured = Map<String, dynamic>.from(
                      options.queryParameters,
                    );
                    handler.resolve(
                      Response<dynamic>(
                        statusCode: 200,
                        requestOptions: options,
                        data: {
                          'status': 'success',
                          'serverTime': '2026-08-26T18:30:00.000Z',
                          'currentVersion': 1787750000000,
                          'deltas': {
                            'products': [],
                            'catalogValues': [],
                            'insumos': [],
                            'recipes': [],
                            'users': [],
                          },
                        },
                      ),
                    );
                    return;
                  }
                  handler.resolve(
                    Response<dynamic>(
                      statusCode: 200,
                      requestOptions: options,
                      data: {'ok': true},
                    ),
                  );
                },
              ),
            );

            final syncServiceWithDb = SyncService(
              mockAuditRepository,
              mockSalesRepository,
              mockInventoryRepository,
              testDio,
              database: database,
            );

            await syncServiceWithDb.pullInboundDeltas();

            // The composed pubspec `version` string: PackageInfo.version
            // plus the `+` build suffix (version '2.3.4', build '11'),
            // matching the exact-equality cohort gate.
            expect(captured['ohacPosBuild'], '2.3.4+11');
            expect(captured['ohacPolicySchemas'], staffPolicyEpochV1Schema);
            expect(captured['ohacAssertionSchemas'], minimumAssertionSchema);
            // The server-confirmed floor, NOT the active sequence: the
            // active sequence legitimately runs ahead of what the server
            // has acknowledged while a candidate is unacknowledged, and
            // every such pull would be answered RECOVERY_REQUIRED. The
            // seeded active (9) and floor (5) differ on purpose, so this
            // assertion fails if the wrong column is ever read.
            expect(captured['ohacFloorSequence'], '5');
          } finally {
            await database.close();
          }
        },
      );

      test(
        'sends a present-but-empty build verbatim with all four '
        'parameters (decision 30: blank build answers UPGRADE_REQUIRED, '
        'absent build is a legacy client)',
        () async {
          // The version read SUCCEEDS here and the composed value is the
          // empty string (empty version, blank build number). The contract
          // under test is that the POS must not collapse a present-but-blank
          // value into an omitted parameter: the backend answers an absent
          // build as a legacy client ('not-participating') but a present-
          // blank one with UPGRADE_REQUIRED. Omission is reserved for a
          // version read that throws — the legacy-client leg tested above.
          // Whether PackageInfo.version can actually be blank at runtime is
          // unverified; this pins the distinction, not a measured state.
          PackageInfo.setMockInitialValues(
            appName: 'OmniFood POS',
            packageName: 'com.omnifood.pos',
            version: '',
            buildNumber: '',
            buildSignature: '',
          );

          final database = await $FloorAppDatabase
              .inMemoryDatabaseBuilder()
              .build();

          try {
            Map<String, dynamic> captured = {};
            final testDio = Dio();
            testDio.interceptors.add(
              InterceptorsWrapper(
                onRequest: (options, handler) {
                  if (options.path == '/v1/sync/inbound/deltas') {
                    captured = Map<String, dynamic>.from(
                      options.queryParameters,
                    );
                    handler.resolve(
                      Response<dynamic>(
                        statusCode: 200,
                        requestOptions: options,
                        data: {
                          'status': 'success',
                          'serverTime': '2026-08-26T18:30:00.000Z',
                          'currentVersion': 1787750000000,
                          'deltas': {
                            'products': [],
                            'catalogValues': [],
                            'insumos': [],
                            'recipes': [],
                            'users': [],
                          },
                        },
                      ),
                    );
                    return;
                  }
                  handler.resolve(
                    Response<dynamic>(
                      statusCode: 200,
                      requestOptions: options,
                      data: {'ok': true},
                    ),
                  );
                },
              ),
            );

            final syncServiceWithDb = SyncService(
              mockAuditRepository,
              mockSalesRepository,
              mockInventoryRepository,
              testDio,
              database: database,
            );

            await syncServiceWithDb.pullInboundDeltas();

            // Present AND blank: a successful read that yields '' is still
            // sent with all four parameters, so the backend answers
            // UPGRADE_REQUIRED rather than legacy silence.
            expect(captured['ohacPosBuild'], '');
            expect(captured.containsKey('ohacPosBuild'), isTrue);
            expect(captured.containsKey('ohacPolicySchemas'), isTrue);
            expect(captured.containsKey('ohacAssertionSchemas'), isTrue);
            expect(captured.containsKey('ohacFloorSequence'), isTrue);
          } finally {
            await database.close();
          }
        },
      );

      test(
        'creates the sentinel terminal state when none exists, and sends the '
        'pre-epoch floor',
        () async {
          PackageInfo.setMockInitialValues(
            appName: 'OmniFood POS',
            packageName: 'com.omnifood.pos',
            version: '2.3.4',
            buildNumber: '11',
            buildSignature: '',
          );

          final database = await $FloorAppDatabase
              .inMemoryDatabaseBuilder()
              .build();

          try {
            Map<String, dynamic> captured = {};
            final testDio = Dio();
            testDio.interceptors.add(
              InterceptorsWrapper(
                onRequest: (options, handler) {
                  if (options.path == '/v1/sync/inbound/deltas') {
                    captured = Map<String, dynamic>.from(
                      options.queryParameters,
                    );
                    handler.resolve(
                      Response<dynamic>(
                        statusCode: 200,
                        requestOptions: options,
                        data: {
                          'status': 'success',
                          'serverTime': '2026-08-26T18:30:00.000Z',
                          'currentVersion': 1787750000000,
                          'deltas': {
                            'products': [],
                            'catalogValues': [],
                            'insumos': [],
                            'recipes': [],
                            'users': [],
                          },
                        },
                      ),
                    );
                    return;
                  }
                  handler.resolve(
                    Response<dynamic>(
                      statusCode: 200,
                      requestOptions: options,
                      data: {'ok': true},
                    ),
                  );
                },
              ),
            );

            final syncServiceWithDb = SyncService(
              mockAuditRepository,
              mockSalesRepository,
              mockInventoryRepository,
              testDio,
              database: database,
            );

            await syncServiceWithDb.pullInboundDeltas();

            expect(captured['ohacFloorSequence'], '0');

            final state = await database.ohacDeliveryDao
                .findTerminalState('tenant-1', 'dev-1');
            expect(state, isNotNull);
            expect(state!.state, 'ACTIVE');
            expect(state.serverFloorSequence, 0);
            expect(state.serverFloorDigest, 'GENESIS');
            expect(state.revision, 0);
          } finally {
            await database.close();
          }
        },
      );
    });

    group('OHAC pull epoch consumption (B2c-3b, design §4.2/§5/§9)', () {
      const ohacTenant = '11111111-1111-4111-8111-111111111111';
      const ohacPosBuild = '2.3.4+11';
      const userA = '33333333-3333-4333-8333-333333333333';
      const userB = '44444444-4444-4444-8444-444444444444';
      final digestFive = 'sha256:${'d' * 64}';
      final digestSix = 'sha256:${'e' * 64}';

      Map<String, dynamic> epochEntry(String userId, List<String> permissions) =>
          <String, dynamic>{
            'userId': userId,
            'status': 'ACTIVE',
            'role': 'MANAGER',
            'permissions': permissions,
            'pinVerifier': <String, dynamic>{
              'algorithm': 'bcrypt',
              'formatVersion': '2b',
              'encoded': r'$2b$10$abcdefghijklmnopqrstuv',
            },
            'attemptResetGeneration': '0',
          };

      /// A signed `ohac.staff-policy-epoch.v1` targeting THIS terminal's
      /// identity, tenant and negotiated build, so only the consumption
      /// logic under test can reject it.
      Map<String, dynamic> signedEpochJson([
        Map<String, dynamic> overrides = const {},
      ]) =>
          jsonDecode(utf8.decode(signBody(<String, dynamic>{
            'schema': staffPolicyEpochV1Schema,
            'tenantId': ohacTenant,
            'targetTerminalId': 'dev-1',
            'sequence': '1',
            'previousSequence': '0',
            'previousDigest': genesisDigest,
            'publisherBackendBuild': 'backend-build-1',
            'targetPosBuild': ohacPosBuild,
            'minimumAssertionSchema': 'ohac.assertion.v1',
            'policyEntries': <Map<String, dynamic>>[
              epochEntry(userA, <String>['inventory:adjust', 'sales:void_invoice']),
              epochEntry(userB, <String>['sales:void_invoice']),
            ],
            ...overrides,
          }))) as Map<String, dynamic>;

      Map<String, dynamic> deliverEnvelope(Map<String, dynamic> epochJson) => {
            'status': 'DELIVER',
            'epoch': epochJson,
            // Sibling duplicates of the epoch's own values (backend
            // `inbound-sync.service.ts` rendering).
            'sequence': epochJson['sequence'],
            'digest': epochJson['digest'],
          };

      Map<String, dynamic> deltasResponse({
        Map<String, dynamic>? humanAuthorization,
        int currentVersion = 1787750000000,
      }) =>
          {
            'status': 'success',
            'serverTime': '2026-08-26T18:30:00.000Z',
            'currentVersion': currentVersion,
            'deltas': {
              'products': [],
              'catalogValues': [],
              'insumos': [],
              'recipes': [],
              'users': [],
            },
            // ignore: use_null_aware_elements
            if (humanAuthorization != null) 'humanAuthorization': humanAuthorization,
          };

      Future<AppDatabase> buildDb() => $FloorAppDatabase.inMemoryDatabaseBuilder().build();

      Future<void> seedOhacTenant(AppDatabase database) =>
          database.localConfigDao.saveConfig(
            LocalConfigEntity(key: 'tenant_id', value: ohacTenant),
          );

      Future<void> seedTerminalState(
        AppDatabase database, {
        String state = 'ACTIVE',
        int activeSequence = 0,
        String activeDigest = genesisDigest,
        int candidateSequence = 0,
        String candidateDigest = '',
        int revision = 1,
      }) =>
          database.ohacDeliveryDao.insertTerminalState(
            OhacTerminalStateEntity(
              tenantId: ohacTenant,
              terminalId: 'dev-1',
              state: state,
              activeSequence: activeSequence,
              activeDigest: activeDigest,
              candidateSequence: candidateSequence,
              candidateDigest: candidateDigest,
              serverFloorSequence: 0,
              serverFloorDigest: genesisDigest,
              negotiatedPosBuild: '',
              negotiatedBackendBuild: '',
              negotiatedPolicySchema: '',
              negotiatedAssertionSchema: '',
              integrityClassification: '',
              localAuthorizationSequence: 0,
              revision: revision,
              updatedAt: '2026-01-01T00:00:00.000Z',
            ),
          );

      SyncService serviceWithDb(AppDatabase database) => SyncService(
            mockAuditRepository,
            mockSalesRepository,
            mockInventoryRepository,
            dio,
            database: database,
          );

      test(
        'DELIVER accepted: epoch and entry rows persist with the canonical '
        'payload and the negotiated facts, state flips to ACK_SUBMITTING '
        'and the ack is sent (deferred on a non-201)',
        () async {
          PackageInfo.setMockInitialValues(
            appName: 'OmniFood POS',
            packageName: 'com.omnifood.pos',
            version: '2.3.4',
            buildNumber: '11',
            buildSignature: '',
          );
          final epochJson = signedEpochJson();
          final database = await buildDb();

          try {
            await seedOhacTenant(database);
            capturedGets['/v1/sync/inbound/deltas'] = deltasResponse(
              humanAuthorization: deliverEnvelope(epochJson),
              currentVersion: 1787750000001,
            );

            final result = await serviceWithDb(database).pullInboundDeltas();
            expect(result, isNotNull);

            final epochRow = await database.ohacDeliveryDao
                .findEpoch(ohacTenant, 'dev-1', 1);
            expect(epochRow, isNotNull);
            expect(epochRow!.digest, epochJson['digest']);

            // Payload provenance: the stored payload is the CANONICAL
            // envelope — re-canonicalizing it is byte-identical and its
            // digest verifies.
            final payloadBytes = Uint8List.fromList(
              utf8.encode(epochRow.payload),
            );
            final recanonicalized = canonicalizeOhac(payloadBytes);
            expect(recanonicalized, isA<OhacSuccess<Uint8List>>());
            expect(
              (recanonicalized as OhacSuccess<Uint8List>).value,
              payloadBytes,
            );
            final payloadMap =
                jsonDecode(epochRow.payload) as Map<String, dynamic>;
            expect(verifyBodyDigest(payloadMap), isA<OhacSuccess<dynamic>>());

            final state = await database.ohacDeliveryDao
                .findTerminalState(ohacTenant, 'dev-1');
            expect(state, isNotNull);
            // Unit B2d (§5 steps 3-4): the accept path immediately flips to
            // ACK_SUBMITTING (transaction S) and POSTs the acknowledgement.
            // The default interceptor answers the ack with a generic 200,
            // which is indeterminate — so the terminal stays in
            // ACK_SUBMITTING for the next pull's retry. The end-to-end
            // 201 confirm path is pinned in the B2d group below.
            expect(state!.state, 'ACK_SUBMITTING');
            expect(state.candidateSequence, 1);
            expect(state.candidateDigest, epochJson['digest']);
            expect(state.activeSequence, 0);
            // The four negotiated facts: the POS's own build (the same
            // string negotiation sent), the epoch's backend build and the
            // two schemas.
            expect(state.negotiatedPosBuild, ohacPosBuild);
            expect(state.negotiatedBackendBuild, 'backend-build-1');
            expect(state.negotiatedPolicySchema, staffPolicyEpochV1Schema);
            expect(state.negotiatedAssertionSchema, 'ohac.assertion.v1');
            // R bumps to 1, S to 2; the deferred ack writes nothing more.
            expect(state.revision, 2);
            expect(state.ackReceiptId, isNull);

            final entries = await database.ohacDeliveryDao
                .findEntries(ohacTenant, 'dev-1', 1);
            expect(entries.map((entry) => entry.userId).toList(), [userA, userB]);
            expect(
              entries[0].permissions,
              jsonEncode(<String>['inventory:adjust', 'sales:void_invoice']),
            );
            expect(entries[0].verifierAlgorithm, 'bcrypt');
            expect(entries[0].verifierFormatVersion, '2b');
            expect(entries[0].verifierEncoded, r'$2b$10$abcdefghijklmnopqrstuv');
          } finally {
            await database.close();
          }
        },
      );

      test(
        'sentinel translation does NOT fire for a corrupt half-sentinel '
        "head (0, <digest>) — the epoch is refused, fail closed",
        () async {
          PackageInfo.setMockInitialValues(
            appName: 'OmniFood POS',
            packageName: 'com.omnifood.pos',
            version: '2.3.4',
            buildNumber: '11',
            buildSignature: '',
          );
          final epochJson = signedEpochJson();
          final corruptHeadDigest = 'sha256:${'f' * 64}';
          final database = await buildDb();

          try {
            await seedOhacTenant(database);
            // (0, <digest>) is NOT the documented (0, '') sentinel: the
            // translation must not rewrite this head to GENESIS, so the
            // epoch's previousDigest GENESIS fails the chain check against
            // this head and the delivery is refused.
            await seedTerminalState(
              database,
              state: 'ACTIVE',
              activeSequence: 0,
              activeDigest: corruptHeadDigest,
              revision: 1,
            );
            capturedGets['/v1/sync/inbound/deltas'] = deltasResponse(
              humanAuthorization: deliverEnvelope(epochJson),
            );

            final result = await serviceWithDb(database).pullInboundDeltas();
            expect(result, isNotNull);

            expect(
              await database.ohacDeliveryDao.findEpoch(ohacTenant, 'dev-1', 1),
              isNull,
            );
            final state = await database.ohacDeliveryDao
                .findTerminalState(ohacTenant, 'dev-1');
            expect(state!.state, 'ACTIVE');
            expect(state.candidateSequence, 0);
            expect(state.revision, 1);
          } finally {
            await database.close();
          }
        },
      );

      test(
        'sentinel translation does NOT fire for a half-sentinel head '
        "(1, '') — the empty head itself is refused, fail closed",
        () async {
          PackageInfo.setMockInitialValues(
            appName: 'OmniFood POS',
            packageName: 'com.omnifood.pos',
            version: '2.3.4',
            buildNumber: '11',
            buildSignature: '',
          );
          // Epoch 2 chains off sequence 1 with a real digest; the persisted
          // head (1, '') is not the (0, '') sentinel, so the translation
          // must not fire, and the empty acceptedDigest is neither GENESIS
          // nor a digest: the policy layer refuses it before any chain
          // comparison.
          final epochJson = signedEpochJson(<String, dynamic>{
            'sequence': '2',
            'previousSequence': '1',
            'previousDigest': 'sha256:${'c' * 64}',
          });
          final database = await buildDb();

          try {
            await seedOhacTenant(database);
            await seedTerminalState(
              database,
              state: 'ACTIVE',
              activeSequence: 1,
              activeDigest: '',
              revision: 1,
            );
            capturedGets['/v1/sync/inbound/deltas'] = deltasResponse(
              humanAuthorization: deliverEnvelope(epochJson),
            );

            final result = await serviceWithDb(database).pullInboundDeltas();
            expect(result, isNotNull);

            expect(
              await database.ohacDeliveryDao.findEpoch(ohacTenant, 'dev-1', 2),
              isNull,
            );
            final state = await database.ohacDeliveryDao
                .findTerminalState(ohacTenant, 'dev-1');
            expect(state!.state, 'ACTIVE');
            expect(state.candidateSequence, 0);
            expect(state.revision, 1);
          } finally {
            await database.close();
          }
        },
      );

      test(
        'DELIVER with a sibling sequence/digest that differs from the '
        'epoch pair: fail closed, no persistence',
        () async {
          PackageInfo.setMockInitialValues(
            appName: 'OmniFood POS',
            packageName: 'com.omnifood.pos',
            version: '2.3.4',
            buildNumber: '11',
            buildSignature: '',
          );
          final epochJson = signedEpochJson();
          final database = await buildDb();

          try {
            await seedOhacTenant(database);
            final envelope = deliverEnvelope(epochJson);
            // Tamper the sibling rendering, not the epoch itself: the
            // sibling pair no longer duplicates the epoch's own values.
            envelope['sequence'] = '999';
            capturedGets['/v1/sync/inbound/deltas'] =
                deltasResponse(humanAuthorization: envelope);

            final result = await serviceWithDb(database).pullInboundDeltas();
            expect(result, isNotNull);

            expect(
              await database.ohacDeliveryDao.findEpoch(ohacTenant, 'dev-1', 1),
              isNull,
            );
            final state = await database.ohacDeliveryDao
                .findTerminalState(ohacTenant, 'dev-1');
            expect(state!.state, 'ACTIVE');
            expect(state.revision, 0);
          } finally {
            await database.close();
          }
        },
      );

      test(
        'DELIVER whose epoch body was tampered after signing (inner digest '
        'mismatch): fail closed, no persistence',
        () async {
          PackageInfo.setMockInitialValues(
            appName: 'OmniFood POS',
            packageName: 'com.omnifood.pos',
            version: '2.3.4',
            buildNumber: '11',
            buildSignature: '',
          );
          final epochJson = signedEpochJson();
          // Mutate one field without re-signing: the transmitted digest no
          // longer covers the body, and the sibling pair still duplicates
          // the epoch's own (stale) values, so only the inner digest check
          // can catch this.
          epochJson['publisherBackendBuild'] = 'backend-build-TAMPERED';
          final database = await buildDb();

          try {
            await seedOhacTenant(database);
            capturedGets['/v1/sync/inbound/deltas'] = deltasResponse(
              humanAuthorization: deliverEnvelope(epochJson),
            );

            final result = await serviceWithDb(database).pullInboundDeltas();
            expect(result, isNotNull);

            expect(
              await database.ohacDeliveryDao.findEpoch(ohacTenant, 'dev-1', 1),
              isNull,
            );
            final state = await database.ohacDeliveryDao
                .findTerminalState(ohacTenant, 'dev-1');
            expect(state!.state, 'ACTIVE');
            expect(state.revision, 0);
          } finally {
            await database.close();
          }
        },
      );

      test(
        'absent humanAuthorization member: nothing persisted, pull '
        'succeeds (absence is never treated as DISABLED)',
        () async {
          PackageInfo.setMockInitialValues(
            appName: 'OmniFood POS',
            packageName: 'com.omnifood.pos',
            version: '2.3.4',
            buildNumber: '11',
            buildSignature: '',
          );
          final database = await buildDb();

          try {
            await seedOhacTenant(database);
            capturedGets['/v1/sync/inbound/deltas'] =
                deltasResponse(); // member omitted entirely

            final result = await serviceWithDb(database).pullInboundDeltas();
            expect(result, isNotNull);

            expect(
              await database.ohacDeliveryDao.findEpoch(ohacTenant, 'dev-1', 1),
              isNull,
            );
            final state = await database.ohacDeliveryDao
                .findTerminalState(ohacTenant, 'dev-1');
            expect(state!.state, 'ACTIVE');
            expect(state.revision, 0);
          } finally {
            await database.close();
          }
        },
      );

      test(
        'DISABLED and UPGRADE_REQUIRED: no persistence, pull succeeds; '
        'RECOVERY_REQUIRED fails closed (B2d, §5 step 5)',
        () async {
          PackageInfo.setMockInitialValues(
            appName: 'OmniFood POS',
            packageName: 'com.omnifood.pos',
            version: '2.3.4',
            buildNumber: '11',
            buildSignature: '',
          );

          for (final status in const [
            'DISABLED',
            'UPGRADE_REQUIRED',
          ]) {
            final database = await buildDb();
            try {
              await seedOhacTenant(database);
              capturedGets['/v1/sync/inbound/deltas'] = deltasResponse(
                humanAuthorization: {'status': status},
              );

              final result =
                  await serviceWithDb(database).pullInboundDeltas();
              expect(result, isNotNull, reason: status);

              expect(
                await database.ohacDeliveryDao
                    .findEpoch(ohacTenant, 'dev-1', 1),
                isNull,
                reason: status,
              );
              final state = await database.ohacDeliveryDao
                  .findTerminalState(ohacTenant, 'dev-1');
              expect(state!.state, 'ACTIVE', reason: status);
              expect(state.revision, 0, reason: status);
            } finally {
              await database.close();
            }
          }
        },
      );

      test(
        'RECOVERY_REQUIRED marks integrity loss (B2d): the reported floor '
        'is ahead of the server, so the terminal fails closed',
        () async {
          PackageInfo.setMockInitialValues(
            appName: 'OmniFood POS',
            packageName: 'com.omnifood.pos',
            version: '2.3.4',
            buildNumber: '11',
            buildSignature: '',
          );
          final database = await buildDb();
          try {
            await seedOhacTenant(database);
            capturedGets['/v1/sync/inbound/deltas'] = deltasResponse(
              humanAuthorization: {'status': 'RECOVERY_REQUIRED'},
            );

            final result = await serviceWithDb(database).pullInboundDeltas();
            expect(result, isNotNull);

            expect(
              await database.ohacDeliveryDao.findEpoch(ohacTenant, 'dev-1', 1),
              isNull,
            );
            final state = await database.ohacDeliveryDao
                .findTerminalState(ohacTenant, 'dev-1');
            expect(state!.state, 'INTEGRITY_LOSS');
            expect(state.integrityClassification, 'ACK_INCONSISTENT');
            expect(state.revision, 1);
          } finally {
            await database.close();
          }
        },
      );

      test(
        'duplicate delivery of the held candidate pair: no-op, no error, '
        'state untouched across repeated identical deliveries',
        () async {
          // Branch observability, stated honestly. The Duplicate branch is
          // NOT row-level distinguishable from its mis-routes:
          //
          // - receiveCandidateEpoch (ohac_delivery_dao.dart) throws before
          //   any write unless `state == ACTIVE` AND
          //   `epoch.sequence == activeSequence + 1`. Every Duplicate
          //   decision means the epoch equals the active pair or the
          //   candidate pair: an active-pair match never reaches the
          //   decision (validateEpochAcceptance rejects sequence <= accepted
          //   first), and a candidate-pair match implies a pending candidate
          //   whose terminal is in RECEIVE_PENDING — so R's ACTIVE guard
          //   fires before any row changes. There is no row delta to
          //   observe.
          // - An Accept mis-route in this same scenario also dies inside R's
          //   ACTIVE guard, swallowed by the consumption containment — also
          //   leaving no row. The only observable difference between the
          //   branches is the developer.log output, and dart:developer log
          //   has no in-process capture API: this suite's log-capture
          //   convention (ZoneSpecification(print:), see
          //   fiscal_projection_repair_service_test.dart) captures
          //   debugPrint/print only, while SyncService logs via
          //   developer.log. Capturing it would require changing the
          //   production logging mechanism — accepted limitation, not
          //   silently dropped.
          //
          // What IS pinned below: the IntegrityLoss mis-route flips the
          // state (caught by the state assertions), and no-op-ness holds
          // across REPEATED identical deliveries with the state byte-
          // identical, revision frozen, and no local events appended.
          PackageInfo.setMockInitialValues(
            appName: 'OmniFood POS',
            packageName: 'com.omnifood.pos',
            version: '2.3.4',
            buildNumber: '11',
            buildSignature: '',
          );
          // The terminal already holds epoch 6 as its candidate pair: the
          // SAME signed envelope the backend redelivers.
          final epochJson = signedEpochJson(<String, dynamic>{
            'sequence': '6',
            'previousSequence': '5',
            'previousDigest': digestFive,
          });
          final heldCandidateDigest = epochJson['digest'] as String;
          final database = await buildDb();

          try {
            await seedOhacTenant(database);
            await seedTerminalState(
              database,
              state: 'RECEIVE_PENDING',
              activeSequence: 5,
              activeDigest: digestFive,
              candidateSequence: 6,
              candidateDigest: heldCandidateDigest,
              revision: 1,
            );
            capturedGets['/v1/sync/inbound/deltas'] = deltasResponse(
              humanAuthorization: deliverEnvelope(epochJson),
            );

            final result = await serviceWithDb(database).pullInboundDeltas();
            expect(result, isNotNull);

            // No-op: no epoch row written, candidate pair and revision
            // exactly as seeded.
            expect(
              await database.ohacDeliveryDao.findEpoch(ohacTenant, 'dev-1', 6),
              isNull,
            );
            final stateAfterFirstPull = await database.ohacDeliveryDao
                .findTerminalState(ohacTenant, 'dev-1');
            expect(stateAfterFirstPull!.state, 'RECEIVE_PENDING');
            expect(stateAfterFirstPull.candidateSequence, 6);
            expect(
              stateAfterFirstPull.candidateDigest,
              heldCandidateDigest,
            );
            expect(stateAfterFirstPull.revision, 1);

            // Idempotence over repetition: the SAME envelope delivered again
            // must converge on the identical state, with the local event log
            // untouched and the newest epoch row still the active one.
            final resultAgain =
                await serviceWithDb(database).pullInboundDeltas();
            expect(resultAgain, isNotNull);

            expect(
              await database.ohacDeliveryDao.findEpoch(ohacTenant, 'dev-1', 6),
              isNull,
            );
            final newest = await database.ohacDeliveryDao.findNewestEpoch(
              ohacTenant,
              'dev-1',
            );
            expect(newest, isNull); // no epoch rows exist at all
            final stateAfterSecondPull = await database.ohacDeliveryDao
                .findTerminalState(ohacTenant, 'dev-1');
            expect(
              stateAfterSecondPull!.revision,
              stateAfterFirstPull.revision,
            );
            expect(stateAfterSecondPull.state, 'RECEIVE_PENDING');
            expect(stateAfterSecondPull.candidateSequence, 6);
            expect(
              stateAfterSecondPull.candidateDigest,
              heldCandidateDigest,
            );
            expect(
              await database.ohacDeliveryDao.findEventsForTerminal(
                ohacTenant,
                'dev-1',
              ),
              isEmpty,
            );
          } finally {
            await database.close();
          }
        },
      );

      test(
        'integrity-loss decision (same candidate sequence, different '
        'digest): markIntegrityLoss applied with the decision classification',
        () async {
          PackageInfo.setMockInitialValues(
            appName: 'OmniFood POS',
            packageName: 'com.omnifood.pos',
            version: '2.3.4',
            buildNumber: '11',
            buildSignature: '',
          );
          // Epoch 6 re-signed with different content: same candidate
          // sequence as the held pair, different digest — the §9
          // ACK_INCONSISTENT conflict.
          final epochJson = signedEpochJson(<String, dynamic>{
            'sequence': '6',
            'previousSequence': '5',
            'previousDigest': digestFive,
            'publisherBackendBuild': 'backend-build-2',
          });
          expect(epochJson['digest'], isNot(digestSix));
          final database = await buildDb();

          try {
            await seedOhacTenant(database);
            await seedTerminalState(
              database,
              state: 'RECEIVE_PENDING',
              activeSequence: 5,
              activeDigest: digestFive,
              candidateSequence: 6,
              candidateDigest: digestSix,
              revision: 1,
            );
            capturedGets['/v1/sync/inbound/deltas'] = deltasResponse(
              humanAuthorization: deliverEnvelope(epochJson),
            );

            final result = await serviceWithDb(database).pullInboundDeltas();
            expect(result, isNotNull);

            // The conflicting epoch is never persisted.
            expect(
              await database.ohacDeliveryDao.findEpoch(ohacTenant, 'dev-1', 6),
              isNull,
            );
            final state = await database.ohacDeliveryDao
                .findTerminalState(ohacTenant, 'dev-1');
            expect(state!.state, 'INTEGRITY_LOSS');
            expect(state.integrityClassification, 'ACK_INCONSISTENT');
          } finally {
            await database.close();
          }
        },
      );

      test(
        'R failure (state not ACTIVE): pull still completes and the '
        'watermark still advances (containment)',
        () async {
          PackageInfo.setMockInitialValues(
            appName: 'OmniFood POS',
            packageName: 'com.omnifood.pos',
            version: '2.3.4',
            buildNumber: '11',
            buildSignature: '',
          );
          final epochJson = signedEpochJson();
          final database = await buildDb();

          try {
            await seedOhacTenant(database);
            // RECEIVE_PENDING with genesis sentinels: the epoch still passes
            // acceptance and the receive decision (sequence 1 == active 0 +
            // 1), so the ONLY thing that can refuse it is transaction R's
            // own ACTIVE precondition — exactly the containment under test.
            await seedTerminalState(
              database,
              state: 'RECEIVE_PENDING',
              activeSequence: 0,
              activeDigest: genesisDigest,
              candidateSequence: 0,
              candidateDigest: '',
              revision: 1,
            );
            capturedGets['/v1/sync/inbound/deltas'] = deltasResponse(
              humanAuthorization: deliverEnvelope(epochJson),
              currentVersion: 1787759999999,
            );

            final result = await serviceWithDb(database).pullInboundDeltas();
            expect(result, isNotNull);

            // The failed receive left nothing behind...
            expect(
              await database.ohacDeliveryDao.findEpoch(ohacTenant, 'dev-1', 1),
              isNull,
            );
            final state = await database.ohacDeliveryDao
                .findTerminalState(ohacTenant, 'dev-1');
            expect(state!.state, 'RECEIVE_PENDING');
            expect(state.revision, 1);
            // ...and the pull's watermark still advanced.
            final watermark = await database.localConfigDao
                .getConfigByKey('last_inbound_sync_version');
            expect(watermark!.value, '1787759999999');
          } finally {
            await database.close();
          }
        },
      );
    });

    group(
        'OHAC drain-gate deferral (B3, design §5.1 lines 176/180/182, §11.5 '
        'decision 31, review-ledger R1-008)', () {
      const ohacTenant = '11111111-1111-4111-8111-111111111111';
      const ohacPosBuild = '2.3.4+11';
      const userA = '33333333-3333-4333-8333-333333333333';
      const ackPath =
          '/v1/sync/inbound/human-authorization/staff-policy/ack';
      const receiptId = '7e6c1c2a-0f4e-4f7a-9c5a-1b2c3d4e5f60';
      final digestOne = 'sha256:${'c' * 64}';

      Map<String, dynamic> epochEntry(String userId, List<String> permissions) =>
          <String, dynamic>{
            'userId': userId,
            'status': 'ACTIVE',
            'role': 'MANAGER',
            'permissions': permissions,
            'pinVerifier': <String, dynamic>{
              'algorithm': 'bcrypt',
              'formatVersion': '2b',
              'encoded': r'$2b$10$abcdefghijklmnopqrstuv',
            },
            'attemptResetGeneration': '0',
          };

      /// A signed epoch 2 targeting THIS terminal: epoch 1 already governs
      /// (seeded active), so the candidate lands at sequence 2 and a held
      /// assertion at sequence 1 is a real "≤ n-1" blocker.
      Map<String, dynamic> signedEpochJson() =>
          jsonDecode(utf8.decode(signBody(<String, dynamic>{
            'schema': staffPolicyEpochV1Schema,
            'tenantId': ohacTenant,
            'targetTerminalId': 'dev-1',
            'sequence': '2',
            'previousSequence': '1',
            'previousDigest': digestOne,
            'publisherBackendBuild': 'backend-build-1',
            'targetPosBuild': ohacPosBuild,
            'minimumAssertionSchema': 'ohac.assertion.v1',
            'policyEntries': <Map<String, dynamic>>[
              epochEntry(userA, <String>['sales:void_invoice']),
            ],
          }))) as Map<String, dynamic>;

      Map<String, dynamic> deliverEnvelope(Map<String, dynamic> epochJson) => {
            'status': 'DELIVER',
            'epoch': epochJson,
            'sequence': epochJson['sequence'],
            'digest': epochJson['digest'],
          };

      Map<String, dynamic> deltasResponse({
        Map<String, dynamic>? humanAuthorization,
        int currentVersion = 1787750000000,
      }) =>
          {
            'status': 'success',
            'serverTime': '2026-08-26T18:30:00.000Z',
            'currentVersion': currentVersion,
            'deltas': {
              'products': [],
              'catalogValues': [],
              'insumos': [],
              'recipes': [],
              'users': [],
            },
            // ignore: use_null_aware_elements
            if (humanAuthorization != null)
              'humanAuthorization': humanAuthorization,
          };

      /// A 201 receipt exactly as the backend renders it.
      Map<String, dynamic> ackReceipt(String digest) =>
          {
            'status': 'ACCEPTED',
            'receiptId': receiptId,
            'sequence': 2,
            'digest': digest,
            'floorSequence': 2,
          };

      /// Installs an interceptor answering the inbound pull from the captured
      /// GET map and every POST to the ack path with a 201 receipt.
      void installOhacInterceptor({
        required Map<String, Object?> Function() deltas,
        Object? Function(CapturedPost post)? onAck,
      }) {
        dio.interceptors.clear();
        dio.interceptors.add(
          InterceptorsWrapper(
            onRequest: (options, handler) {
              if (options.method.toUpperCase() == 'POST' &&
                  options.path == ackPath) {
                final post =
                    CapturedPost(path: options.path, body: options.data);
                capturedPosts.add(post);
                handler.resolve(
                  Response<dynamic>(
                    data: onAck?.call(post) ?? {'ok': true},
                    statusCode: 201,
                    requestOptions: options,
                  ),
                );
                return;
              }
              if (options.method.toUpperCase() == 'GET' &&
                  options.path == '/v1/sync/inbound/deltas') {
                handler.resolve(
                  Response<dynamic>(
                    data: deltas(),
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
      }

      Future<AppDatabase> buildDb() =>
          $FloorAppDatabase.inMemoryDatabaseBuilder().build();

      Future<void> seedOhacTenant(AppDatabase database) =>
          database.localConfigDao.saveConfig(
            LocalConfigEntity(key: 'tenant_id', value: ohacTenant),
          );

      /// Seeds epoch 1 as the governing active pair, so the delivered epoch 2
      /// is a genuine next candidate.
      Future<void> seedActiveAtEpochOne(AppDatabase database) =>
          database.ohacDeliveryDao.insertTerminalState(
            OhacTerminalStateEntity(
              tenantId: ohacTenant,
              terminalId: 'dev-1',
              state: 'ACTIVE',
              activeSequence: 1,
              activeDigest: digestOne,
              candidateSequence: 0,
              candidateDigest: '',
              serverFloorSequence: 1,
              serverFloorDigest: digestOne,
              negotiatedPosBuild: '',
              negotiatedBackendBuild: '',
              negotiatedPolicySchema: '',
              negotiatedAssertionSchema: '',
              integrityClassification: '',
              localAuthorizationSequence: 0,
              revision: 1,
              updatedAt: '2026-01-01T00:00:00.000Z',
            ),
          );

      Future<OhacTerminalStateEntity?> terminalState(AppDatabase database) =>
          database.ohacDeliveryDao.findTerminalState(ohacTenant, 'dev-1');

      test(
          'accept with a registered blocker defers: state stays '
          'RECEIVE_PENDING, no ack POST, reason column set, deferral event '
          'appended, pull and watermark still complete', () async {
        PackageInfo.setMockInitialValues(
          appName: 'OmniFood POS',
          packageName: 'com.omnifood.pos',
          version: '2.3.4',
          buildNumber: '11',
          buildSignature: '',
        );
        final epochJson = signedEpochJson();
        final registry = OhacOutboxRegistry();
        final outbox = MutableOhacTestOutbox('credit-note-outbox');
        outbox.lowestUnconsumed = 1; // ≤ candidate(2) - 1: a real blocker.
        registry.register(outbox);
        final database = await buildDb();

        try {
          await seedOhacTenant(database);
          await seedActiveAtEpochOne(database);
          installOhacInterceptor(
            deltas: () => deltasResponse(
              humanAuthorization: deliverEnvelope(epochJson),
              currentVersion: 1787750000001,
            ),
          );

          final result = await SyncService(
            mockAuditRepository,
            mockSalesRepository,
            mockInventoryRepository,
            dio,
            database: database,
            ohacOutboxRegistry: registry,
          ).pullInboundDeltas();
          expect(result, isNotNull);

          // The candidate was received (R) but the flip was gated (S
          // deferred).
          final state = await terminalState(database);
          expect(state!.state, 'RECEIVE_PENDING');
          expect(state.candidateSequence, 2);
          expect(state.candidateDigest, epochJson['digest']);
          expect(state.ackDeferralReason, 'OHAC_ACK_DEFERRED_OUTBOX');
          expect(state.ackDeferralCount, 1);

          // No acknowledgement was sent: the server floor cannot advance
          // while the gate holds (§5.1 line 176).
          expect(
            capturedPosts.where((post) => post.path == ackPath),
            isEmpty,
          );

          final events = await database.ohacDeliveryDao
              .findEventsForTerminal(ohacTenant, 'dev-1');
          expect(events, hasLength(1));
          final event = events.single;
          expect(event.eventType, 'OHAC_ACK_DEFERRED_OUTBOX');
          expect(event.sequence, 2);
          expect(
            (jsonDecode(event.payload) as Map<String, dynamic>).keys.toList(),
            [
              'candidateSequence',
              'blockingOutboxIds',
              'retryCount',
              'retryBoundReached',
            ],
            reason: 'payload pinned by key list (repo convention)',
          );
          final payload = jsonDecode(event.payload) as Map<String, dynamic>;
          expect(payload['candidateSequence'], 2);
          expect(payload['blockingOutboxIds'], ['credit-note-outbox']);
          expect(payload['retryCount'], 1);
          expect(payload['retryBoundReached'], isFalse);

          // The pull itself completed and the watermark advanced: the
          // deferral is contained, never a sync failure.
          final watermark = await database.localConfigDao
              .getConfigByKey('last_inbound_sync_version');
          expect(watermark!.value, '1787750000001');
        } finally {
          await database.close();
        }
      });

      test(
          'the deferral retries on the next sync cycle and the count '
          'increments for the same candidate', () async {
        PackageInfo.setMockInitialValues(
          appName: 'OmniFood POS',
          packageName: 'com.omnifood.pos',
          version: '2.3.4',
          buildNumber: '11',
          buildSignature: '',
        );
        final epochJson = signedEpochJson();
        final registry = OhacOutboxRegistry();
        final outbox = MutableOhacTestOutbox('credit-note-outbox');
        outbox.lowestUnconsumed = 1;
        registry.register(outbox);
        final database = await buildDb();

        try {
          await seedOhacTenant(database);
          await seedActiveAtEpochOne(database);
          // The SAME envelope is redelivered on every pull.
          installOhacInterceptor(
            deltas: () => deltasResponse(
              humanAuthorization: deliverEnvelope(epochJson),
            ),
          );
          final service = SyncService(
            mockAuditRepository,
            mockSalesRepository,
            mockInventoryRepository,
            dio,
            database: database,
            ohacOutboxRegistry: registry,
          );

          await service.pullInboundDeltas();
          await service.pullInboundDeltas();
          await service.pullInboundDeltas();

          final state = await terminalState(database);
          expect(state!.state, 'RECEIVE_PENDING');
          expect(state.ackDeferralReason, 'OHAC_ACK_DEFERRED_OUTBOX');
          expect(state.ackDeferralCount, 3,
              reason: 'each subsequent sync cycle retries the gate and '
                  'increments the count for the SAME candidate');
          expect(
            capturedPosts.where((post) => post.path == ackPath),
            isEmpty,
          );

          final events = await database.ohacDeliveryDao
              .findEventsForTerminal(ohacTenant, 'dev-1');
          expect(events, hasLength(3));
        } finally {
          await database.close();
        }
      });

      test(
          'reaching the retry bound marks retryBoundReached=true on the '
          'deferral event (the operator-visible quarantine-review log itself '
          'is developer.log, which has no in-process capture — accepted '
          'limitation, not silently dropped)', () async {
        PackageInfo.setMockInitialValues(
          appName: 'OmniFood POS',
          packageName: 'com.omnifood.pos',
          version: '2.3.4',
          buildNumber: '11',
          buildSignature: '',
        );
        final epochJson = signedEpochJson();
        final registry = OhacOutboxRegistry();
        final outbox = MutableOhacTestOutbox('credit-note-outbox');
        outbox.lowestUnconsumed = 1;
        registry.register(outbox);
        final database = await buildDb();

        try {
          await seedOhacTenant(database);
          await seedActiveAtEpochOne(database);
          installOhacInterceptor(
            deltas: () =>
                deltasResponse(humanAuthorization: deliverEnvelope(epochJson)),
          );
          final service = SyncService(
            mockAuditRepository,
            mockSalesRepository,
            mockInventoryRepository,
            dio,
            database: database,
            ohacOutboxRegistry: registry,
          );

          // Pulls 1..5 drive the count 1..5; the bound is reached on the
          // fifth (OhacOutboxRegistry.ohacAckDeferredRetryBound == 5).
          for (var i = 0; i < 5; i++) {
            await service.pullInboundDeltas();
          }

          final state = await terminalState(database);
          expect(state!.ackDeferralCount, 5);
          final events = await database.ohacDeliveryDao
              .findEventsForTerminal(ohacTenant, 'dev-1');
          expect(events, hasLength(5));
          final lastPayload =
              jsonDecode(events.last.payload) as Map<String, dynamic>;
          expect(lastPayload['retryCount'], 5);
          expect(lastPayload['retryBoundReached'], isTrue);
          final earlierPayload =
              jsonDecode(events.first.payload) as Map<String, dynamic>;
          expect(earlierPayload['retryBoundReached'], isFalse);
        } finally {
          await database.close();
        }
      });

      test(
          'once the outbox drains, the next pull flips, POSTs and confirms: '
          'the reason clears and the candidate promotes', () async {
        PackageInfo.setMockInitialValues(
          appName: 'OmniFood POS',
          packageName: 'com.omnifood.pos',
          version: '2.3.4',
          buildNumber: '11',
          buildSignature: '',
        );
        final epochJson = signedEpochJson();
        final registry = OhacOutboxRegistry();
        final outbox = MutableOhacTestOutbox('credit-note-outbox');
        outbox.lowestUnconsumed = 1;
        registry.register(outbox);
        final database = await buildDb();

        try {
          await seedOhacTenant(database);
          await seedActiveAtEpochOne(database);
          installOhacInterceptor(
            deltas: () =>
                deltasResponse(humanAuthorization: deliverEnvelope(epochJson)),
            onAck: (post) => ackReceipt(epochJson['digest'] as String),
          );
          final service = SyncService(
            mockAuditRepository,
            mockSalesRepository,
            mockInventoryRepository,
            dio,
            database: database,
            ohacOutboxRegistry: registry,
          );

          // First pull: deferred.
          await service.pullInboundDeltas();
          expect((await terminalState(database))!.state, 'RECEIVE_PENDING');
          expect(
            capturedPosts.where((post) => post.path == ackPath),
            isEmpty,
          );

          // The assertion is consumed by the backend: the outbox drains.
          outbox.lowestUnconsumed = null;

          // Next pull: the gate passes, the flip commits, the ack is sent and
          // the 201 receipt promotes the candidate.
          await service.pullInboundDeltas();

          final ackPosts =
              capturedPosts.where((post) => post.path == ackPath).toList();
          expect(ackPosts, hasLength(1),
              reason: 'exactly one acknowledgement, sent only after the drain');

          final state = await terminalState(database);
          expect(state!.state, 'ACTIVE');
          expect(state.activeSequence, 2);
          expect(state.ackDeferralReason, isNull,
              reason: 'the successful flip cleared the deferral reason');
          expect(state.ackDeferralCount, 1,
              reason: 'the count persists as history after the flip');
          expect(state.ackReceiptId, receiptId);
        } finally {
          await database.close();
        }
      });
    });

    test(
      'onInboundSync stream emits events and triggers reactive listeners',
      () async {
        final database = await $FloorAppDatabase
            .inMemoryDatabaseBuilder()
            .build();

        try {
          final syncServiceWithDb = SyncService(
            mockAuditRepository,
            mockSalesRepository,
            mockInventoryRepository,
            dio,
            database: database,
          );

          capturedGets['/v1/sync/inbound/deltas'] = {
            'status': 'success',
            'serverTime': '2026-08-26T19:00:00.000Z',
            'currentVersion': 1787760000000,
            'deltas': {
              'products': [
                {
                  'id': 'prod-event',
                  'name': 'Smoothie Fresa',
                  'uom': 'CUP',
                  'stock': 10.0,
                  'averageCost': 20.0,
                  'sellPrice': 60.0,
                  'isActive': true,
                },
              ],
              'catalogValues': [],
              'insumos': [],
              'recipes': [],
              'users': [],
            },
          };

          InboundSyncResult? emittedEvent;
          final sub = syncServiceWithDb.onInboundSync.listen((event) {
            emittedEvent = event;
          });

          await syncServiceWithDb.pullInboundDeltas();
          await Future<void>.delayed(Duration.zero);

          expect(emittedEvent, isNotNull);
          expect(emittedEvent!.productsCount, 1);
          expect(emittedEvent!.timestamp, '2026-08-26T19:00:00.000Z');

          await sub.cancel();
        } finally {
          await database.close();
        }
      },
    );
  });

  group(
      'OHAC acknowledgement client and reconnect reconciliation (B2d, design '
      '§5 steps 4-5, §9, §10)',
      () {
    const ohacTenant = '11111111-1111-4111-8111-111111111111';
    const ohacPosBuild = '2.3.4+11';
    const userA = '33333333-3333-4333-8333-333333333333';
    const userB = '44444444-4444-4444-8444-444444444444';
    const ackPath = '/v1/sync/inbound/human-authorization/staff-policy/ack';
    const receiptId = '7e6c1c2a-0f4e-4f7a-9c5a-1b2c3d4e5f60';

    Map<String, dynamic> epochEntry(String userId, List<String> permissions) =>
        <String, dynamic>{
          'userId': userId,
          'status': 'ACTIVE',
          'role': 'MANAGER',
          'permissions': permissions,
          'pinVerifier': <String, dynamic>{
            'algorithm': 'bcrypt',
            'formatVersion': '2b',
            'encoded': r'$2b$10$abcdefghijklmnopqrstuv',
          },
          'attemptResetGeneration': '0',
        };

    /// A signed `ohac.staff-policy-epoch.v1` for epoch 1 targeting THIS
    /// terminal's identity, tenant and negotiated build.
    Map<String, dynamic> signedEpochJson() =>
        jsonDecode(utf8.decode(signBody(<String, dynamic>{
          'schema': staffPolicyEpochV1Schema,
          'tenantId': ohacTenant,
          'targetTerminalId': 'dev-1',
          'sequence': '1',
          'previousSequence': '0',
          'previousDigest': genesisDigest,
          'publisherBackendBuild': 'backend-build-1',
          'targetPosBuild': ohacPosBuild,
          'minimumAssertionSchema': 'ohac.assertion.v1',
          'policyEntries': <Map<String, dynamic>>[
            epochEntry(userA, <String>['sales:void_invoice']),
            epochEntry(userB, <String>['inventory:adjust']),
          ],
        }))) as Map<String, dynamic>;

    Map<String, dynamic> deliverEnvelope(Map<String, dynamic> epochJson) => {
          'status': 'DELIVER',
          'epoch': epochJson,
          'sequence': epochJson['sequence'],
          'digest': epochJson['digest'],
        };

    Map<String, dynamic> deltasResponse({
      Map<String, dynamic>? humanAuthorization,
      int currentVersion = 1787750000000,
    }) =>
        {
          'status': 'success',
          'serverTime': '2026-08-26T18:30:00.000Z',
          'currentVersion': currentVersion,
          'deltas': {
            'products': [],
            'catalogValues': [],
            'insumos': [],
            'recipes': [],
            'users': [],
          },
          // ignore: use_null_aware_elements
          if (humanAuthorization != null)
            'humanAuthorization': humanAuthorization,
        };

    /// A 201 receipt exactly as the backend renders it
    /// (`staff-policy-ack.service.ts`): no `serverBuild` field.
    Map<String, dynamic> ackReceipt({
      String? digest,
      Object? sequence = 1,
      Object? floorSequence = 1,
    }) =>
        {
          'status': 'ACCEPTED',
          'receiptId': receiptId,
          'sequence': sequence,
          'digest': digest,
          'floorSequence': floorSequence,
        };

    /// Installs an interceptor that answers the inbound pull from
    /// [deltas] and every POST to the ack path via [onAck], which may
    /// resolve a response or reject with a DioException — the three shapes
    /// the acknowledgement client must distinguish (201, 409, network).
    void installOhacInterceptor({
      required Map<String, dynamic> Function() deltas,
      required Object? Function(CapturedPost post) onAck,
    }) {
      dio.interceptors.clear();
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            if (options.method.toUpperCase() == 'POST' &&
                options.path == ackPath) {
              final post = CapturedPost(path: options.path, body: options.data);
              capturedPosts.add(post);
              final answer = onAck(post);
              if (answer is DioException) {
                handler.reject(answer);
              } else {
                handler.resolve(
                  Response<dynamic>(
                    data: answer,
                    statusCode: 201,
                    requestOptions: options,
                  ),
                );
              }
              return;
            }
            if (options.method.toUpperCase() == 'GET' &&
                options.path == '/v1/sync/inbound/deltas') {
              handler.resolve(
                Response<dynamic>(
                  data: deltas(),
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
    }

    DioException ackRejection(int statusCode, {String? resultCode}) =>
        DioException(
          requestOptions: RequestOptions(path: ackPath),
          response: Response<dynamic>(
            // ignore: use_null_aware_elements
            data: {
              'status': 'REJECTED',
              // ignore: use_null_aware_elements
              if (resultCode != null) 'resultCode': resultCode,
              'sequence': 1,
            },
            statusCode: statusCode,
            requestOptions: RequestOptions(path: ackPath),
          ),
          type: DioExceptionType.badResponse,
        );

    DioException ackNetworkError() => DioException(
          requestOptions: RequestOptions(path: ackPath),
          type: DioExceptionType.connectionError,
          message: 'offline',
        );

    Future<AppDatabase> buildDb() =>
        $FloorAppDatabase.inMemoryDatabaseBuilder().build();

    Future<void> seedOhacTenant(AppDatabase database) =>
        database.localConfigDao.saveConfig(
          LocalConfigEntity(key: 'tenant_id', value: ohacTenant),
        );

    /// Seeds a terminal that already RECEIVED the candidate (post-R state):
    /// `ACK_SUBMITTING` with the candidate pair on record, the negotiated
    /// facts from the epoch, and the old epoch still governing.
    Future<void> seedSubmittingTerminal(
      AppDatabase database, {
      required String digest,
    }) async {
      await database.ohacDeliveryDao.insertTerminalState(
        OhacTerminalStateEntity(
          tenantId: ohacTenant,
          terminalId: 'dev-1',
          state: 'ACK_SUBMITTING',
          activeSequence: 0,
          activeDigest: genesisDigest,
          candidateSequence: 1,
          candidateDigest: digest,
          serverFloorSequence: 0,
          serverFloorDigest: genesisDigest,
          negotiatedPosBuild: ohacPosBuild,
          negotiatedBackendBuild: 'backend-build-1',
          negotiatedPolicySchema: staffPolicyEpochV1Schema,
          negotiatedAssertionSchema: 'ohac.assertion.v1',
          integrityClassification: '',
          localAuthorizationSequence: 0,
          revision: 2,
          updatedAt: '2026-01-01T00:00:00.000Z',
        ),
      );
    }

    Future<OhacTerminalStateEntity?> terminalState(AppDatabase database) =>
        database.ohacDeliveryDao.findTerminalState(ohacTenant, 'dev-1');

    /// The expected request body: the exact eight DTO fields with the
    /// derived idempotency key (the same derivation the implementation must
    /// use — the key pins the claim identity, not a random value).
    Map<String, String> expectedAckBody(Map<String, dynamic> epochJson) => {
          'schema': staffPolicyEpochV1Schema,
          'sequence': epochJson['sequence'].toString(),
          'digest': epochJson['digest'] as String,
          'previousSequence': epochJson['previousSequence'].toString(),
          'previousDigest': epochJson['previousDigest'] as String,
          'posBuild': ohacPosBuild,
          'assertionSchema': 'ohac.assertion.v1',
          'idempotencyKey': deriveOhacAckIdempotencyKey(
            tenantId: ohacTenant,
            terminalId: 'dev-1',
            sequence: int.parse(epochJson['sequence'] as String),
            digest: epochJson['digest'] as String,
          ),
        };

    CapturedPost ackPost(List<CapturedPost> posts) =>
        posts.firstWhere((post) => post.path == ackPath);

    test(
      'accept → submit → POST → confirm end-to-end: the body is the exact '
      'eight fields and the state lands ACTIVE with the full receipt',
      () async {
        PackageInfo.setMockInitialValues(
          appName: 'OmniFood POS',
          packageName: 'com.omnifood.pos',
          version: '2.3.4',
          buildNumber: '11',
          buildSignature: '',
        );
        final epochJson = signedEpochJson();
        final database = await buildDb();

        try {
          await seedOhacTenant(database);
          installOhacInterceptor(
            deltas: () => deltasResponse(
              humanAuthorization: deliverEnvelope(epochJson),
              currentVersion: 1787750000001,
            ),
            onAck: (_) => ackReceipt(digest: epochJson['digest'] as String),
          );

          final service = SyncService(
            mockAuditRepository,
            mockSalesRepository,
            mockInventoryRepository,
            dio,
            database: database,
          );
          final result = await service.pullInboundDeltas();
          expect(result, isNotNull);

          // The request: exactly the eight DTO fields, byte-for-byte on
          // every value, identity nowhere in the body (the server derives
          // tenant/terminal from the device principal).
          final post = ackPost(capturedPosts);
          expect(post.body, expectedAckBody(epochJson));

          final state = await terminalState(database);
          expect(state, isNotNull);
          // §5 step 4: the candidate is promoted and the receipt recorded —
          // the full receipt reads back from one row.
          expect(state!.state, 'ACTIVE');
          expect(state.activeSequence, 1);
          expect(state.activeDigest, epochJson['digest']);
          expect(state.candidateSequence, 0);
          expect(state.candidateDigest, '');
          expect(state.serverFloorSequence, 1);
          expect(state.serverFloorDigest, epochJson['digest']);
          expect(state.ackReceiptId, receiptId);
          // The server build of §5.4 is the negotiated backend build — the
          // 201 response carries no serverBuild field.
          expect(state.negotiatedBackendBuild, 'backend-build-1');

          // One lifecycle fact per confirmed ack.
          final events = await database.ohacDeliveryDao.findEventsForTerminal(
            ohacTenant,
            'dev-1',
          );
          expect(
            events.map((event) => event.eventType),
            contains('OHAC_ACK_CONFIRMED'),
          );
        } finally {
          await database.close();
        }
      },
    );

    test(
      'a 201 whose digest does not cross-check against the claim is an '
      'acknowledgement inconsistency (§9 ACK_INCONSISTENT), not a confirm',
      () async {
        PackageInfo.setMockInitialValues(
          appName: 'OmniFood POS',
          packageName: 'com.omnifood.pos',
          version: '2.3.4',
          buildNumber: '11',
          buildSignature: '',
        );
        final epochJson = signedEpochJson();
        final database = await buildDb();

        try {
          await seedOhacTenant(database);
          installOhacInterceptor(
            deltas: () =>
                deltasResponse(humanAuthorization: deliverEnvelope(epochJson)),
            onAck: (_) =>
                ackReceipt(digest: 'sha256:${'9' * 64}'), // not the claim
          );

          final service = SyncService(
            mockAuditRepository,
            mockSalesRepository,
            mockInventoryRepository,
            dio,
            database: database,
          );
          final result = await service.pullInboundDeltas();
          expect(result, isNotNull);

          final state = await terminalState(database);
          expect(state!.state, 'INTEGRITY_LOSS');
          expect(state.integrityClassification, 'ACK_INCONSISTENT');
          // No confirmation, no receipt, no promotion.
          expect(state.ackReceiptId, isNull);
          expect(state.activeSequence, 0);
        } finally {
          await database.close();
        }
      },
    );

    for (final rejection in const [
      (code: 'UNKNOWN_EPOCH', classification: 'ACK_INCONSISTENT'),
      (code: 'DIGEST_MISMATCH', classification: 'ACK_INCONSISTENT'),
      (code: 'CHAIN_MISMATCH', classification: 'ACK_INCONSISTENT'),
      (code: 'IDEMPOTENCY_CONFLICT', classification: 'ACK_INCONSISTENT'),
      (code: 'SEQUENCE_GAP', classification: 'ACK_INCONSISTENT'),
      (code: 'STALE_SEQUENCE', classification: 'LOCAL_ROLLBACK'),
    ])
    {
      test(
        'a 409 ${rejection.code} rejection fails closed as '
        '${rejection.classification} (§9/§10), never a confirm',
        () async {
          PackageInfo.setMockInitialValues(
            appName: 'OmniFood POS',
            packageName: 'com.omnifood.pos',
            version: '2.3.4',
            buildNumber: '11',
            buildSignature: '',
          );
          final epochJson = signedEpochJson();
          final database = await buildDb();

          try {
            await seedOhacTenant(database);
            installOhacInterceptor(
              deltas: () =>
                  deltasResponse(humanAuthorization: deliverEnvelope(epochJson)),
              onAck: (_) => ackRejection(409, resultCode: rejection.code),
            );

            final service = SyncService(
              mockAuditRepository,
              mockSalesRepository,
              mockInventoryRepository,
              dio,
              database: database,
            );
            final result = await service.pullInboundDeltas();
            expect(result, isNotNull);

            final state = await terminalState(database);
            expect(state!.state, 'INTEGRITY_LOSS');
            expect(state.integrityClassification, rejection.classification);
            expect(state.ackReceiptId, isNull);
          } finally {
            await database.close();
          }
        },
      );
    }

    test(
      'a 409 UNMAPPED result code hits the fail-closed default (U5b): the '
      'terminal records ACK_INCONSISTENT, never a retry, never a confirm',
      () async {
        PackageInfo.setMockInitialValues(
          appName: 'OmniFood POS',
          packageName: 'com.omnifood.pos',
          version: '2.3.4',
          buildNumber: '11',
          buildSignature: '',
        );
        final epochJson = signedEpochJson();
        final database = await buildDb();

        try {
          await seedOhacTenant(database);
          installOhacInterceptor(
            deltas: () =>
                deltasResponse(humanAuthorization: deliverEnvelope(epochJson)),
            onAck: (_) => ackRejection(409, resultCode: 'SOMETHING_ELSE'),
          );

          final service = SyncService(
            mockAuditRepository,
            mockSalesRepository,
            mockInventoryRepository,
            dio,
            database: database,
          );
          final result = await service.pullInboundDeltas();
          expect(result, isNotNull);

          final state = await terminalState(database);
          expect(state!.state, 'INTEGRITY_LOSS',
              reason: 'an unmapped rejection verdict is never indeterminate');
          expect(state.integrityClassification, 'ACK_INCONSISTENT',
              reason: 'the classifier fail-closed default (U5b)');
          expect(state.ackReceiptId, isNull);
        } finally {
          await database.close();
        }
      },
    );

    test(
      'a 409 UNAVAILABLE rejection is indeterminate: the terminal stays in '
      'ACK_SUBMITTING for the next pull',
      () async {
        PackageInfo.setMockInitialValues(
          appName: 'OmniFood POS',
          packageName: 'com.omnifood.pos',
          version: '2.3.4',
          buildNumber: '11',
          buildSignature: '',
        );
        final epochJson = signedEpochJson();
        final database = await buildDb();

        try {
          await seedOhacTenant(database);
          installOhacInterceptor(
            deltas: () =>
                deltasResponse(humanAuthorization: deliverEnvelope(epochJson)),
            onAck: (_) => ackRejection(409, resultCode: 'UNAVAILABLE'),
          );

          final service = SyncService(
            mockAuditRepository,
            mockSalesRepository,
            mockInventoryRepository,
            dio,
            database: database,
          );
          final result = await service.pullInboundDeltas();
          expect(result, isNotNull);

          final state = await terminalState(database);
          expect(state!.state, 'ACK_SUBMITTING');
          expect(state.integrityClassification, '');
          expect(state.candidateSequence, 1);
        } finally {
          await database.close();
        }
      },
    );

    test(
      'a network error on the ack is indeterminate (§10 '
      'OHAC_ACK_RESPONSE_LOST): the pull and watermark survive and the '
      'terminal stays in ACK_SUBMITTING',
      () async {
        PackageInfo.setMockInitialValues(
          appName: 'OmniFood POS',
          packageName: 'com.omnifood.pos',
          version: '2.3.4',
          buildNumber: '11',
          buildSignature: '',
        );
        final epochJson = signedEpochJson();
        final database = await buildDb();

        try {
          await seedOhacTenant(database);
          installOhacInterceptor(
            deltas: () =>
                deltasResponse(humanAuthorization: deliverEnvelope(epochJson)),
            onAck: (_) => ackNetworkError(),
          );

          final service = SyncService(
            mockAuditRepository,
            mockSalesRepository,
            mockInventoryRepository,
            dio,
            database: database,
          );
          final result = await service.pullInboundDeltas();
          // U1's containment guarantee must not regress: the OHAC failure
          // never fails the pull nor blocks the watermark.
          expect(result, isNotNull);
          final watermark = await database.localConfigDao
              .getConfigByKey('last_inbound_sync_version');
          expect(watermark!.value, '1787750000000');

          final state = await terminalState(database);
          expect(state!.state, 'ACK_SUBMITTING');
          expect(state.candidateDigest, epochJson['digest']);
          expect(state.ackReceiptId, isNull);
        } finally {
          await database.close();
        }
      },
    );

    test(
      'a 409 rejection body with non-String keys is contained: the '
      'unparseable code fails closed (§9 ACK_INCONSISTENT) and never '
      'escapes the acknowledgement client',
      () async {
        PackageInfo.setMockInitialValues(
          appName: 'OmniFood POS',
          packageName: 'com.omnifood.pos',
          version: '2.3.4',
          buildNumber: '11',
          buildSignature: '',
        );
        final epochJson = signedEpochJson();
        final database = await buildDb();

        try {
          await seedOhacTenant(database);
          dio.interceptors.clear();
          dio.interceptors.add(
            InterceptorsWrapper(
              onRequest: (options, handler) {
                if (options.method.toUpperCase() == 'POST' &&
                    options.path == ackPath) {
                  capturedPosts.add(
                    CapturedPost(path: options.path, body: options.data),
                  );
                  handler.reject(
                    DioException(
                      requestOptions: RequestOptions(path: ackPath),
                      response: Response<dynamic>(
                        // A non-String key: an unparseable body must be
                        // treated as an unknown code, never a crash.
                        data: <dynamic, dynamic>{1: 'bad'},
                        statusCode: 409,
                        requestOptions: RequestOptions(path: ackPath),
                      ),
                      type: DioExceptionType.badResponse,
                    ),
                  );
                  return;
                }
                if (options.method.toUpperCase() == 'GET' &&
                    options.path == '/v1/sync/inbound/deltas') {
                  handler.resolve(
                    Response<dynamic>(
                      data: deltasResponse(
                        humanAuthorization: deliverEnvelope(epochJson),
                      ),
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

          final service = SyncService(
            mockAuditRepository,
            mockSalesRepository,
            mockInventoryRepository,
            dio,
            database: database,
          );
          final result = await service.pullInboundDeltas();
          expect(result, isNotNull);

          final state = await terminalState(database);
          expect(state!.state, 'INTEGRITY_LOSS');
          expect(state.integrityClassification, 'ACK_INCONSISTENT');
        } finally {
          await database.close();
        }
      },
    );

    test(
      'a 201 receipt with non-String keys is contained: indeterminate, the '
      'terminal stays in ACK_SUBMITTING',
      () async {
        PackageInfo.setMockInitialValues(
          appName: 'OmniFood POS',
          packageName: 'com.omnifood.pos',
          version: '2.3.4',
          buildNumber: '11',
          buildSignature: '',
        );
        final epochJson = signedEpochJson();
        final database = await buildDb();

        try {
          await seedOhacTenant(database);
          dio.interceptors.clear();
          dio.interceptors.add(
            InterceptorsWrapper(
              onRequest: (options, handler) {
                if (options.method.toUpperCase() == 'POST' &&
                    options.path == ackPath) {
                  capturedPosts.add(
                    CapturedPost(path: options.path, body: options.data),
                  );
                  handler.resolve(
                    Response<dynamic>(
                      // A non-String key: an unparseable receipt is
                      // indeterminate, never a confirm and never a crash.
                      data: <dynamic, dynamic>{1: 'bad'},
                      statusCode: 201,
                      requestOptions: options,
                    ),
                  );
                  return;
                }
                if (options.method.toUpperCase() == 'GET' &&
                    options.path == '/v1/sync/inbound/deltas') {
                  handler.resolve(
                    Response<dynamic>(
                      data: deltasResponse(
                        humanAuthorization: deliverEnvelope(epochJson),
                      ),
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

          final service = SyncService(
            mockAuditRepository,
            mockSalesRepository,
            mockInventoryRepository,
            dio,
            database: database,
          );
          final result = await service.pullInboundDeltas();
          expect(result, isNotNull);

          final state = await terminalState(database);
          expect(state!.state, 'ACK_SUBMITTING');
          expect(state.integrityClassification, '');
          expect(state.ackReceiptId, isNull);
        } finally {
          await database.close();
        }
      },
    );

    test(
      'reconnect reconciliation: a pull later retries the PENDING '
      'acknowledgement with the SAME idempotency key and body, then '
      'confirms',
      () async {
        PackageInfo.setMockInitialValues(
          appName: 'OmniFood POS',
          packageName: 'com.omnifood.pos',
          version: '2.3.4',
          buildNumber: '11',
          buildSignature: '',
        );
        final epochJson = signedEpochJson();
        final database = await buildDb();

        try {
          await seedOhacTenant(database);
          final service = SyncService(
            mockAuditRepository,
            mockSalesRepository,
            mockInventoryRepository,
            dio,
            database: database,
          );
          // Pull 1 delivers the epoch; the ack response is lost.
          capturedGets['/v1/sync/inbound/deltas'] = deltasResponse(
            humanAuthorization: deliverEnvelope(epochJson),
          );
          dio.interceptors.clear();
          dio.interceptors.add(
            InterceptorsWrapper(
              onRequest: (options, handler) {
                if (options.method.toUpperCase() == 'POST' &&
                    options.path == ackPath) {
                  capturedPosts.add(
                    CapturedPost(path: options.path, body: options.data),
                  );
                  handler.reject(ackNetworkError());
                  return;
                }
                if (options.method.toUpperCase() == 'GET' &&
                    options.path == '/v1/sync/inbound/deltas') {
                  handler.resolve(
                    Response<dynamic>(
                      data: deltasResponse(
                        humanAuthorization: deliverEnvelope(epochJson),
                      ),
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
          await service.pullInboundDeltas();

          var state = await terminalState(database);
          expect(state!.state, 'ACK_SUBMITTING');

          // Pull 2 carries no epoch (up to date) — but the phase-driven
          // retry must resend the identical acknowledgement.
          dio.interceptors.clear();
          dio.interceptors.add(
            InterceptorsWrapper(
              onRequest: (options, handler) {
                if (options.method.toUpperCase() == 'POST' &&
                    options.path == ackPath) {
                  capturedPosts.add(
                    CapturedPost(path: options.path, body: options.data),
                  );
                  handler.resolve(
                    Response<dynamic>(
                      data: ackReceipt(digest: epochJson['digest'] as String),
                      statusCode: 201,
                      requestOptions: options,
                    ),
                  );
                  return;
                }
                if (options.method.toUpperCase() == 'GET' &&
                    options.path == '/v1/sync/inbound/deltas') {
                  handler.resolve(
                    Response<dynamic>(
                      data: deltasResponse(),
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
          await service.pullInboundDeltas();

          final ackPosts =
              capturedPosts.where((post) => post.path == ackPath).toList();
          expect(ackPosts, hasLength(2));
          // The identical request — same derived key, byte-for-byte body —
          // is what makes the server replay the stored receipt instead of
          // answering IDEMPOTENCY_CONFLICT.
          expect(ackPosts[1].body, ackPosts[0].body);
          expect(ackPosts[1].body, expectedAckBody(epochJson));

          state = await terminalState(database);
          expect(state!.state, 'ACTIVE');
          expect(state.ackReceiptId, receiptId);
          expect(state.serverFloorSequence, 1);
        } finally {
          await database.close();
        }
      },
    );

    test(
      'a retry whose candidate epoch row is gone does not retry: §5 step 5 '
      'marks integrity loss (ROLLBACK_DETECTED / §9 LOCAL_ROLLBACK)',
      () async {
        PackageInfo.setMockInitialValues(
          appName: 'OmniFood POS',
          packageName: 'com.omnifood.pos',
          version: '2.3.4',
          buildNumber: '11',
          buildSignature: '',
        );
        final epochJson = signedEpochJson();
        final database = await buildDb();

        try {
          await seedOhacTenant(database);
          // The state pair survives but the immutable epoch row was lost:
          // the candidate can no longer be proven intact.
          await seedSubmittingTerminal(database, digest: epochJson['digest'] as String);
          installOhacInterceptor(
            deltas: () => deltasResponse(),
            onAck: (_) =>
                ackReceipt(digest: epochJson['digest'] as String),
          );

          final service = SyncService(
            mockAuditRepository,
            mockSalesRepository,
            mockInventoryRepository,
            dio,
            database: database,
          );
          final result = await service.pullInboundDeltas();
          expect(result, isNotNull);

          // No ack POST went out for the unprovable candidate.
          expect(
            capturedPosts.where((post) => post.path == ackPath),
            isEmpty,
          );
          final state = await terminalState(database);
          expect(state!.state, 'INTEGRITY_LOSS');
          expect(state.integrityClassification, 'LOCAL_ROLLBACK');
        } finally {
          await database.close();
        }
      },
    );

    test(
      'RECOVERY_REQUIRED on the pull means the reported floor is ahead of '
      'the server: fail closed (§5 step 5, §9 ACK_INCONSISTENT)',
      () async {
        PackageInfo.setMockInitialValues(
          appName: 'OmniFood POS',
          packageName: 'com.omnifood.pos',
          version: '2.3.4',
          buildNumber: '11',
          buildSignature: '',
        );
        final database = await buildDb();

        try {
          await seedOhacTenant(database);
          installOhacInterceptor(
            deltas: () => deltasResponse(
              humanAuthorization: {'status': 'RECOVERY_REQUIRED'},
            ),
            onAck: (_) => fail('no acknowledgement may be sent'),
          );

          final service = SyncService(
            mockAuditRepository,
            mockSalesRepository,
            mockInventoryRepository,
            dio,
            database: database,
          );
          final result = await service.pullInboundDeltas();
          expect(result, isNotNull);

          final state = await terminalState(database);
          expect(state!.state, 'INTEGRITY_LOSS');
          expect(state.integrityClassification, 'ACK_INCONSISTENT');
        } finally {
          await database.close();
        }
      },
    );

    test(
      'DISABLED and UPGRADE_REQUIRED remain no-ops (§10 zero fallback)',
      () async {
        PackageInfo.setMockInitialValues(
          appName: 'OmniFood POS',
          packageName: 'com.omnifood.pos',
          version: '2.3.4',
          buildNumber: '11',
          buildSignature: '',
        );
        final database = await buildDb();

        try {
          await seedOhacTenant(database);
          // An ACTIVE terminal with no candidate: the negotiation statuses
          // must not move it, and no acknowledgement may be sent for them.
          await database.ohacDeliveryDao.insertTerminalState(
            OhacTerminalStateEntity(
              tenantId: ohacTenant,
              terminalId: 'dev-1',
              state: 'ACTIVE',
              activeSequence: 0,
              activeDigest: genesisDigest,
              candidateSequence: 0,
              candidateDigest: '',
              serverFloorSequence: 0,
              serverFloorDigest: genesisDigest,
              negotiatedPosBuild: ohacPosBuild,
              negotiatedBackendBuild: 'backend-build-1',
              negotiatedPolicySchema: staffPolicyEpochV1Schema,
              negotiatedAssertionSchema: 'ohac.assertion.v1',
              integrityClassification: '',
              localAuthorizationSequence: 0,
              revision: 2,
              updatedAt: '2026-01-01T00:00:00.000Z',
            ),
          );
          for (final status in ['DISABLED', 'UPGRADE_REQUIRED']) {
            installOhacInterceptor(
              deltas: () =>
                  deltasResponse(humanAuthorization: {'status': status}),
              onAck: (_) => fail('no acknowledgement may be sent for $status'),
            );

            final service = SyncService(
              mockAuditRepository,
              mockSalesRepository,
              mockInventoryRepository,
              dio,
              database: database,
            );
            final result = await service.pullInboundDeltas();
            expect(result, isNotNull);

            // The member was a pure no-op: no fault, no state change, no
            // acknowledgement.
            final state = await terminalState(database);
            expect(state!.state, 'ACTIVE');
            expect(state.integrityClassification, '');
            expect(state.revision, 2);
          }
          expect(
            capturedPosts.where((post) => post.path == ackPath),
            isEmpty,
          );
        } finally {
          await database.close();
        }
      },
    );
  });


  group('OHAC observability facts (U5b, design §12/§16)', () {
    const ohacTenant = '11111111-1111-4111-8111-111111111111';
    const ohacPosBuild = '2.3.4+11';
    const userA = '33333333-3333-4333-8333-333333333333';
    const ackPath = '/v1/sync/inbound/human-authorization/staff-policy/ack';
    // Hostile material seeded into the flow through the signed epoch: the
    // verifier encoding rides along in every DELIVER envelope, and no fact
    // emitted anywhere in the pull may ever contain it (design §12).
    const seededVerifier = r'$2b$10$abcdefghijklmnopqrstuv';

    Map<String, dynamic> epochEntry(String userId, List<String> permissions) =>
        <String, dynamic>{
          'userId': userId,
          'status': 'ACTIVE',
          'role': 'MANAGER',
          'permissions': permissions,
          'pinVerifier': <String, dynamic>{
            'algorithm': 'bcrypt',
            'formatVersion': '2b',
            'encoded': seededVerifier,
          },
          'attemptResetGeneration': '0',
        };

    Map<String, dynamic> signedEpochJson() =>
        jsonDecode(utf8.decode(signBody(<String, dynamic>{
          'schema': staffPolicyEpochV1Schema,
          'tenantId': ohacTenant,
          'targetTerminalId': 'dev-1',
          'sequence': '1',
          'previousSequence': '0',
          'previousDigest': genesisDigest,
          'publisherBackendBuild': 'backend-build-1',
          'targetPosBuild': ohacPosBuild,
          'minimumAssertionSchema': 'ohac.assertion.v1',
          'policyEntries': <Map<String, dynamic>>[
            epochEntry(userA, <String>['sales:void_invoice']),
          ],
        }))) as Map<String, dynamic>;

    Map<String, dynamic> deliverEnvelope(Map<String, dynamic> epochJson) => {
          'status': 'DELIVER',
          'epoch': epochJson,
          'sequence': epochJson['sequence'],
          'digest': epochJson['digest'],
        };

    Map<String, dynamic> deltasResponse({
      Map<String, dynamic>? humanAuthorization,
    }) =>
        {
          'status': 'success',
          'serverTime': '2026-08-26T18:30:00.000Z',
          'currentVersion': 1787750000000,
          'deltas': {
            'products': [],
            'catalogValues': [],
            'insumos': [],
            'recipes': [],
            'users': [],
          },
          // ignore: use_null_aware_elements
          if (humanAuthorization != null)
            'humanAuthorization': humanAuthorization,
        };

    Future<AppDatabase> buildDb() =>
        $FloorAppDatabase.inMemoryDatabaseBuilder().build();

    Future<void> seedOhacTenant(AppDatabase database) =>
        database.localConfigDao.saveConfig(
          LocalConfigEntity(key: 'tenant_id', value: ohacTenant),
        );

    SyncService serviceWithDb(
      AppDatabase database,
      List<OhacObservabilityFact> facts,
    ) =>
        SyncService(
          mockAuditRepository,
          mockSalesRepository,
          mockInventoryRepository,
          dio,
          database: database,
          ohacFactObserver: facts.add,
        );

    test(
      'RECOVERY_REQUIRED emits the integrity-classified fact with the '
      'classification, reason and applied outcome (§9/§12)',
      () async {
        PackageInfo.setMockInitialValues(
          appName: 'OmniFood POS',
          packageName: 'com.omnifood.pos',
          version: '2.3.4',
          buildNumber: '11',
          buildSignature: '',
        );
        final facts = <OhacObservabilityFact>[];
        final database = await buildDb();
        try {
          await seedOhacTenant(database);
          capturedGets['/v1/sync/inbound/deltas'] = deltasResponse(
            humanAuthorization: {'status': 'RECOVERY_REQUIRED'},
          );

          final result =
              await serviceWithDb(database, facts).pullInboundDeltas();
          expect(result, isNotNull);

          final classified = facts
              .where((f) => f.event == 'ohac_integrity_classified')
              .toList();
          expect(classified, hasLength(1));
          expect(classified.single.fields['classification'],
              'ACK_INCONSISTENT');
          expect(classified.single.fields['reason'], 'recovery_required');
          expect(classified.single.fields['applied'], true);
          expect(classified.single.fields['tenantId'], ohacTenant);
          expect(classified.single.fields['terminalId'], 'dev-1');
        } finally {
          await database.close();
        }
      },
    );

    test(
      'epoch acceptance and ack deferral emit publication/retry facts with '
      'pinned content, and NO fact in the whole stream carries the seeded '
      'verifier material (hostile-material guard, §12)',
      () async {
        PackageInfo.setMockInitialValues(
          appName: 'OmniFood POS',
          packageName: 'com.omnifood.pos',
          version: '2.3.4',
          buildNumber: '11',
          buildSignature: '',
        );
        final facts = <OhacObservabilityFact>[];
        final database = await buildDb();
        try {
          await seedOhacTenant(database);
          final epochJson = signedEpochJson();
          capturedGets['/v1/sync/inbound/deltas'] = deltasResponse(
            humanAuthorization: deliverEnvelope(epochJson),
          );
          // The ack POST answers 200: the claim is deferred (§10
          // unexpected_status), which must surface as an ack-retry fact.

          final result =
              await serviceWithDb(database, facts).pullInboundDeltas();
          expect(result, isNotNull);

          final publication = facts
              .where((f) => f.event == 'ohac_epoch_publication')
              .toList();
          expect(publication, hasLength(1));
          expect(publication.single.fields['action'], 'accepted');
          expect(publication.single.fields['sequence'], '1');

          final retry = facts
              .where((f) =>
                  f.event == 'ohac_ack_outcome' &&
                  f.fields['outcome'] == 'deferred')
              .toList();
          expect(retry, isNotEmpty);
          expect(
            retry.any((f) => f.fields['reason'] == 'unexpected_status'),
            isTrue,
          );

          // The hostile-material guard: the seeded verifier encoding (and
          // the signed epoch body) flowed through this pull, and none of
          // the emitted facts may carry it.
          for (final fact in facts) {
            final line = serializeOhacFact(fact);
            expect(line.contains(seededVerifier), isFalse,
                reason: 'fact ${fact.event} leaked verifier material');
            expect(line.contains('pinVerifier'), isFalse,
                reason: 'fact ${fact.event} leaked verifier material');
            expect(line.contains('attemptResetGeneration'), isFalse,
                reason: 'fact ${fact.event} leaked epoch body material');
          }
        } finally {
          await database.close();
        }
      },
    );
  });

  group('Slice 8.3 Auto-Sync, Network Resilience & Fault Isolation', () {
    test(
      'triggers automatic sync when NetworkConnectivityService detects reconnection',
      () async {
        final connectivityService = NetworkConnectivityService(dio);
        connectivityService.setOnlineStateForTest(false);

        final autoSyncService = SyncService(
          mockAuditRepository,
          mockSalesRepository,
          mockInventoryRepository,
          dio,
          connectivityService: connectivityService,
        );

        autoSyncService.start();

        expect(mockAuditRepository.syncCount, 0);

        // Simulate recovery to online
        connectivityService.setOnlineStateForTest(true);
        await Future<void>.delayed(Duration.zero);

        expect(mockAuditRepository.syncCount, 1);

        autoSyncService.dispose();
        connectivityService.dispose();
      },
    );

    test(
      'updates CloudSyncStatus through syncing, success, and idle transitions',
      () async {
        final statuses = <CloudSyncStatus>[];
        final sub = syncService.onStatusChanged.listen(statuses.add);

        await syncService.triggerManualSync();
        await Future<void>.delayed(Duration.zero);

        expect(statuses, contains(CloudSyncStatus.syncing));
        expect(statuses, contains(CloudSyncStatus.success));
        expect(statuses, contains(CloudSyncStatus.idle));
        expect(syncService.status, CloudSyncStatus.idle);
        expect(syncService.lastSyncTime, isNotNull);
        expect(syncService.consecutiveFailures, 0);

        await sub.cancel();
      },
    );

    test(
      'getPendingOutboxCount correctly aggregates pending records',
      () async {
        mockSalesRepository.unsyncedAggregates = [
          {'id': 'sale-1', 'documentType': 'INVOICE'},
          {'id': 'sale-2', 'documentType': 'INVOICE'},
        ];
        mockInventoryRepository.unsynced = [movement('mov-1')];

        final count = await syncService.getPendingOutboxCount();
        expect(count, 3);
      },
    );

    test(
      'getPendingOutboxCount excludes DSI-6-held credit notes from the pending count',
      () async {
        mockSalesRepository.unsyncedAggregates = [
          {'id': 'sale-1', 'documentType': 'INVOICE'},
          {'id': 'cn-1', 'documentType': 'CREDIT_NOTE'},
        ];

        final count = await syncService.getPendingOutboxCount();

        // DSI-6 holds credit notes out of outbound batches, so they are not
        // actionable pending work: the badge must not count them.
        expect(count, 1);
      },
    );

    test(
      'getPendingOutboxCount excludes DSI-6-held credit-note restock movements',
      () async {
        mockInventoryRepository.unsynced = [
          movement('mov-1'),
          movement(
            'cn-restock',
            sourceDocumentType: 'CREDIT_NOTE_RESTOCK',
          ),
        ];

        final count = await syncService.getPendingOutboxCount();

        // CN restock movements are deliberately held out of the outbound
        // inventory batch (DSI-6): the badge must not count them.
        expect(count, 1);
      },
    );

    test(
      'getPendingOutboxCount isolates a failing domain query and still counts the rest',
      () async {
        mockSalesRepository.unsyncedAggregates = [
          {'id': 'sale-1', 'documentType': 'INVOICE'},
          {'id': 'sale-2', 'documentType': 'INVOICE'},
        ];
        mockInventoryRepository.failUnsyncedMovementsQuery = true;

        final count = await syncService.getPendingOutboxCount();

        // The movements query threw (failure path entered), so the total
        // excludes that domain but still reflects every other domain.
        expect(mockInventoryRepository.unsyncedMovementsQueryCalls, 1);
        expect(count, 2);
      },
    );

    test(
      'getNextBackoffDelay scales exponentially with consecutive failures',
      () async {
        expect(syncService.getNextBackoffDelay(), Duration.zero);

        // Trigger forced failure
        forcedError = DioException(
          requestOptions: RequestOptions(path: '/v1/sync/batch'),
          response: Response(
            statusCode: 500,
            requestOptions: RequestOptions(path: '/v1/sync/batch'),
          ),
        );

        mockInventoryRepository.unsynced = [movement('mov-err')];
        await syncService.triggerManualSync();

        expect(syncService.consecutiveFailures, 1);
        expect(syncService.getNextBackoffDelay(), const Duration(seconds: 5));

        await syncService.triggerManualSync();
        expect(syncService.consecutiveFailures, 2);
        expect(syncService.getNextBackoffDelay(), const Duration(seconds: 10));

        await syncService.triggerManualSync();
        expect(syncService.consecutiveFailures, 3);
        expect(syncService.getNextBackoffDelay(), const Duration(seconds: 20));
      },
    );

    test(
      'fault isolation: Inbound Catalog failure does not block Sales Outbox push',
      () async {
        final database = await $FloorAppDatabase
            .inMemoryDatabaseBuilder()
            .build();

        try {
          final isolatedSyncService = SyncService(
            mockAuditRepository,
            mockSalesRepository,
            mockInventoryRepository,
            dio,
            database: database,
          );

          mockSalesRepository.unsyncedAggregates = [
            {
              'id': 'sale-isolated',
              'number': 'FAC-001',
              'documentType': 'INVOICE',
              'terminalId': 'pos-terminal-1',
              'sourceSequence': 1,
              'idempotencyKey': 'invoice:pos-terminal-1:sale-isolated',
              'items': [],
            },
          ];

          // Setup batch POST to succeed, but inbound GET to fail with 500
          dio.interceptors.clear();
          dio.interceptors.add(
            InterceptorsWrapper(
              onRequest: (options, handler) {
                if (options.path == '/v1/sync/batch') {
                  handler.resolve(
                    Response<dynamic>(
                      statusCode: 200,
                      requestOptions: options,
                      data: {
                        'status': 'OK',
                        'received': 1,
                        'results': [
                          {
                            'idempotencyKey':
                                'invoice:pos-terminal-1:sale-isolated',
                            'terminalId': 'pos-terminal-1',
                            'flowType': 'sales',
                            'sourceSequence': 1,
                            'status': 'ACCEPTED',
                          },
                        ],
                      },
                    ),
                  );
                  return;
                }
                if (options.path == '/v1/sync/inbound/deltas') {
                  handler.reject(
                    DioException(
                      requestOptions: options,
                      response: Response(
                        statusCode: 500,
                        requestOptions: options,
                        data: {'error': 'Internal Server Error'},
                      ),
                      type: DioExceptionType.badResponse,
                    ),
                  );
                  return;
                }
                handler.resolve(
                  Response<dynamic>(
                    statusCode: 200,
                    requestOptions: options,
                    data: {'ok': true},
                  ),
                );
              },
            ),
          );

          await isolatedSyncService.triggerManualSync();

          // Verify sales document was marked synced despite inbound catalog error!
          expect(mockSalesRepository.syncedInvoiceIdBatches, [
            ['sale-isolated'],
          ]);
          expect(isolatedSyncService.lastSyncError, contains('Catálogo'));
        } finally {
          await database.close();
        }
      },
    );
  });

  group('Slice 8 POS movement ownership and exact ACK in SyncService', () {
    test(
      'generic inventory outbox sends only GENERIC_INVENTORY movements and defensively excludes sales',
      () async {
        mockInventoryRepository.unsynced = [
          InventoryMovement(
            id: 'mov-sale-sync',
            insumoId: 'ins-1',
            type: MovementType.sale,
            quantity: -1.0,
            previousStock: 10.0,
            newStock: 9.0,
            timestamp: DateTime.now(),
            deliveryOwner: 'SALE_SYNC',
            deliveryState: 'LOCAL_APPLIED',
            saleId: 'inv-1',
          ),
          InventoryMovement(
            id: 'mov-sale-defensive',
            insumoId: 'ins-1',
            type: MovementType.sale,
            quantity: -1.0,
            previousStock: 10.0,
            newStock: 9.0,
            timestamp: DateTime.now(),
            sourceDocumentType: 'SALE',
            deliveryOwner: 'GENERIC_INVENTORY',
            deliveryState: 'LOCAL_APPLIED',
          ),
          InventoryMovement(
            id: 'mov-quarantined',
            insumoId: 'ins-1',
            type: MovementType.adjustment,
            quantity: 1.0,
            previousStock: 9.0,
            newStock: 10.0,
            timestamp: DateTime.now(),
            deliveryOwner: 'GENERIC_INVENTORY',
            deliveryState: 'QUARANTINED',
          ),
          InventoryMovement(
            id: 'mov-generic-valid',
            insumoId: 'ins-1',
            type: MovementType.adjustment,
            quantity: 2.0,
            previousStock: 10.0,
            newStock: 12.0,
            timestamp: DateTime.now(),
            deliveryOwner: 'GENERIC_INVENTORY',
            deliveryState: 'LOCAL_APPLIED',
          ),
        ];

        respondToInventoryBatchWith(
          (records) => {
            'status': 'OK',
            'received': records.length,
            'results': records.map((r) => {...r, 'status': 'APPLIED'}).toList(),
          },
        );

        await syncService.triggerManualSync();

        final inventoryPosts = capturedPosts
            .where((p) => p.path == '/v1/sync/batch')
            .toList();
        expect(inventoryPosts, hasLength(1));
        final records = (inventoryPosts.first.body as Map)['records'] as List;
        expect(records, hasLength(1));
        expect(records.first['idempotencyKey'], contains('mov-generic-valid'));
      },
    );

    test(
      'sales sync reconciles ACK correlation IDs via acknowledgeSaleSync and honors integrity failures',
      () async {
        mockSalesRepository.unsyncedAggregates = [
          {
            'id': 'inv-ack-sync',
            'terminalId': 'term-1',
            'documentType': 'SALE',
            'sourceSequence': 1,
            'idempotencyKey': 'sale:term-1:inv-ack-sync',
            'inventoryOutcome': 'APPLIED',
            'items': [],
            'payments': [],
          },
        ];

        respondToInventoryBatchWith(
          (records) => {
            'status': 'OK',
            'received': records.length,
            'results': [
              {
                'idempotencyKey': 'sale:term-1:inv-ack-sync',
                'terminalId': 'term-1',
                'flowType': 'sales',
                'sourceSequence': 1,
                'status': 'APPLIED',
                'inventoryOutcome': 'APPLIED',
                'acknowledgedMovementCorrelationIds': ['corr-ack-1'],
              },
            ],
          },
        );

        await syncService.triggerManualSync();

        expect(mockSalesRepository.acknowledgedSales, hasLength(1));
        expect(
          mockSalesRepository.acknowledgedSales.first.invoiceId,
          'inv-ack-sync',
        );
        expect(mockSalesRepository.acknowledgedSales.first.outcome, 'APPLIED');
        expect(
          mockSalesRepository
              .acknowledgedSales
              .first
              .acknowledgedCorrelationIds,
          ['corr-ack-1'],
        );
      },
    );
  });

  group('Slice 5b Loyalty Point Transactions Outbound (finding H2)', () {
    CustomerPointTransactionEntity pointTx(
      String id, {
      String? idempotencyKey,
      String type = 'earn',
      String? transactionType,
      double points = 12,
      int? units,
      String? invoiceId,
      String? ticketId,
      String? loyaltyProgramId,
      String terminalId = 'term-1',
    }) {
      return CustomerPointTransactionEntity(
        id: id,
        customerId: 'cust-1',
        invoiceId: invoiceId,
        type: type,
        points: points,
        balanceAfter: points,
        conversionRate: 0.1,
        reason: 'Acumulación por compra',
        createdAt: DateTime.parse('2026-01-01T12:00:00Z').millisecondsSinceEpoch,
        syncStatus: 'pending',
        loyaltyProgramId: loyaltyProgramId,
        ticketId: ticketId,
        transactionType: transactionType,
        units: units,
        idempotencyKey: idempotencyKey,
        terminalId: terminalId,
        origin: 'POS',
        occurredAt:
            DateTime.parse('2026-01-01T12:00:00Z').millisecondsSinceEpoch,
      );
    }

    Future<AppDatabase> buildDbWithPendingTx(
      List<CustomerPointTransactionEntity> txs,
    ) async {
      final database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
      for (final tx in txs) {
        await database.customerPointTransactionDao.insertTransaction(tx);
      }
      return database;
    }

    List<Map<String, dynamic>> loyaltyPostBodies() {
      return capturedPosts
          .where((post) => post.path == '/loyalty/point-transactions/sync')
          .map(
            (post) =>
                (post.body as Map<String, dynamic>)['transactions']
                    as List<dynamic>,
          )
          .expand((records) => records.cast<Map<String, dynamic>>())
          .toList(growable: false);
    }

    test('outbound loyalty push is called during manual sync', () async {
      final database = await buildDbWithPendingTx([
        pointTx(
          'ptx-1',
          idempotencyKey: 'loyalty:earn:tenant-1:ticket-001:legacy',
          invoiceId: 'ticket-001',
        ),
      ]);
      final service = SyncService(
        mockAuditRepository,
        mockSalesRepository,
        mockInventoryRepository,
        dio,
        database: database,
      );

      await service.triggerManualSync();

      expect(
        capturedPosts.any((post) => post.path == '/loyalty/point-transactions/sync'),
        true,
      );
      final records = loyaltyPostBodies();
      expect(records, hasLength(1));
      expect(records.single['idempotencyKey'],
          'loyalty:earn:tenant-1:ticket-001:legacy');
      expect(records.single['customerId'], 'cust-1');
      expect(records.single['transactionType'], 'earn');
      expect(records.single['units'], 12);
      expect(records.single['ticketId'], 'ticket-001');
      expect(records.single['terminalId'], 'term-1');
      expect(records.single['origin'], 'POS');
      expect(records.single['occurredAt'], '2026-01-01T12:00:00.000Z');
    });

    test('successful push marks rows synced', () async {
      final database = await buildDbWithPendingTx([
        pointTx(
          'ptx-1',
          idempotencyKey: 'loyalty:earn:tenant-1:ticket-001:legacy',
          invoiceId: 'ticket-001',
        ),
        pointTx(
          'ptx-2',
          type: 'redeem',
          transactionType: 'redeem',
          points: -5,
          units: -5,
        ),
      ]);
      final service = SyncService(
        mockAuditRepository,
        mockSalesRepository,
        mockInventoryRepository,
        dio,
        database: database,
      );

      await service.triggerManualSync();

      // ptx-2 carries no idempotency key: the payload derives a stable
      // one from the tenant and the immutable local row id.
      final records = loyaltyPostBodies();
      expect(records, hasLength(2));
      expect(
        records.map((r) => r['idempotencyKey']),
        containsAll([
          'loyalty:earn:tenant-1:ticket-001:legacy',
          'loyalty:sync:tenant-1:ptx-2',
        ]),
      );

      final synced = await database.customerPointTransactionDao
          .getTransactionsBySyncStatus('synced');
      final pending = await database.customerPointTransactionDao
          .getTransactionsBySyncStatus('pending');
      expect(synced.map((tx) => tx.id), containsAll(['ptx-1', 'ptx-2']));
      expect(pending, isEmpty);
    });

    test('loyalty failure does not break other domains and keeps rows pending',
        () async {
      final database = await buildDbWithPendingTx([
        pointTx('ptx-fail', idempotencyKey: 'loyalty:earn:tenant-1:k:fail'),
      ]);
      final loyaltyFailureDio = Dio();
      loyaltyFailureDio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            if (options.method.toUpperCase() == 'POST') {
              capturedPosts.add(
                CapturedPost(path: options.path, body: options.data),
              );
            }
            if (options.path == '/loyalty/point-transactions/sync') {
              handler.reject(
                DioException(
                  requestOptions: options,
                  response: Response<dynamic>(
                    requestOptions: options,
                    statusCode: 500,
                  ),
                ),
              );
              return;
            }
            if (options.path == '/v1/sync/batch') {
              final records =
                  ((options.data as Map<String, dynamic>)['records']
                          as List<dynamic>)
                      .cast<Map<String, dynamic>>();
              handler.resolve(
                Response<dynamic>(
                  data: {
                    'status': 'OK',
                    'received': records.length,
                    'results': records
                        .map(
                          (record) => {...record, 'status': 'ACCEPTED'},
                        )
                        .toList(growable: false),
                  },
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
      mockInventoryRepository.unsynced = [
        InventoryMovement(
          id: 'mov-after-loyalty',
          insumoId: 'i-9',
          type: MovementType.adjustment,
          quantity: -1,
          previousStock: 10,
          newStock: 9,
          timestamp: DateTime.parse('2026-01-01T12:00:00Z'),
        ),
      ];
      final service = SyncService(
        mockAuditRepository,
        mockSalesRepository,
        mockInventoryRepository,
        loyaltyFailureDio,
        database: database,
      );

      final outcome = await service.triggerManualSync();

      // Fault isolation: a domain registered after loyalty still ran.
      expect(
        capturedPosts.any((post) => post.path == '/v1/sync/batch'),
        true,
      );
      expect(mockInventoryRepository.syncedIds, contains('mov-after-loyalty'));
      // Offline-first: the failed loyalty rows stay pending for retry.
      final pending = await database.customerPointTransactionDao
          .getTransactionsBySyncStatus('pending');
      expect(pending.map((tx) => tx.id), ['ptx-fail']);
      expect(outcome.status, isNot(SyncRunStatus.complete));
      expect(service.lastSyncError, contains('Loyalty'));
    });
  });

  group('Slice 5c Cash Shifts Outbound (finding H3)', () {
    CashierSessionEntity shiftSession(
      String id, {
      bool isClosed = false,
      int? closedAt,
      double? closingCountedNio,
      double? differenceNio,
      int? zReportSequence,
      String terminalId = 'term-1',
    }) {
      return CashierSessionEntity(
        id: id,
        userId: 'user-1',
        terminalId: terminalId,
        openedAt: DateTime.parse('2026-01-01T12:00:00Z').millisecondsSinceEpoch,
        closedAt: closedAt,
        openingBalanceNio: 5000,
        openingBalanceUsd: 0,
        expectedNio: 5000,
        expectedUsd: 0,
        closingCountedNio: closingCountedNio,
        differenceNio: differenceNio,
        zReportSequence: zReportSequence,
        isClosed: isClosed,
        syncStatus: 'pending',
      );
    }

    CashMovementEntity cashMovement(
      String id, {
      String shiftId = 'shift-1',
    }) {
      return CashMovementEntity(
        id: id,
        shiftId: shiftId,
        terminalId: 'term-1',
        type: 'CASH_IN',
        amountNio: 1000,
        reason: 'Fondo de cambio',
        timestamp: DateTime.parse('2026-01-01T12:05:00Z').millisecondsSinceEpoch,
        syncStatus: 'pending',
      );
    }

    Future<AppDatabase> buildDbWithPendingCashData({
      List<CashierSessionEntity> sessions = const [],
      List<CashMovementEntity> movements = const [],
    }) async {
      final database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
      for (final session in sessions) {
        await database.cashierSessionDao.insertSession(session);
      }
      for (final movement in movements) {
        await database.cashMovementDao.insertMovement(movement);
      }
      return database;
    }

    List<Map<String, dynamic>> cashShiftPostSessions() {
      return capturedPosts
          .where((post) => post.path == '/sales/shifts/sync')
          .map(
            (post) =>
                (post.body as Map<String, dynamic>)['sessions'] as List<dynamic>,
          )
          .expand((records) => records.cast<Map<String, dynamic>>())
          .toList(growable: false);
    }

    List<Map<String, dynamic>> cashShiftPostMovements() {
      return capturedPosts
          .where((post) => post.path == '/sales/shifts/sync')
          .map(
            (post) => (post.body as Map<String, dynamic>)['movements']
                as List<dynamic>,
          )
          .expand((records) => records.cast<Map<String, dynamic>>())
          .toList(growable: false);
    }

    test('outbound cash shift push is called during manual sync', () async {
      final database = await buildDbWithPendingCashData(
        sessions: [shiftSession('shift-1a')],
        movements: [cashMovement('cmv-1a', shiftId: 'shift-1a')],
      );
      final service = SyncService(
        mockAuditRepository,
        mockSalesRepository,
        mockInventoryRepository,
        dio,
        database: database,
      );

      await service.triggerManualSync();

      expect(
        capturedPosts.any((post) => post.path == '/sales/shifts/sync'),
        true,
      );
      // In-memory Floor databases are shared across builders in this suite,
      // so every assertion is scoped to this test's own row ids.
      final sessions = cashShiftPostSessions()
          .where((s) => s['id'] == 'shift-1a')
          .toList(growable: false);
      expect(sessions, hasLength(1));
      expect(sessions.single['terminalId'], 'term-1');
      expect(sessions.single['cashierId'], 'user-1');
      expect(sessions.single['status'], 'OPEN');
      expect(sessions.single['initialFloatNio'], 5000);
      expect(sessions.single['openedAt'], '2026-01-01T12:00:00.000Z');
      final movements = cashShiftPostMovements()
          .where((m) => m['id'] == 'cmv-1a')
          .toList(growable: false);
      expect(movements, hasLength(1));
      expect(movements.single['shiftId'], 'shift-1a');
      expect(movements.single['type'], 'CASH_IN');
      expect(movements.single['amountNio'], 1000);
      expect(movements.single['timestamp'], '2026-01-01T12:05:00.000Z');
    });

    test('successful push marks closed sessions and movements synced; open sessions stay pending', () async {
      final database = await buildDbWithPendingCashData(
        sessions: [
          // Already closed on this terminal: safe to mark synced after push.
          shiftSession(
            'shift-2c',
            isClosed: true,
            closedAt: DateTime.parse('2026-01-01T20:00:00Z')
                .millisecondsSinceEpoch,
            closingCountedNio: 5200,
            differenceNio: 200,
            zReportSequence: 7,
          ),
          // Still open: its closure must be pushed on a later pass, so it
          // intentionally stays pending after an accepted push.
          shiftSession('shift-2o'),
        ],
        movements: [cashMovement('cmv-2a')],
      );
      final service = SyncService(
        mockAuditRepository,
        mockSalesRepository,
        mockInventoryRepository,
        dio,
        database: database,
      );

      await service.triggerManualSync();

      final sessions = cashShiftPostSessions();
      expect(
        sessions.map((s) => s['id']),
        containsAll(['shift-2c', 'shift-2o']),
      );
      final closedPayload =
          sessions.firstWhere((s) => s['id'] == 'shift-2c');
      expect(closedPayload['status'], 'CLOSED');
      expect(closedPayload['closedAt'], '2026-01-01T20:00:00.000Z');
      expect(closedPayload['finalCountedNio'], 5200);
      expect(closedPayload['differenceNio'], 200);
      expect(closedPayload['zReportSequence'], 7);

      final closedRow =
          await database.cashierSessionDao.getSessionById('shift-2c');
      expect(closedRow!.syncStatus, 'synced');
      final openRow =
          await database.cashierSessionDao.getSessionById('shift-2o');
      expect(openRow!.syncStatus, 'pending');
      final pendingMovements = await database.cashMovementDao
          .getMovementsBySyncStatus('pending');
      expect(pendingMovements.map((m) => m.id), isNot(contains('cmv-2a')));
      final syncedMovements = await database.cashMovementDao
          .getMovementsBySyncStatus('synced');
      expect(syncedMovements.map((m) => m.id), contains('cmv-2a'));
    });

    test('cash shift failure does not break other domains and keeps rows pending', () async {
      final database = await buildDbWithPendingCashData(
        sessions: [shiftSession('shift-3f')],
        movements: [cashMovement('cmv-3f')],
      );
      final cashShiftFailureDio = Dio();
      cashShiftFailureDio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            if (options.method.toUpperCase() == 'POST') {
              capturedPosts.add(
                CapturedPost(path: options.path, body: options.data),
              );
            }
            if (options.path == '/sales/shifts/sync') {
              handler.reject(
                DioException(
                  requestOptions: options,
                  response: Response<dynamic>(
                    requestOptions: options,
                    statusCode: 500,
                  ),
                ),
              );
              return;
            }
            if (options.path == '/v1/sync/batch') {
              final records =
                  ((options.data as Map<String, dynamic>)['records']
                          as List<dynamic>)
                      .cast<Map<String, dynamic>>();
              handler.resolve(
                Response<dynamic>(
                  data: {
                    'status': 'OK',
                    'received': records.length,
                    'results': records
                        .map(
                          (record) => {...record, 'status': 'ACCEPTED'},
                        )
                        .toList(growable: false),
                  },
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
      mockInventoryRepository.unsynced = [
        InventoryMovement(
          id: 'mov-after-cashshift',
          insumoId: 'i-9',
          type: MovementType.adjustment,
          quantity: -1,
          previousStock: 10,
          newStock: 9,
          timestamp: DateTime.parse('2026-01-01T12:00:00Z'),
        ),
      ];
      final service = SyncService(
        mockAuditRepository,
        mockSalesRepository,
        mockInventoryRepository,
        cashShiftFailureDio,
        database: database,
      );

      final outcome = await service.triggerManualSync();

      // Fault isolation: a domain registered after cash shifts still ran.
      expect(
        capturedPosts.any((post) => post.path == '/v1/sync/batch'),
        true,
      );
      expect(
        mockInventoryRepository.syncedIds,
        contains('mov-after-cashshift'),
      );
      // Offline-first: the failed cash shift rows stay pending for retry.
      final pendingSession =
          await database.cashierSessionDao.getSessionById('shift-3f');
      expect(pendingSession!.syncStatus, 'pending');
      final pendingMovements = await database.cashMovementDao
          .getMovementsBySyncStatus('pending');
      expect(pendingMovements.map((m) => m.id), contains('cmv-3f'));
      expect(outcome.status, isNot(SyncRunStatus.complete));
      expect(service.lastSyncError, contains('CashShifts'));
    });
  });

  group('Slice 5d Loyalty, Promotions & Customers Inbound (findings M1-M3)', () {
    test(
      'pullInboundDeltas hydrates loyalty programs with rewards, promotions and customers',
      () async {
        final database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();

        try {
          final syncServiceWithDb = SyncService(
            mockAuditRepository,
            mockSalesRepository,
            mockInventoryRepository,
            dio,
            database: database,
          );

          capturedGets['/v1/sync/inbound/deltas'] = {
            'status': 'success',
            'serverTime': '2026-08-26T18:00:00.000Z',
            'currentVersion': 1787745600000,
            'deltas': {
              'loyaltyPrograms': [
                {
                  'id': 'lp-101',
                  'tenantId': 'tenant-1',
                  'name': 'Café Loyal',
                  'programType': 'SPEND_POINTS',
                  'status': 'ACTIVE',
                  'earningRule': {'pointsPerCurrency': 1},
                  'eligibilityRule': {'minOrderAmount': 100},
                  'configVersion': 3,
                  'createdAt': '2026-08-01T00:00:00.000Z',
                  'updatedAt': '2026-08-02T00:00:00.000Z',
                  'rewards': [
                    {
                      'id': 'rw-101',
                      'tenantId': 'tenant-1',
                      'loyaltyProgramId': 'lp-101',
                      'name': 'Café gratis',
                      'rewardType': 'FREE_PRODUCT',
                      'costUnits': 100,
                      'benefitConfig': {'productId': 'prod-1'},
                      'status': 'ACTIVE',
                      'presentationOrder': 1,
                      'configVersion': 2,
                      'createdAt': '2026-08-01T00:00:00.000Z',
                      'updatedAt': '2026-08-02T00:00:00.000Z',
                    },
                  ],
                },
              ],
              'promotions': [
                {
                  'id': 'promo-101',
                  'tenantId': 'tenant-1',
                  'name': '2x1 Jueves',
                  'type': 'buyXGetYFree',
                  'targetProductId': 'prod-7',
                  'buyQuantity': 2,
                  'getQuantity': 1,
                  'discountValue': 0.0,
                  'minOrderAmount': 0.0,
                  'daysOfWeek': ['4', '5'],
                  'priority': 5,
                  'isStackable': true,
                  'isActive': true,
                },
              ],
              'customers': [
                {
                  'id': 'cust-101',
                  'tenantId': 'tenant-1',
                  'name': 'María López',
                  'taxId': 'XOT1234567',
                  'phone': '5555101010',
                  'email': 'maria@example.ni',
                  'address': null,
                  'pointsBalance': 42.5,
                  'isActive': true,
                  'createdAt': '2026-08-01T00:00:00.000Z',
                  'updatedAt': '2026-08-02T00:00:00.000Z',
                },
              ],
            },
          };

          final result = await syncServiceWithDb.pullInboundDeltas();

          expect(result, isNotNull);

          // Loyalty program + embedded reward closure hydrated.
          final savedProgram = await database.loyaltyProgramDao.getProgramById(
            'lp-101',
          );
          expect(savedProgram, isNotNull);
          expect(savedProgram!.name, 'Café Loyal');
          expect(savedProgram.programType, 'SPEND_POINTS');
          expect(savedProgram.configVersion, 3);
          expect(
            savedProgram.earningRuleJson,
            contains('pointsPerCurrency'),
          );
          final savedRewards = await database.loyaltyRewardDao
              .getRewardsByProgram('lp-101');
          expect(savedRewards, hasLength(1));
          expect(savedRewards.first.name, 'Café gratis');
          expect(savedRewards.first.costUnits, 100);
          expect(
            savedRewards.first.benefitConfigJson,
            contains('productId'),
          );

          // Promotion hydrated.
          final savedPromotions = await database.promotionDao
              .getAllPromotions();
          expect(savedPromotions, hasLength(1));
          expect(savedPromotions.first.name, '2x1 Jueves');
          expect(savedPromotions.first.daysOfWeek, '4,5');
          expect(savedPromotions.first.priority, 5);

          // Customer hydrated.
          final savedCustomer = await database.customerDao.getCustomerById(
            'cust-101',
          );
          expect(savedCustomer, isNotNull);
          expect(savedCustomer!.name, 'María López');
          expect(savedCustomer.taxId, 'XOT1234567');
          expect(savedCustomer.pointsBalance, 42.5);
          // A cloud-delivered customer is a synced record: there is nothing
          // local to push.
          expect(savedCustomer.syncStatus, 'synced');

          // Watermark stamped once at the end of the pull with the server's
          // currentVersion.
          final savedVersionConfig = await database.localConfigDao
              .getConfigByKey('last_inbound_sync_version');
          expect(savedVersionConfig, isNotNull);
          expect(savedVersionConfig!.value, '1787745600000');
        } finally {
          await database.close();
        }
      },
    );

    test(
      'skips malformed loyalty/promotion/customer rows without aborting the pull or the watermark',
      () async {
        final database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();

        try {
          final syncServiceWithDb = SyncService(
            mockAuditRepository,
            mockSalesRepository,
            mockInventoryRepository,
            dio,
            database: database,
          );

          capturedGets['/v1/sync/inbound/deltas'] = {
            'status': 'success',
            'serverTime': '2026-08-26T18:00:00.000Z',
            'currentVersion': 1787745600001,
            'deltas': {
              'loyaltyPrograms': [
                // Malformed program: missing id.
                {
                  'name': 'Sin identidad',
                  'programType': 'SPEND_POINTS',
                  'tenantId': 'tenant-1',
                },
                {
                  'id': 'lp-102',
                  'tenantId': 'tenant-1',
                  'name': 'Sellos Pan',
                  'programType': 'PRODUCT_STAMPS',
                  'status': 'ACTIVE',
                  'configVersion': 1,
                  'rewards': [
                    // Malformed reward inside an otherwise valid program.
                    {'rewardType': 'FREE_PRODUCT'},
                    {
                      'id': 'rw-102',
                      'tenantId': 'tenant-1',
                      'loyaltyProgramId': 'lp-102',
                      'name': 'Pan gratis',
                      'rewardType': 'FREE_PRODUCT',
                      'costUnits': 5,
                      'status': 'ACTIVE',
                    },
                  ],
                },
              ],
              'promotions': [
                // Malformed promotion: missing name.
                {'id': 'promo-broken', 'type': 'fixedDiscount'},
                {
                  'id': 'promo-102',
                  'tenantId': 'tenant-1',
                  'name': 'Descuento 10%',
                  'type': 'percentageDiscount',
                  'discountValue': 10.0,
                  'isActive': true,
                },
              ],
              'customers': [
                // Malformed customer: missing name.
                {'id': 'cust-broken'},
                {
                  'id': 'cust-102',
                  'tenantId': 'tenant-1',
                  'name': 'Pedro Pérez',
                  'pointsBalance': 5.0,
                  'isActive': true,
                },
              ],
            },
          };

          final result = await syncServiceWithDb.pullInboundDeltas();

          // The pull itself and the watermark survive malformed rows.
          expect(result, isNotNull);
          final savedVersionConfig = await database.localConfigDao
              .getConfigByKey('last_inbound_sync_version');
          expect(savedVersionConfig!.value, '1787745600001');

          // Malformed program row never reached the local tables.
          expect(await database.loyaltyProgramDao.getProgramById('lp-102'),
              isNotNull);
          final lp102Rewards = await database.loyaltyRewardDao
              .getRewardsByProgram('lp-102');
          expect(lp102Rewards, hasLength(1));
          expect(lp102Rewards.first.id, 'rw-102');

          final savedPromotions = await database.promotionDao
              .getAllPromotions();
          expect(savedPromotions.map((p) => p.id), ['promo-102']);

          final brokenCustomer = await database.customerDao.getCustomerById(
            'cust-broken',
          );
          expect(brokenCustomer, isNull);
          final goodCustomer = await database.customerDao.getCustomerById(
            'cust-102',
          );
          expect(goodCustomer, isNotNull);
          expect(goodCustomer!.name, 'Pedro Pérez');
        } finally {
          await database.close();
        }
      },
    );

    test(
      'merges cloud customers preserving POS-local fields and the local balance behind unsynced point transactions',
      () async {
        final database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();

        try {
          final syncServiceWithDb = SyncService(
            mockAuditRepository,
            mockSalesRepository,
            mockInventoryRepository,
            dio,
            database: database,
          );

          // A locally created (express) customer, still unsynced, with a
          // pending point transaction (slice 5b): the local balance is the
          // truth until the ledger push lands.
          await database.customerDao.saveCustomer(
            CustomerEntity(
              id: 'cust-local-pending',
              name: 'Cliente Express Local',
              pointsBalance: 50.0,
              createdAt: 1787000000000,
              updatedAt: 1787000000000,
              syncStatus: 'pending',
              customerCode: 'LOCAL-001',
            ),
          );
          await database.customerPointTransactionDao.insertTransaction(
            CustomerPointTransactionEntity(
              id: 'tx-pending-1',
              customerId: 'cust-local-pending',
              type: 'earn',
              points: 50.0,
              balanceAfter: 50.0,
              conversionRate: 1.0,
              createdAt: 1787000001000,
              syncStatus: 'pending',
            ),
          );

          // A cloud-synced local customer with a locally generated code but
          // no unsynced ledger: the cloud balance wins, the code survives.
          await database.customerDao.saveCustomer(
            CustomerEntity(
              id: 'cust-synced',
              name: 'Cliente Sincronizado',
              pointsBalance: 10.0,
              createdAt: 1787000000000,
              updatedAt: 1787000000000,
              syncStatus: 'synced',
              customerCode: 'LOCAL-002',
            ),
          );

          capturedGets['/v1/sync/inbound/deltas'] = {
            'status': 'success',
            'serverTime': '2026-08-26T18:00:00.000Z',
            'currentVersion': 1787745600002,
            'deltas': {
              'customers': [
                {
                  // Cloud carries a stale balance (999) because the terminal's
                  // pending point transactions have not been ingested yet.
                  'id': 'cust-local-pending',
                  'tenantId': 'tenant-1',
                  'name': 'Cliente Express Local',
                  'phone': '5555999999',
                  'pointsBalance': 999.0,
                  'isActive': true,
                },
                {
                  'id': 'cust-synced',
                  'tenantId': 'tenant-1',
                  'name': 'Cliente Sincronizado',
                  'pointsBalance': 77.0,
                  'isActive': true,
                },
              ],
            },
          };

          await syncServiceWithDb.pullInboundDeltas();

          // Unsynced ledger: LOCAL balance preserved, cloud 999 never applied.
          final pendingCustomer = await database.customerDao.getCustomerById(
            'cust-local-pending',
          );
          expect(pendingCustomer!.pointsBalance, 50.0);
          // Locally generated code preserved (absent from the cloud contract).
          expect(pendingCustomer.customerCode, 'LOCAL-001');
          // The row is still unsynced upstream: stamping 'synced' would claim
          // a push that never happened.
          expect(pendingCustomer.syncStatus, 'pending');
          // Cloud-authoritative synced attributes were merged.
          expect(pendingCustomer.phone, '5555999999');

          // No unsynced ledger: cloud balance wins, locally generated code
          // still preserved.
          final syncedCustomer = await database.customerDao.getCustomerById(
            'cust-synced',
          );
          expect(syncedCustomer!.pointsBalance, 77.0);
          expect(syncedCustomer.customerCode, 'LOCAL-002');
          expect(syncedCustomer.syncStatus, 'synced');
        } finally {
          await database.close();
        }
      },
    );
  });
}

/// A package-info platform whose read always fails, standing in for the real
/// platform channel being unavailable (decision 30's fail-closed condition).
class _FailingPackageInfoPlatform extends PackageInfoPlatform {
  @override
  Future<PackageInfoData> getAll({String? baseUrl}) async {
    throw StateError('platform read unavailable');
  }
}
