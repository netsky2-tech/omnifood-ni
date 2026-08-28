import 'dart:async';
import 'dart:convert';
import 'dart:developer' as developer;
import 'dart:io';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:dio/dio.dart';
import '../../domain/repositories/audit_repository.dart';
import '../../domain/repositories/sales/sales_repository.dart';
import '../../domain/models/inventory/inventory_movement.dart';
import '../../domain/repositories/inventory/inventory_repository.dart';
import '../../domain/models/inventory/purchase.dart';
import '../../domain/models/inventory/count_session_document.dart';
import '../../domain/models/inventory/forensic_alert.dart';
import '../../domain/models/inventory/recipe_version_document.dart';
import '../../domain/models/inventory/production_order_document.dart';
import '../database/app_database.dart';
import '../models/inventory/product_entity.dart';
import '../models/catalog/catalog_value_entity.dart';
import '../models/inventory/insumo_entity.dart';
import '../models/inventory/recipe_entity.dart';
import '../models/user_entity.dart';
import '../models/security_profile_entity.dart';
import '../models/local_config_entity.dart';
import 'network_connectivity_service.dart';

const Map<String, String> syncRole = {
  'EDGE_SERVER': 'EDGE_SERVER',
  'STANDALONE': 'STANDALONE',
};

typedef SyncRole = String;

enum CloudSyncStatus {
  idle,
  syncing,
  offline,
  error,
  success,
}

class InboundSyncResult {
  final int productsCount;
  final int catalogValuesCount;
  final int insumosCount;
  final int recipesCount;
  final int usersCount;
  final String timestamp;

  const InboundSyncResult({
    this.productsCount = 0,
    this.catalogValuesCount = 0,
    this.insumosCount = 0,
    this.recipesCount = 0,
    this.usersCount = 0,
    required this.timestamp,
  });
}

enum SyncRunStatus { complete, partial, failed }

class SyncRunOutcome {
  const SyncRunOutcome(this.status);

  const SyncRunOutcome.complete() : this(SyncRunStatus.complete);
  const SyncRunOutcome.partial() : this(SyncRunStatus.partial);
  const SyncRunOutcome.failed() : this(SyncRunStatus.failed);

  final SyncRunStatus status;
}

class SyncService {
  final AuditRepository _auditRepository;
  // ignore: unused_field
  final SalesRepository _salesRepository;
  final InventoryRepository _inventoryRepository;
  final Dio _dio;
  static const int _batchEnvelopeLimit = 500;
  final SyncRole _role;
  final AppDatabase? _database;
  final NetworkConnectivityService? _connectivityService;

  final StreamController<InboundSyncResult> _inboundSyncController =
      StreamController<InboundSyncResult>.broadcast();

  Stream<InboundSyncResult> get onInboundSync => _inboundSyncController.stream;

  final StreamController<CloudSyncStatus> _statusController =
      StreamController<CloudSyncStatus>.broadcast();

  Stream<CloudSyncStatus> get onStatusChanged => _statusController.stream;

  CloudSyncStatus _status = CloudSyncStatus.idle;
  CloudSyncStatus get status => _status;

  DateTime? _lastSyncTime;
  DateTime? get lastSyncTime => _lastSyncTime;

  String? _lastSyncError;
  String? get lastSyncError => _lastSyncError;

  int _consecutiveFailures = 0;
  int get consecutiveFailures => _consecutiveFailures;

  Timer? _timer;
  StreamSubscription<bool>? _connectivitySubscription;
  bool _isSyncing = false;

  SyncService(
    this._auditRepository,
    this._salesRepository,
    this._inventoryRepository,
    this._dio, {
    SyncRole role = 'STANDALONE',
    AppDatabase? database,
    NetworkConnectivityService? connectivityService,
  })  : _role = role,
        _database = database,
        _connectivityService = connectivityService;

  void _updateStatus(CloudSyncStatus newStatus) {
    if (_status != newStatus) {
      _status = newStatus;
      if (!_statusController.isClosed) {
        _statusController.add(newStatus);
      }
    }
  }

  void start() {
    // Listen to network transitions for immediate auto-sync
    _connectivitySubscription?.cancel();
    if (_connectivityService != null) {
      _connectivitySubscription =
          _connectivityService!.onConnectivityChanged.listen((isOnline) {
        if (isOnline) {
          developer.log(
            'Network recovered! Triggering automatic sync...',
            name: 'SyncService',
          );
          triggerManualSync();
        } else {
          _updateStatus(CloudSyncStatus.offline);
        }
      });
    }

    // Sync every 5 minutes
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(minutes: 5), (_) async {
      await triggerManualSync();
    });
    developer.log('SyncService started', name: 'SyncService');
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
    _connectivitySubscription?.cancel();
    _connectivitySubscription = null;
    developer.log('SyncService stopped', name: 'SyncService');
  }

  void dispose() {
    stop();
    _inboundSyncController.close();
    _statusController.close();
  }

  Duration getNextBackoffDelay() {
    if (_consecutiveFailures == 0) return Duration.zero;
    final seconds = min(300, (pow(2, _consecutiveFailures - 1) * 5).toInt());
    return Duration(seconds: seconds);
  }

  Future<int> getPendingOutboxCount() async {
    int count = 0;
    try {
      final sales = await _salesRepository.getUnsyncedAggregates();
      count += sales.length;
    } catch (_) {}

    try {
      final purchases = await _inventoryRepository.getUnsyncedPurchases();
      count += purchases.length;
    } catch (_) {}

    try {
      final counts =
          await _inventoryRepository.getUnsyncedCountSessionDocuments();
      count += counts.length;
    } catch (_) {}

    try {
      final recipes =
          await _inventoryRepository.getUnsyncedRecipeVersionDocuments();
      count += recipes.length;
    } catch (_) {}

    try {
      final orders =
          await _inventoryRepository.getUnsyncedProductionOrders();
      count += orders.length;
    } catch (_) {}

    try {
      final alerts = await _inventoryRepository.getUnsyncedForensicAlerts();
      count += alerts.length;
    } catch (_) {}

    try {
      final movements = await _inventoryRepository.getUnsyncedMovements();
      count += movements.length;
    } catch (_) {}

    return count;
  }

  Future<SyncRunOutcome> triggerManualSync() async {
    if (_isSyncing) return const SyncRunOutcome.partial();

    _isSyncing = true;
    _updateStatus(CloudSyncStatus.syncing);

    final List<String> domainErrors = [];

    try {
      developer.log('Starting sync pass with fault isolation...', name: 'SyncService');

      var auditOutcome = const AuditSyncOutcome.retryable(failedStreams: 1);
      var hasFailure = !await _runDomain('audit', () async {
        auditOutcome = await _auditRepository.syncLogs();
      });
      hasFailure |= auditOutcome.status != AuditSyncStatus.complete;
      if (hasFailure) domainErrors.add('AuditLogs');

      // 1b. Sync fiscal sales documents, including offline credit notes, before
      // inventory movements so backend replay sees sale -> credit-note ordering.
      final salesSuccess = await _runDomain('sales', _syncSalesDocuments);
      if (!salesSuccess) {
        hasFailure = true;
        domainErrors.add('Sales');
      }

      // 2. Sync inventory outbox deltas
      var productionLinkedMovementIds = const <String>{};
      final purchaseSuccess = await _runDomain('purchase', _syncPurchaseDocuments);
      if (!purchaseSuccess) {
        hasFailure = true;
        domainErrors.add('Purchase');
      }
      final recipeSuccess = await _runDomain('recipe', _syncRecipeVersionDocuments);
      if (!recipeSuccess) {
        hasFailure = true;
        domainErrors.add('Recipe');
      }
      final prodSuccess = await _runDomain('production', () async {
        productionLinkedMovementIds = await _syncProductionOrderDocuments();
      });
      if (!prodSuccess) {
        hasFailure = true;
        domainErrors.add('Production');
      }
      final countSuccess = await _runDomain('count', _syncCountSessionDocuments);
      if (!countSuccess) {
        hasFailure = true;
        domainErrors.add('Count');
      }
      final alertLifeSuccess = await _runDomain('alert lifecycle', _syncAlertLifecycleDocuments);
      if (!alertLifeSuccess) {
        hasFailure = true;
        domainErrors.add('AlertLifecycle');
      }
      final kardexSuccess = await _runDomain('kardex corrections', _syncKardexCorrections);
      if (!kardexSuccess) {
        hasFailure = true;
        domainErrors.add('KardexCorrections');
      }
      final invOutboxSuccess = await _runDomain(
        'inventory',
        () => _syncInventoryOutbox(
          blockedMovementIds: productionLinkedMovementIds,
        ),
      );
      if (!invOutboxSuccess) {
        hasFailure = true;
        domainErrors.add('InventoryOutbox');
      }
      final alertInboxSuccess = await _runDomain('alert inbox', _refreshAlertInbox);
      if (!alertInboxSuccess) {
        hasFailure = true;
        domainErrors.add('AlertInbox');
      }

      // 3. Pull Master Catalog & Security Inbound Deltas
      final inboundSuccess = await _runDomain('inbound deltas', _pullInboundDeltas);
      if (!inboundSuccess) {
        hasFailure = true;
        domainErrors.add('InboundCatalog');
      }

      if (!hasFailure) {
        _consecutiveFailures = 0;
        _lastSyncTime = DateTime.now();
        _lastSyncError = null;
        _updateStatus(CloudSyncStatus.success);
        _updateStatus(CloudSyncStatus.idle);
        developer.log('Sync completed successfully', name: 'SyncService');
        return const SyncRunOutcome.complete();
      } else {
        _consecutiveFailures++;
        _lastSyncError = domainErrors.join('; ');
        _updateStatus(CloudSyncStatus.error);
        developer.log(
          'Sync completed partially; domain errors: $_lastSyncError',
          name: 'SyncService',
        );
        return const SyncRunOutcome.partial();
      }
    } catch (e, stackTrace) {
      _consecutiveFailures++;
      _lastSyncError = e.toString();
      _updateStatus(CloudSyncStatus.error);
      developer.log(
        'Fatal sync failure',
        name: 'SyncService',
        error: e,
        stackTrace: stackTrace,
      );
      return const SyncRunOutcome.failed();
    } finally {
      _isSyncing = false;
    }
  }

  Future<bool> _runDomain(
    String domain,
    Future<void> Function() operation,
  ) async {
    try {
      await operation();
      return true;
    } catch (error, stackTrace) {
      developer.log(
        'Sync $domain failed; later domains will continue.',
        name: 'SyncService',
        error: error,
        stackTrace: stackTrace,
      );
      return false;
    }
  }

  Future<void> _syncSalesDocuments() async {
    final aggregates = await _salesRepository.getUnsyncedAggregates();
    if (aggregates.isEmpty) return;

    final records = aggregates.map(_buildSalesRecord).toList(growable: false)
      ..sort((a, b) {
        final bySequence = (a['sourceSequence'] as int).compareTo(
          b['sourceSequence'] as int,
        );
        if (bySequence != 0) return bySequence;
        return (a['idempotencyKey'] as String).compareTo(
          b['idempotencyKey'] as String,
        );
      });
    final sentRecords = records
        .take(_batchEnvelopeLimit)
        .toList(growable: false);
    final response = await _dio.post(
      '/v1/sync/batch',
      data: {'records': sentRecords},
      options: Options(
        headers: {HttpHeaders.contentTypeHeader: 'application/json'},
      ),
    );
    if (response.statusCode == 200 || response.statusCode == 201) {
      final acceptedInvoiceIds = _acceptedSalesInvoiceIds(
        sentRecords,
        response.data,
      );
      if (acceptedInvoiceIds.isEmpty) return;
      await _salesRepository.markAsSynced(
        acceptedInvoiceIds,
      );
    }
  }

  List<String> _acceptedSalesInvoiceIds(
    List<Map<String, Object?>> sentRecords,
    dynamic responseData,
  ) {
    final resultsByKey = _parseSyncResults(responseData);
    if (resultsByKey.isEmpty) return const [];

    final acceptedInvoiceIds = <String>[];
    for (final record in sentRecords) {
      final invoiceId = record['invoiceId'];
      final idempotencyKey = record['idempotencyKey'];
      if (invoiceId is! String || idempotencyKey is! String) continue;
      final result = resultsByKey[idempotencyKey];
      if (result != null && result.shouldMarkSalesSynced(record)) {
        acceptedInvoiceIds.add(invoiceId);
      }
    }
    return acceptedInvoiceIds;
  }

  Map<String, Object?> _buildSalesRecord(Map<String, dynamic> aggregate) {
    final invoiceId = aggregate['id'];
    final documentType = aggregate['documentType'];
    final terminalId = aggregate['terminalId'] ?? _auditRepository.deviceId;
    final sourceSequence = aggregate['sourceSequence'];
    final idempotencyKey = aggregate['idempotencyKey'];

    if (invoiceId is! String || documentType is! String) {
      throw StateError('Sales aggregate is missing fiscal document identity.');
    }
    if (sourceSequence is! int || sourceSequence <= 0) {
      throw StateError(
        'Sales aggregate $invoiceId is missing deterministic sourceSequence.',
      );
    }
    if (idempotencyKey is! String || idempotencyKey.trim().isEmpty) {
      throw StateError('Sales aggregate $invoiceId is missing idempotencyKey.');
    }
    return {
      'invoiceId': invoiceId,
      'idempotencyKey': idempotencyKey,
      'terminalId': terminalId is String
          ? terminalId
          : _auditRepository.deviceId,
      'sourceDeviceId': terminalId is String
          ? terminalId
          : _auditRepository.deviceId,
      'flowType': 'sales',
      'sourceSequence': sourceSequence,
      'documentType': documentType,
      'invoice': aggregate,
    };
  }

  Future<void> _syncInventoryOutbox({
    Set<String> blockedMovementIds = const <String>{},
  }) async {
    final unsynced = (await _inventoryRepository.getUnsyncedMovements())
        .where(
          (movement) =>
              movement.type != MovementType.purchase &&
              !(movement.reason?.startsWith('COUNT_SESSION:') ?? false) &&
              !_isProductionLinkedMovement(movement) &&
              !_isCreditNoteRestockMovement(movement) &&
              !blockedMovementIds.contains(movement.id),
        )
        .toList(growable: false);
    if (unsynced.isEmpty) return;

    final replayCandidates = _orderByReplaySemantics(unsynced);
    final candidatesForSend = replayCandidates
        .take(_batchEnvelopeLimit)
        .toList(growable: false);
    final metadata = await _reserveMovementSyncMetadata(candidatesForSend);
    final metadataByMovementId = {
      for (final item in metadata) item.movementId: item,
    };
    final orderedBatch = _orderByReservedMetadata(
      candidatesForSend,
      metadataByMovementId,
    );

    try {
      final response = _role == syncRole['EDGE_SERVER']
          ? await _postBatchEnvelope(orderedBatch, metadataByMovementId)
          : await _postStandaloneDeltas(orderedBatch, metadataByMovementId);
      if (response.statusCode == 200 || response.statusCode == 201) {
        developer.log(
          'Synced ${orderedBatch.length} inventory deltas to cloud',
          name: 'SyncService',
        );
        await _applyInventorySyncResults(
          orderedBatch,
          metadataByMovementId,
          response.data,
        );
      }
    } on DioException catch (e) {
      developer.log('Failed to sync sales: ${e.message}', name: 'SyncService');
      await _markMovementsAsFailed(orderedBatch, error: e.message);
      rethrow;
    } catch (e, stackTrace) {
      developer.log(
        'Failed to build/post inventory outbox payload',
        name: 'SyncService',
        error: e,
        stackTrace: stackTrace,
      );
      await _markMovementsAsFailed(orderedBatch, error: e.toString());
      rethrow;
    }
  }

  bool _isProductionLinkedMovement(dynamic movement) {
    return _tryReadField(movement, 'sourceDocumentType') == 'PRODUCTION_CLOSE';
  }

  bool _isCreditNoteRestockMovement(dynamic movement) {
    return _tryReadField(movement, 'sourceDocumentType') ==
        'CREDIT_NOTE_RESTOCK';
  }

  Future<void> _syncPurchaseDocuments() async {
    final unsyncedPurchases = await _inventoryRepository.getUnsyncedPurchases();
    if (unsyncedPurchases.isEmpty) return;

    for (final purchase in unsyncedPurchases) {
      try {
        _assertPurchaseDocumentReady(purchase);
        final response = await _dio.post(
          '/inventory/purchases',
          data: _buildPurchasePayload(purchase),
        );

        if (response.statusCode == 200 || response.statusCode == 201) {
          await _inventoryRepository.markPurchaseAsSynced(purchase.id);
          await _inventoryRepository.markMovementAsSynced(purchase.id);
        }
      } on DioException catch (e) {
        developer.log(
          'Failed to sync purchase ${purchase.id}: ${e.message}',
          name: 'SyncService',
        );
        await _inventoryRepository.markMovementAsFailed(
          purchase.id,
          error: e.message,
        );
        rethrow;
      } catch (e, stackTrace) {
        developer.log(
          'Skipped purchase ${purchase.id}: $e',
          name: 'SyncService',
          error: e,
          stackTrace: stackTrace,
        );
        await _inventoryRepository.markMovementAsFailed(
          purchase.id,
          error: e.toString(),
        );
        rethrow;
      }
    }
  }

  void _assertPurchaseDocumentReady(Purchase purchase) {
    if (purchase.supplierId.trim().isEmpty) {
      throw StateError('Purchase ${purchase.id} is missing supplierId.');
    }

    if (purchase.invoiceNumber.trim().isEmpty) {
      throw StateError('Purchase ${purchase.id} is missing invoiceNumber.');
    }

    if (_requiresExplicitBcnRate(purchase) && purchase.bcnRate <= 0) {
      throw StateError(
        'Purchase ${purchase.id} is missing an explicit USD bcnRate.',
      );
    }
  }

  bool _requiresExplicitBcnRate(Purchase purchase) {
    return purchase.currency == 'USD' &&
        purchase.fxRateMode != purchaseFxRateModeOfficial;
  }

  Future<void> _syncRecipeVersionDocuments() async {
    final unsynced = await _inventoryRepository
        .getUnsyncedRecipeVersionDocuments();
    if (unsynced.isEmpty) {
      return;
    }

    for (final document in unsynced) {
      try {
        final response = await _dio.post(
          '/inventory/recipes/versions',
          data: _buildRecipeVersionPayload(document),
        );
        if (response.statusCode == 200 || response.statusCode == 201) {
          await _inventoryRepository.markRecipeVersionDocumentAsSynced(
            document.id,
          );
        }
      } on DioException catch (e) {
        developer.log(
          'Failed to sync recipe version ${document.id}: ${e.message}',
          name: 'SyncService',
        );
        rethrow;
      }
    }
  }

  Future<Set<String>> _syncProductionOrderDocuments() async {
    final unsynced = await _inventoryRepository.getUnsyncedProductionOrders();
    if (unsynced.isEmpty) {
      return const <String>{};
    }

    final linkedMovementIds = unsynced
        .expand((document) => document.movementReferences)
        .toSet();

    for (final document in unsynced) {
      try {
        final response = await _dio.post(
          '/inventory/production-orders/close',
          data: _buildProductionOrderPayload(document),
        );
        if (response.statusCode == 200 || response.statusCode == 201) {
          for (final movementId in document.movementReferences) {
            await _inventoryRepository.markMovementAsSynced(movementId);
          }
          await _inventoryRepository.markProductionOrderDocumentAsSynced(
            document.id,
          );
        }
      } on DioException catch (e) {
        developer.log(
          'Failed to sync production order ${document.id}: ${e.message}',
          name: 'SyncService',
        );
        await _markMovementIdsAsFailed(
          document.movementReferences,
          error: e.message,
        );
        rethrow;
      }
    }
    return linkedMovementIds;
  }

  Future<void> _syncCountSessionDocuments() async {
    final unsynced = await _inventoryRepository
        .getUnsyncedCountSessionDocuments();
    if (unsynced.isEmpty) {
      return;
    }

    for (final document in unsynced) {
      try {
        final response = await _dio.post(
          '/inventory/count-sessions',
          data: _buildCountSessionPayload(document),
        );
        if (response.statusCode == 200 || response.statusCode == 201) {
          await _inventoryRepository.markCountSessionDocumentAsSynced(
            document.id,
          );
          for (final movementId in document.movementReferences) {
            await _inventoryRepository.markMovementAsSynced(movementId);
          }
        }
      } on DioException catch (e) {
        developer.log(
          'Failed to sync count session ${document.id}: ${e.message}',
          name: 'SyncService',
        );
        await _markMovementIdsAsFailed(
          document.movementReferences,
          error: e.message,
        );
        rethrow;
      }
    }
  }

  Future<void> _markMovementsAsFailed(
    Iterable<dynamic> movements, {
    String? error,
  }) async {
    for (final movement in movements) {
      await _inventoryRepository.markMovementAsFailed(
        movement.id,
        error: error,
      );
    }
  }

  Future<void> _markMovementIdsAsFailed(
    Iterable<String> movementIds, {
    String? error,
  }) async {
    for (final movementId in movementIds) {
      await _inventoryRepository.markMovementAsFailed(movementId, error: error);
    }
  }

  Future<void> _syncAlertLifecycleDocuments() async {
    final unsynced = await _inventoryRepository.getUnsyncedForensicAlerts();
    if (unsynced.isEmpty) {
      return;
    }

    for (final alert in unsynced) {
      try {
        final response = await _dio.post(
          '/inventory/alerts/${alert.id}/lifecycle',
          data: _buildAlertLifecyclePayload(alert),
        );
        if (response.statusCode == 200 || response.statusCode == 201) {
          await _inventoryRepository.markForensicAlertAsSynced(alert.id);
        }
      } on DioException catch (e) {
        developer.log(
          'Failed to sync alert lifecycle ${alert.id}: ${e.message}',
          name: 'SyncService',
        );
        rethrow;
      }
    }
  }

  Future<void> _refreshAlertInbox() async {
    try {
      final response = await _dio.get('/inventory/alerts');
      final payload = response.data;
      final alertsPayload = payload is Map<String, dynamic>
          ? payload['alerts'] as List<dynamic>? ?? const <dynamic>[]
          : payload is List<dynamic>
              ? payload
              : const <dynamic>[];

      for (final row in alertsPayload) {
        if (row is! Map) continue;
        final map = Map<String, dynamic>.from(row);
        final id = map['id']?.toString();
        if (id == null || id.isEmpty) continue;
        await _inventoryRepository.saveForensicAlert(
          ForensicAlert(
            id: id,
            alertType: (map['alertType'] ?? map['alert_type'] ?? 'SYSTEM_ALERT').toString(),
            severity: (map['severity'] ?? 'MEDIUM').toString(),
            message: (map['message'] ?? '').toString(),
            createdAt: map['createdAt'] != null
                ? DateTime.tryParse(map['createdAt'].toString()) ?? DateTime.now()
                : DateTime.now(),
            status: (map['status'] ?? 'active').toString(),
            note: map['note']?.toString(),
            actorLabel: (map['actorLabel'] ?? map['actor_role'])?.toString(),
            actedAt: map['actedAt'] != null
                ? DateTime.tryParse(map['actedAt'].toString())
                : null,
            sourceMovementId: map['sourceMovementId']?.toString(),
            sourceDocumentId: map['sourceDocumentId']?.toString(),
            sourceDocumentType: map['sourceDocumentType']?.toString(),
            isSynced: true,
          ),
        );
      }
    } on DioException catch (e) {
      developer.log(
        'Failed to refresh forensic alerts: ${e.message}',
        name: 'SyncService',
      );
      // Non-blocking for offline continuity
    }
  }

  Map<String, Object?> _buildPurchasePayload(Purchase purchase) {
    final payload = <String, Object?>{
      'id': purchase.id,
      'insumoId': purchase.insumoId,
      'supplierId': purchase.supplierId,
      'invoiceNumber': purchase.invoiceNumber,
      'quantity': purchase.quantity,
      'unitCost': purchase.unitCost,
      'invoiceDate': purchase.invoiceDate.toIso8601String().split('T').first,
      'entryTimestamp': purchase.timestamp.toUtc().toIso8601String(),
      'currency': purchase.currency,
    };

    if (purchase.fiscalAuthorizationCode != null &&
        purchase.fiscalAuthorizationCode!.trim().isNotEmpty) {
      payload['fiscalAuthorizationCode'] =
          purchase.fiscalAuthorizationCode!.trim();
    }

    if (purchase.fxRateMode != null &&
        purchase.fxRateMode!.trim().isNotEmpty) {
      payload['fxRateMode'] = purchase.fxRateMode!.trim();
    }

    if (_requiresExplicitBcnRate(purchase)) {
      payload['bcnRate'] = purchase.bcnRate;
    }

    if (purchase.lotCode != null && purchase.lotCode!.trim().isNotEmpty) {
      payload['lotCode'] = purchase.lotCode!.trim();
    }

    if (purchase.receivedDate != null) {
      payload['receivedDate'] = purchase.receivedDate!.toIso8601String();
    }

    if (purchase.expirationDate != null) {
      payload['expirationDate'] = purchase.expirationDate!.toIso8601String();
    }

    return payload;
  }

  Map<String, Object?> _buildRecipeVersionPayload(
    RecipeVersionDocument document,
  ) {
    return {
      'id': document.id,
      'productId': document.productId,
      'productName': document.productName,
      'versionNumber': document.versionNumber,
      'yieldQuantity': document.yieldQuantity,
      'technicalShrinkPct': document.technicalShrinkPct,
      'versionNote': document.versionNote,
      'createdAt': document.createdAt.toIso8601String(),
      'publishedAt': document.publishedAt?.toIso8601String(),
      'components': document.components
          .map(
            (component) => {
              'ingredientId': component.ingredientId,
              'ingredientName': component.ingredientName,
              'ingredientType': component.ingredientType,
              'grossQuantity': component.grossQuantity,
              'technicalShrinkPct': component.technicalShrinkPct,
              'referenceVersionId': component.referenceVersionId,
              'componentUom': component.componentUom ?? 'UND',
            },
          )
          .toList(growable: false),
    };
  }

  Map<String, Object?> _buildProductionOrderPayload(
    ProductionOrderDocument document,
  ) {
    return {
      'id': document.id,
      'recipeVersionId': document.recipeVersionId,
      'producedInsumoId': document.producedInsumoId,
      'producedBatchNumber': document.producedBatchNumber,
      'producedExpirationDate': document.producedExpirationDate
          .toIso8601String(),
      'plannedQuantity': document.plannedQuantity,
      'actualQuantity': document.actualQuantity,
      'outcome': document.outcome,
      'failureReason': document.failureReason,
      'terminalId': document.terminalId,
      'sourceSequence': document.sourceSequence,
      'idempotencyKey': document.idempotencyKey,
      'payloadHash': document.payloadHash,
      'totalConsumedCostNio': document.totalConsumedCostNio,
      'producedUnitCostNio': document.producedUnitCostNio,
      'varianceReason': document.varianceReason,
      'operationDate': document.operationDate.toIso8601String(),
      'movementReferences': document.movementReferences,
    };
  }

  Map<String, Object?> _buildCountSessionPayload(
    CountSessionDocument document,
  ) {
    return {
      'id': document.id,
      'warehouseId': document.warehouseId,
      'warehouseName': document.warehouseName,
      'cutoffAt': document.cutoffAt.toIso8601String(),
      'status': document.status,
      'createdAt': document.createdAt.toIso8601String(),
      'updatedAt': document.updatedAt.toIso8601String(),
      'postedAt': document.postedAt?.toIso8601String(),
      'notes': document.notes,
      'movementReferences': document.movementReferences,
      'lines': document.lines
          .map(
            (line) => {
              'id': line.id,
              'insumoId': line.insumoId,
              'insumoName': line.insumoName,
              'uom': line.uom,
              'theoreticalQuantity': line.theoreticalQuantity,
              'approvedEntryIndex': line.approvedEntryIndex,
              'entries': line.entries
                  .map(
                    (entry) => {
                      'countedQuantity': entry.countedQuantity,
                      'countedAt': entry.countedAt?.toIso8601String(),
                      'notes': entry.notes,
                      'actorLabel': entry.actorLabel,
                      'disputed': entry.disputed,
                    },
                  )
                  .toList(growable: false),
            },
          )
          .toList(growable: false),
    };
  }

  Map<String, Object?> _buildAlertLifecyclePayload(ForensicAlert alert) {
    return {
      'status': alert.status,
      'actorLabel': alert.actorLabel,
      'note': alert.note,
      'actedAt':
          alert.actedAt?.toIso8601String() ?? alert.createdAt.toIso8601String(),
    };
  }

  Future<Response<dynamic>> _postBatchEnvelope(
    List<dynamic> unsynced,
    Map<String, MovementSyncMetadata> metadataByMovementId,
  ) {
    final envelope = _buildBatchEnvelope(unsynced, metadataByMovementId);
    return _dio.post(
      '/v1/sync/batch',
      data: gzip.encode(utf8.encode(jsonEncode(envelope))),
      options: Options(
        headers: {
          HttpHeaders.contentTypeHeader: 'application/json',
          HttpHeaders.contentEncodingHeader: 'gzip',
        },
      ),
    );
  }

  Future<Response<dynamic>> _postStandaloneDeltas(
    List<dynamic> unsynced,
    Map<String, MovementSyncMetadata> metadataByMovementId,
  ) {
    final records = _buildBatchEnvelope(
      unsynced,
      metadataByMovementId,
    )['records'];
    return _dio.post(
      '/v1/sync/batch',
      data: {'records': records},
      options: Options(
        headers: {HttpHeaders.contentTypeHeader: 'application/json'},
      ),
    );
  }

  static const String _inventoryFlowType = 'inventory';

  Map<String, Object> _buildBatchEnvelope(
    List<dynamic> unsynced, [
    Map<String, MovementSyncMetadata> metadataByMovementId = const {},
  ]) {
    final records = unsynced.take(_batchEnvelopeLimit).toList(growable: false);

    final mappedRecords = records
        .asMap()
        .entries
        .map((entry) {
          final index = entry.key;
          final movement = entry.value;
          final movementId = movement.id.toString();
          final movementType = _enumName(movement.type).toUpperCase();
          final syncMetadata = metadataByMovementId[movementId];
          final terminalId =
              syncMetadata?.terminalId ?? _auditRepository.deviceId;
          final flowType = syncMetadata?.flowType ?? _inventoryFlowType;
          final sourceSequence =
              syncMetadata?.localSequence ??
              _resolveSourceSequence(movement, fallbackSequence: index + 1);
          final idempotencyKey =
              syncMetadata?.idempotencyKey ??
              '$flowType:$terminalId:$movementId';

          return {
            'idempotencyKey': idempotencyKey,
            'terminalId': terminalId,
            'sourceDeviceId': terminalId,
            'flowType': flowType,
            'sourceSequence': sourceSequence,
            'documentType': movementType,
            'movements': [
              {
                'insumoId': movement.insumoId,
                'quantity': movement.quantity,
                ..._valuationFields(movement),
              },
            ],
          };
        })
        .toList(growable: false);

    return {'records': mappedRecords};
  }

  int _resolveSourceSequence(
    dynamic movement, {
    required int fallbackSequence,
  }) {
    final persistedSequence =
        _tryReadField(movement, 'sourceSequence') ??
        _tryReadField(movement, 'localSequence');
    if (persistedSequence is int) {
      return persistedSequence;
    }
    if (persistedSequence is String) {
      return int.tryParse(persistedSequence) ?? fallbackSequence;
    }
    return fallbackSequence;
  }

  List<dynamic> _orderByReplaySemantics(List<dynamic> unsynced) {
    final indexed = unsynced
        .asMap()
        .entries
        .map(
          (entry) => _OrderedMovement(
            movement: entry.value,
            originalIndex: entry.key,
            sequence: _tryParsePersistedSequence(entry.value),
          ),
        )
        .toList(growable: false);

    final hasPersistedSequence = indexed.any((entry) => entry.sequence != null);
    if (!hasPersistedSequence) {
      return unsynced;
    }

    indexed.sort((a, b) {
      final aSeq = a.sequence;
      final bSeq = b.sequence;
      if (aSeq != null && bSeq != null) {
        final bySeq = aSeq.compareTo(bSeq);
        if (bySeq != 0) return bySeq;
      }
      if (aSeq != null) return -1;
      if (bSeq != null) return 1;
      return a.originalIndex.compareTo(b.originalIndex);
    });

    return indexed.map((entry) => entry.movement).toList(growable: false);
  }

  List<dynamic> _orderByReservedMetadata(
    List<dynamic> movements,
    Map<String, MovementSyncMetadata> metadataByMovementId,
  ) {
    final indexed = movements
        .asMap()
        .entries
        .map(
          (entry) => _OrderedMovement(
            movement: entry.value,
            originalIndex: entry.key,
            sequence:
                metadataByMovementId[entry.value.id.toString()]?.localSequence,
          ),
        )
        .toList(growable: false);

    indexed.sort((a, b) {
      final aSeq = a.sequence;
      final bSeq = b.sequence;
      if (aSeq != null && bSeq != null) {
        final bySeq = aSeq.compareTo(bSeq);
        if (bySeq != 0) return bySeq;
      }
      if (aSeq != null) return -1;
      if (bSeq != null) return 1;
      return a.originalIndex.compareTo(b.originalIndex);
    });

    return indexed.map((entry) => entry.movement).toList(growable: false);
  }

  int? _tryParsePersistedSequence(dynamic movement) {
    final persistedSequence =
        _tryReadField(movement, 'sourceSequence') ??
        _tryReadField(movement, 'localSequence');
    if (persistedSequence is int) {
      return persistedSequence;
    }
    if (persistedSequence is String) {
      return int.tryParse(persistedSequence);
    }
    return null;
  }

  String _enumName(dynamic value) {
    try {
      return value.name as String;
    } catch (_) {
      return value.toString().split('.').last;
    }
  }

  Map<String, Object> _valuationFields(dynamic movement) {
    final unitCostNio = _tryReadField(movement, 'unitCostNio');
    final sourceDocumentType = _tryReadField(movement, 'sourceDocumentType');
    final sourceDocumentId = _tryReadField(movement, 'sourceDocumentId');

    final fields = <String, Object>{};
    if (unitCostNio != null) {
      fields['unitCostNio'] = unitCostNio;
    }
    if (sourceDocumentType != null) {
      fields['sourceDocumentType'] = sourceDocumentType;
    }
    if (sourceDocumentId != null) {
      fields['sourceDocumentId'] = sourceDocumentId;
    }
    return fields;
  }

  dynamic _tryReadField(dynamic target, String fieldName) {
    if (target is Map<String, dynamic>) {
      return target[fieldName];
    }
    try {
      switch (fieldName) {
        case 'sourceSequence':
          return target.sourceSequence;
        case 'localSequence':
          return target.localSequence;
        case 'unitCostNio':
          return target.unitCostNio;
        case 'sourceDocumentType':
          return target.sourceDocumentType;
        case 'sourceDocumentId':
          return target.sourceDocumentId;
        case 'timestamp':
          return target.timestamp;
        case 'id':
          return target.id;
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  @visibleForTesting
  Map<String, Object> buildOrderedBatchEnvelopeForTest(List<dynamic> unsynced) {
    return _buildBatchEnvelope(_orderByReplaySemantics(unsynced));
  }

  Future<void> _applyInventorySyncResults(
    List<dynamic> ordered,
    Map<String, MovementSyncMetadata> metadataByMovementId,
    dynamic responseData,
  ) async {
    final resultsByKey = _parseSyncResults(responseData);

    for (final movement in ordered) {
      final movementId = movement.id.toString();
      final metadata = metadataByMovementId[movementId];
      final result = resultsByKey[metadata?.idempotencyKey];
      if (metadata == null || result == null) {
        await _recordMovementRetryState(
          movementId,
          resultCode: 'MISSING_RESULT',
          error: 'Backend did not return a result for movement $movementId',
        );
        continue;
      }

      if (result.shouldMarkSynced(metadata)) {
        await _inventoryRepository.markMovementAsSynced(movementId);
      } else {
        await _recordMovementRetryState(
          movementId,
          resultCode: result.code ?? result.status,
          error: result.message,
        );
      }
    }
  }

  Future<List<MovementSyncMetadata>> _reserveMovementSyncMetadata(
    List<dynamic> ordered,
  ) async {
    final repository = _inventoryRepository;
    if (repository is InventorySyncMetadataRepository) {
      return (repository as InventorySyncMetadataRepository)
          .reserveMovementSyncMetadata(
            ordered
                .map((movement) => movement.id.toString())
                .toList(growable: false),
            terminalId: _auditRepository.deviceId,
            flowType: _inventoryFlowType,
          );
    }

    return ordered
        .asMap()
        .entries
        .map((entry) {
          final movementId = entry.value.id.toString();
          return MovementSyncMetadata(
            movementId: movementId,
            terminalId: _auditRepository.deviceId,
            flowType: _inventoryFlowType,
            localSequence: entry.key + 1,
            idempotencyKey:
                '$_inventoryFlowType:${_auditRepository.deviceId}:$movementId',
          );
        })
        .toList(growable: false);
  }

  Future<void> _recordMovementRetryState(
    String movementId, {
    required String resultCode,
    String? error,
  }) async {
    final repository = _inventoryRepository;
    if (repository is InventorySyncMetadataRepository) {
      await (repository as InventorySyncMetadataRepository)
          .recordMovementRetryState(
            movementId,
            resultCode: resultCode,
            error: error,
          );
      return;
    }
    await _inventoryRepository.markMovementAsFailed(
      movementId,
      error: error ?? resultCode,
    );
  }

  Map<String, _SyncBatchResultItem> _parseSyncResults(dynamic responseData) {
    if (responseData is! Map) return const {};
    final rawResults = responseData['results'];
    if (rawResults is! List) return const {};

    final parsed = <String, _SyncBatchResultItem>{};
    for (final raw in rawResults) {
      if (raw is! Map) continue;
      final result = _SyncBatchResultItem.tryFromJson(
        Map<String, dynamic>.from(raw),
      );
      if (result == null) continue;
      parsed[result.idempotencyKey] = result;
    }
    return parsed;
  }

  Future<void> _syncKardexCorrections() async {
    final corrections = await _inventoryRepository.getKardexCorrections();
    if (corrections.isEmpty) return;

    final payload = {
      'corrections': corrections
          .map((c) => {
                'id': c.id,
                'insumoId': c.insumoId,
                'originMovementId': c.originMovementId,
                'triggerMovementId': c.triggerMovementId,
                'previousUnitCostNio': c.previousUnitCostNio,
                'recalculatedUnitCostNio': c.recalculatedUnitCostNio,
                'deltaUnitCostNio': c.deltaUnitCostNio,
                'totalDeltaCostNio': c.totalDeltaCostNio,
                'affectedQuantity': c.affectedQuantity,
                'lineageHash': c.lineageHash,
                'authorizedByUserId': c.authorizedByUserId,
                'authorizedByRole': c.authorizedByRole,
                'authorizationMethod': c.authorizationMethod,
                'createdAt': c.createdAt,
              })
          .toList(growable: false),
    };

    try {
      final response = await _dio.post(
        '/inventory/regularization/sync',
        data: payload,
      );
      if (response.statusCode == 200 || response.statusCode == 201) {
        developer.log(
          'Synced ${corrections.length} kardex corrections to cloud',
          name: 'SyncService',
        );
      }
    } on DioException catch (e) {
      developer.log(
        'Failed to sync kardex corrections: ${e.message}',
        name: 'SyncService',
      );
    }
  }

  Future<InboundSyncResult?> pullInboundDeltas() => _pullInboundDeltas();

  Future<InboundSyncResult?> _pullInboundDeltas() async {
    if (_database == null) return null;

    try {
      final lastSyncConfig = await _database!.localConfigDao.getConfigByKey(
        'last_inbound_sync_version',
      );
      final sinceVersion = lastSyncConfig?.value;

      final queryParams = <String, dynamic>{
        if (sinceVersion != null && sinceVersion.trim().isNotEmpty)
          'sinceVersion': sinceVersion.trim(),
        'terminalId': _auditRepository.deviceId,
      };

      final response = await _dio.get(
        '/v1/sync/inbound/deltas',
        queryParameters: queryParams,
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        final data = response.data;
        if (data is! Map) return null;

        final rawDeltas = data['deltas'];
        if (rawDeltas is! Map) return null;

        // 1. Products
        final rawProducts =
            rawDeltas['products'] as List<dynamic>? ?? const [];
        final productEntities = rawProducts.map((p) {
          final map = Map<String, dynamic>.from(p as Map);
          return ProductEntity(
            id: map['id'] as String,
            name: map['name'] as String,
            uom: map['uom'] as String? ?? 'UND',
            stock: (map['stock'] as num?)?.toDouble() ?? 0.0,
            averageCost: (map['averageCost'] as num?)?.toDouble() ?? 0.0,
            sellPrice: (map['sellPrice'] as num?)?.toDouble() ?? 0.0,
            isActive: map['isActive'] as bool? ?? true,
            isPrepared: false,
            createdAt: map['createdAt']?.toString(),
          );
        }).toList(growable: false);

        if (productEntities.isNotEmpty) {
          await _database!.productDao.insertProducts(productEntities);
        }

        // 2. Catalog Values
        final rawCatalogValues =
            rawDeltas['catalogValues'] as List<dynamic>? ?? const [];
        final catalogEntities = rawCatalogValues.map((c) {
          final map = Map<String, dynamic>.from(c as Map);
          return CatalogValueEntity(
            id: map['id'] as String,
            catalogType: map['catalogType'] as String,
            code: map['code'] as String,
            name: map['name'] as String,
            isActive: map['isActive'] as bool? ?? true,
            sortOrder: (map['sortOrder'] as num?)?.toInt() ?? 0,
          );
        }).toList(growable: false);

        if (catalogEntities.isNotEmpty) {
          await _database!.catalogValueDao.insertCatalogValues(catalogEntities);
        }

        // 3. Insumos
        final rawInsumos = rawDeltas['insumos'] as List<dynamic>? ?? const [];
        final insumoEntities = rawInsumos.map<InsumoEntity>((i) {
          final map = Map<String, dynamic>.from(i as Map);
          return InsumoEntity(
            id: map['id'] as String,
            name: map['name'] as String,
            consumptionUom: (map['consumptionUom'] ?? map['purchaseUom']) as String? ?? 'UND',
            stock: (map['stock'] as num?)?.toDouble() ?? 0.0,
            averageCost: (map['averageCost'] as num?)?.toDouble() ?? 0.0,
            isActive: map['isActive'] as bool? ?? true,
            isPerishable: map['isPerishable'] as bool? ?? false,
          );
        }).toList(growable: false);

        if (insumoEntities.isNotEmpty) {
          await _database!.insumoDao.insertInsumos(insumoEntities);
        }

        // 4. Recipes
        final rawRecipes = rawDeltas['recipes'] as List<dynamic>? ?? const [];
        final recipeEntities = rawRecipes.map((r) {
          final map = Map<String, dynamic>.from(r as Map);
          return RecipeEntity(
            id: map['id'] as String,
            productId: map['productId'] as String,
            ingredientId: map['ingredientId'] as String,
            ingredientType: map['ingredientType'] as String? ?? 'INSUMO',
            quantity: (map['quantity'] as num?)?.toDouble() ?? 0.0,
          );
        }).toList(growable: false);

        if (recipeEntities.isNotEmpty) {
          await _database!.recipeDao.insertRecipes(recipeEntities);
        }

        // 5. Users & Security Profiles
        final rawUsers = rawDeltas['users'] as List<dynamic>? ?? const [];
        final userEntities = <UserEntity>[];
        final profileEntities = <SecurityProfileEntity>[];

        for (final u in rawUsers) {
          final map = Map<String, dynamic>.from(u as Map);
          final userId = map['id'] as String;
          final secProfile = map['securityProfile'] as Map<String, dynamic>?;
          final pinHash = (secProfile?['pinHash'] as String?) ?? '';

          userEntities.add(
            UserEntity(
              id: userId,
              name: map['name'] as String,
              role: map['role'] as String,
              pinHash: pinHash,
              isActive: map['isActive'] as bool? ?? true,
              email: map['email'] as String?,
            ),
          );

          if (secProfile != null) {
            profileEntities.add(
              SecurityProfileEntity(
                userId: userId,
                pinHash: pinHash.isNotEmpty ? pinHash : null,
                isPinEnabled: secProfile['isPinEnabled'] as bool? ?? true,
                isTotpEnabled: secProfile['isTotpEnabled'] as bool? ?? false,
              ),
            );
          }
        }

        if (userEntities.isNotEmpty) {
          await _database!.userDao.insertUsers(userEntities);
        }
        if (profileEntities.isNotEmpty) {
          await _database!.securityProfileDao.insertProfiles(profileEntities);
        }

        // Update local sync watermark version
        final currentVersion = data['currentVersion'];
        if (currentVersion != null) {
          await _database!.localConfigDao.saveConfig(
            LocalConfigEntity(
              key: 'last_inbound_sync_version',
              value: currentVersion.toString(),
            ),
          );
        }

        final result = InboundSyncResult(
          productsCount: productEntities.length,
          catalogValuesCount: catalogEntities.length,
          insumosCount: insumoEntities.length,
          recipesCount: recipeEntities.length,
          usersCount: userEntities.length,
          timestamp:
              data['serverTime']?.toString() ??
              DateTime.now().toIso8601String(),
        );

        if (!_inboundSyncController.isClosed) {
          _inboundSyncController.add(result);
        }
        return result;
      }
    } on DioException catch (e) {
      developer.log(
        'Failed to pull inbound catalog deltas: ${e.message}',
        name: 'SyncService',
      );
      rethrow;
    } catch (e, stackTrace) {
      developer.log(
        'Error pulling inbound catalog deltas',
        name: 'SyncService',
        error: e,
        stackTrace: stackTrace,
      );
      rethrow;
    }
    return null;
  }
}

class _SyncBatchResultItem {
  const _SyncBatchResultItem({
    required this.idempotencyKey,
    required this.terminalId,
    required this.flowType,
    required this.sourceSequence,
    required this.status,
    this.code,
    this.message,
  });

  final String idempotencyKey;
  final String terminalId;
  final String flowType;
  final int sourceSequence;
  final String status;
  final String? code;
  final String? message;

  static _SyncBatchResultItem? tryFromJson(Map<String, dynamic> json) {
    final idempotencyKey = json['idempotencyKey'];
    final terminalId = json['terminalId'] ?? json['sourceDeviceId'];
    final flowType = json['flowType'];
    final sourceSequence = json['sourceSequence'];
    final status = json['status'];
    if (idempotencyKey is! String ||
        terminalId is! String ||
        flowType is! String ||
        sourceSequence is! int ||
        status is! String) {
      return null;
    }
    final code = json['code'];
    final message = json['message'];
    if ((code != null && code is! String) ||
        (message != null && message is! String)) {
      return null;
    }

    return _SyncBatchResultItem(
      idempotencyKey: idempotencyKey,
      terminalId: terminalId,
      flowType: flowType,
      sourceSequence: sourceSequence,
      status: status,
      code: code,
      message: message,
    );
  }

  bool shouldMarkSynced(MovementSyncMetadata metadata) {
    final matchesRecord =
        idempotencyKey == metadata.idempotencyKey &&
        terminalId == metadata.terminalId &&
        flowType == metadata.flowType &&
        sourceSequence == metadata.localSequence;
    if (!matchesRecord) return false;
    return status == 'ACCEPTED' || status == 'DUPLICATE';
  }

  bool shouldMarkSalesSynced(Map<String, Object?> record) {
    final matchesRecord =
        idempotencyKey == record['idempotencyKey'] &&
        terminalId == record['terminalId'] &&
        flowType == record['flowType'] &&
        sourceSequence == record['sourceSequence'];
    if (!matchesRecord) return false;
    return status == 'ACCEPTED' || status == 'DUPLICATE';
  }
}

class _OrderedMovement {
  final dynamic movement;
  final int originalIndex;
  final int? sequence;

  _OrderedMovement({
    required this.movement,
    required this.originalIndex,
    required this.sequence,
  });
}
