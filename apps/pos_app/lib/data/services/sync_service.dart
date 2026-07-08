import 'dart:async';
import 'dart:convert';
import 'dart:developer' as developer;
import 'dart:io';
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

const Map<String, String> syncRole = {
  'EDGE_SERVER': 'EDGE_SERVER',
  'STANDALONE': 'STANDALONE',
};

typedef SyncRole = String;

class SyncService {
  final AuditRepository _auditRepository;
  // ignore: unused_field
  final SalesRepository _salesRepository;
  final InventoryRepository _inventoryRepository;
  final Dio _dio;
  static const int _batchEnvelopeLimit = 500;
  final SyncRole _role;

  Timer? _timer;
  bool _isSyncing = false;

  SyncService(
    this._auditRepository,
    this._salesRepository,
    this._inventoryRepository,
    this._dio, {
    SyncRole role = 'STANDALONE',
  }) : _role = role;

  void start() {
    // Sync every 5 minutes
    _timer = Timer.periodic(const Duration(minutes: 5), (_) async {
      await triggerManualSync();
    });
    developer.log('SyncService started', name: 'SyncService');
  }

  void stop() {
    _timer?.cancel();
    developer.log('SyncService stopped', name: 'SyncService');
  }

  Future<void> triggerManualSync() async {
    if (_isSyncing) return;

    _isSyncing = true;
    try {
      developer.log('Starting sync...', name: 'SyncService');

      // 1. Sync Audit Logs
      await _auditRepository.syncLogs();

      // 2. Sync inventory outbox deltas
      await _syncPurchaseDocuments();
      await _syncRecipeVersionDocuments();
      await _syncProductionOrderDocuments();
      await _syncCountSessionDocuments();
      await _syncAlertLifecycleDocuments();
      await _syncInventoryOutbox();
      await _refreshAlertInbox();

      developer.log('Sync completed successfully', name: 'SyncService');
    } catch (e, stackTrace) {
      developer.log(
        'Sync failed',
        name: 'SyncService',
        error: e,
        stackTrace: stackTrace,
      );
    } finally {
      _isSyncing = false;
    }
  }

  Future<void> _syncInventoryOutbox() async {
    final unsynced = (await _inventoryRepository.getUnsyncedMovements())
        .where(
          (movement) =>
              movement.type != MovementType.purchase &&
              !(movement.reason?.startsWith('COUNT_SESSION:') ?? false),
        )
        .toList(growable: false);
    if (unsynced.isEmpty) return;

    final ordered = _orderByReplaySemantics(unsynced);

    try {
      final response = _role == syncRole['EDGE_SERVER']
          ? await _postBatchEnvelope(ordered)
          : await _postStandaloneDeltas(ordered);
      if (response.statusCode == 200 || response.statusCode == 201) {
        developer.log(
          'Synced ${ordered.length} inventory deltas to cloud',
          name: 'SyncService',
        );
        for (final movement in ordered) {
          await _inventoryRepository.markMovementAsSynced(movement.id);
        }
      }
    } on DioException catch (e) {
      developer.log('Failed to sync sales: ${e.message}', name: 'SyncService');
      await _markMovementsAsFailed(ordered, error: e.message);
      // We don't rethrow here to allow other sync operations to continue if added
    } catch (e, stackTrace) {
      developer.log(
        'Failed to build/post inventory outbox payload',
        name: 'SyncService',
        error: e,
        stackTrace: stackTrace,
      );
      await _markMovementsAsFailed(ordered, error: e.toString());
    }
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
      }
    }
  }

  Future<void> _syncProductionOrderDocuments() async {
    final unsynced = await _inventoryRepository.getUnsyncedProductionOrders();
    if (unsynced.isEmpty) {
      return;
    }

    for (final document in unsynced) {
      try {
        final response = await _dio.post(
          '/inventory/production-orders/close',
          data: _buildProductionOrderPayload(document),
        );
        if (response.statusCode == 200 || response.statusCode == 201) {
          await _inventoryRepository.markProductionOrderDocumentAsSynced(
            document.id,
          );
          for (final movementId in document.movementReferences) {
            await _inventoryRepository.markMovementAsSynced(movementId);
          }
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
      }
    }
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
      }
    }
  }

  Future<void> _refreshAlertInbox() async {
    try {
      final response = await _dio.get('/inventory/alerts');
      final payload = response.data;
      final alertsPayload = payload is Map<String, dynamic>
          ? payload['alerts'] as List<dynamic>? ?? const <dynamic>[]
          : const <dynamic>[];

      for (final row in alertsPayload) {
        final map = Map<String, dynamic>.from(row as Map);
        await _inventoryRepository.saveForensicAlert(
          ForensicAlert(
            id: map['id'] as String,
            alertType: map['alertType'] as String,
            severity: map['severity'] as String,
            message: map['message'] as String,
            createdAt: DateTime.parse(map['createdAt'] as String),
            status: (map['status'] as String?) ?? 'active',
            note: map['note'] as String?,
            actorLabel: map['actorLabel'] as String?,
            actedAt: map['actedAt'] == null
                ? null
                : DateTime.parse(map['actedAt'] as String),
            sourceMovementId: map['sourceMovementId'] as String?,
            sourceDocumentId: map['sourceDocumentId'] as String?,
            sourceDocumentType: map['sourceDocumentType'] as String?,
            isSynced: true,
          ),
        );
      }
    } on DioException catch (e) {
      developer.log(
        'Failed to refresh forensic alerts: ${e.message}',
        name: 'SyncService',
      );
    }
  }

  Map<String, Object?> _buildPurchasePayload(Purchase purchase) {
    final payload = <String, Object?>{
      'id': purchase.id,
      'insumoId': purchase.insumoId,
      'supplierId': purchase.supplierId,
      'invoiceNumber': purchase.invoiceNumber,
      'fiscalAuthorizationCode': purchase.fiscalAuthorizationCode,
      'quantity': purchase.quantity,
      'unitCost': purchase.unitCost,
      'currency': purchase.currency,
      'invoiceDate': purchase.invoiceDate.toIso8601String().split('T').first,
      'entryTimestamp': purchase.timestamp.toUtc().toIso8601String(),
      'lotCode': purchase.lotCode,
      'receivedDate': purchase.receivedDate?.toIso8601String().split('T').first,
      'expirationDate': purchase.expirationDate
          ?.toIso8601String()
          .split('T')
          .first,
    };

    if (purchase.fxRateMode != null) {
      payload['fxRateMode'] = purchase.fxRateMode;
    }

    if (_requiresExplicitBcnRate(purchase)) {
      payload['bcnRate'] = purchase.bcnRate;
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
              // Slice 2.2: include the component UOM so the backend can
              // validate/convert against the insumo base consumption UOM once
              // a recipe-version ingestion endpoint exists.
              'componentUom': component.componentUom,
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

  Future<Response<dynamic>> _postBatchEnvelope(List<dynamic> unsynced) {
    final envelope = _buildBatchEnvelope(unsynced);
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

  Future<Response<dynamic>> _postStandaloneDeltas(List<dynamic> unsynced) {
    final records = _buildBatchEnvelope(unsynced)['records'];
    return _dio.post(
      '/v1/sync/batch',
      data: {'records': records},
      options: Options(
        headers: {HttpHeaders.contentTypeHeader: 'application/json'},
      ),
    );
  }

  Map<String, Object> _buildBatchEnvelope(List<dynamic> unsynced) {
    final records = unsynced.take(_batchEnvelopeLimit).toList(growable: false);

    final mappedRecords = records
        .asMap()
        .entries
        .map((entry) {
          final index = entry.key;
          final movement = entry.value;
          final movementId = movement.id.toString();
          final movementType = _enumName(movement.type).toUpperCase();
          final sourceSequence = _resolveSourceSequence(
            movement,
            fallbackSequence: index + 1,
          );

          return {
            'idempotencyKey': 'inventory:$movementId',
            'sourceDeviceId': 'pos-standalone',
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
    if (unitCostNio == null) {
      return const {};
    }
    return {'unitCostNio': unitCostNio};
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
