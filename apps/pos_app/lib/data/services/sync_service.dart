import 'dart:async';
import 'dart:convert';
import 'dart:developer' as developer;
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:dio/dio.dart';
import '../../domain/repositories/audit_repository.dart';
import '../../domain/repositories/sales/sales_repository.dart';
import '../../domain/repositories/inventory/inventory_repository.dart';

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
      await _syncInventoryOutbox();
      
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
    final unsynced = await _inventoryRepository.getUnsyncedMovements();
    if (unsynced.isEmpty) return;

    final ordered = _orderByReplaySemantics(unsynced);

    try {
      final response = _role == syncRole['EDGE_SERVER']
          ? await _postBatchEnvelope(ordered)
          : await _postStandaloneDeltas(ordered);
      if (response.statusCode == 200 || response.statusCode == 201) {
        developer.log('Synced ${ordered.length} inventory deltas to cloud', name: 'SyncService');
        for (final movement in ordered) {
          await _inventoryRepository.markMovementAsSynced(movement.id);
        }
      }
    } on DioException catch (e) {
      developer.log('Failed to sync sales: ${e.message}', name: 'SyncService');
      // We don't rethrow here to allow other sync operations to continue if added
    } catch (e, stackTrace) {
      developer.log(
        'Failed to build/post inventory outbox payload',
        name: 'SyncService',
        error: e,
        stackTrace: stackTrace,
      );
    }
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
        headers: {
          HttpHeaders.contentTypeHeader: 'application/json',
        },
      ),
    );
  }

  Map<String, Object> _buildBatchEnvelope(List<dynamic> unsynced) {
    final records = unsynced.take(_batchEnvelopeLimit).toList(growable: false);

    final mappedRecords = records.asMap().entries.map((entry) {
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
          }
        ],
      };
    }).toList(growable: false);

    return {'records': mappedRecords};
  }

  int _resolveSourceSequence(dynamic movement, {required int fallbackSequence}) {
    final persistedSequence = _tryReadField(movement, 'sourceSequence') ??
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
        _tryReadField(movement, 'sourceSequence') ?? _tryReadField(movement, 'localSequence');
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
