import 'dart:async';
import 'dart:developer' as developer;
import 'package:dio/dio.dart';
import '../../domain/repositories/audit_repository.dart';
import '../../domain/repositories/sales/sales_repository.dart';

import '../../domain/repositories/inventory/inventory_repository.dart';

class SyncService {
  final AuditRepository _auditRepository;
  final SalesRepository _salesRepository;
  final InventoryRepository _inventoryRepository;
  final Dio _dio;
  
  Timer? _timer;
  bool _isSyncing = false;

  SyncService(
    this._auditRepository,
    this._salesRepository,
    this._inventoryRepository,
    this._dio,
  );

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
      
      // 2. Sync Sales
      await _syncSales();

      // 3. Sync Inventory Movements
      await _syncInventoryMovements();
      
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

  Future<void> _syncSales() async {
    final unsynced = await _salesRepository.getUnsyncedAggregates();
    if (unsynced.isEmpty) return;

    await _syncBatchWithPoisonIsolation<Map<String, dynamic>>(
      records: unsynced,
      endpoint: '/sales/sync',
      sendBatch: (batch) async {
        return await _dio.post('/sales/sync', data: batch);
      },
      markFailed: (id) async => _salesRepository.markAsFailed(id),
      markSynced: (ids) async {
        for (final id in ids) {
          await _salesRepository.markAsSynced(id);
        }
      },
      getId: (item) => item['id'] as String,
      entityName: 'sales',
    );
  }

  Future<void> _syncInventoryMovements() async {
    final unsynced = await _inventoryRepository.getUnsyncedMovements();
    if (unsynced.isEmpty) return;

    await _syncBatchWithPoisonIsolation<dynamic>(
      records: unsynced,
      endpoint: '/inventory/movements/sync',
      sendBatch: (batch) async {
        return await _dio.post(
          '/inventory/movements/sync',
          data: batch.map((m) => m.toJson()).toList(),
        );
      },
      markFailed: (id) async => _inventoryRepository.markMovementAsFailed(id),
      markSynced: (ids) async {
        for (final id in ids) {
          await _inventoryRepository.markMovementAsSynced(id);
        }
      },
      getId: (item) => (item as dynamic).id as String,
      entityName: 'inventory movements',
    );
  }

  /// Syncs a batch of records with poison pill isolation.
  /// 
  /// When a 4xx error occurs, uses binary search to isolate the failing record(s)
  /// and marks only those as failed. Other records are marked as synced.
  /// 
  /// When a 5xx or network error occurs, aborts the entire batch without marking
  /// any records as failed or synced, allowing retry later.
  Future<void> _syncBatchWithPoisonIsolation<T>({
    required List<T> records,
    required String endpoint,
    required Future<Response> Function(List<T>) sendBatch,
    required Future<void> Function(String id) markFailed,
    required Future<void> Function(List<String> ids) markSynced,
    required String Function(T) getId,
    required String entityName,
  }) async {
    if (records.isEmpty) return;

    try {
      final response = await sendBatch(records);
      if (response.statusCode == 200 || response.statusCode == 201) {
        developer.log(
          'Synced ${records.length} $entityName to cloud',
          name: 'SyncService',
        );
        final ids = records.map(getId).toList();
        await markSynced(ids);
      }
    } on DioException catch (e) {
      final statusCode = e.response?.statusCode;
      
      // 4xx errors indicate client-side issues (bad data, validation errors)
      // Use binary search to isolate the poison pill(s)
      if (statusCode != null && statusCode >= 400 && statusCode < 500) {
        developer.log(
          '4xx error detected on $endpoint, using binary search to isolate poison pill',
          name: 'SyncService',
          error: e,
        );
        await _isolateAndRetryWithBinarySearch(
          records: records,
          sendBatch: sendBatch,
          markFailed: markFailed,
          markSynced: markSynced,
          getId: getId,
          entityName: entityName,
        );
      } else {
        // 5xx errors or network errors - abort entire batch for retry later
        developer.log(
          '5xx/network error on $endpoint, aborting batch for retry later: ${e.message}',
          name: 'SyncService',
          error: e,
        );
        // Do NOT mark any records as failed or synced - they will be retried
      }
    }
  }

  /// Uses binary search to isolate poison pill records and sync the rest.
  /// 
  /// This recursively splits batches that fail with 4xx errors until:
  /// - Single records that fail are marked as failed
  /// - Batches that succeed are marked as synced
  Future<void> _isolateAndRetryWithBinarySearch<T>({
    required List<T> records,
    required Future<Response> Function(List<T>) sendBatch,
    required Future<void> Function(String id) markFailed,
    required Future<void> Function(List<String> ids) markSynced,
    required String Function(T) getId,
    required String entityName,
  }) async {
    if (records.isEmpty) return;

    // Try the batch first
    try {
      final response = await sendBatch(records);
      if (response.statusCode == 200 || response.statusCode == 201) {
        final ids = records.map(getId).toList();
        await markSynced(ids);
        return;
      }
    } on DioException catch (e) {
      final statusCode = e.response?.statusCode;
      
      // Only handle 4xx errors - others should bubble up
      if (statusCode == null || statusCode < 400 || statusCode >= 500) {
        rethrow;
      }

      // Base case: single record that fails
      if (records.length == 1) {
        final failedId = getId(records.first);
        developer.log(
          'Isolated poison pill $entityName: $failedId',
          name: 'SyncService',
        );
        await markFailed(failedId);
        return;
      }

      // Recursive case: split and retry
      final mid = records.length ~/ 2;
      final firstHalf = records.sublist(0, mid);
      final secondHalf = records.sublist(mid);

      developer.log(
        'Splitting $entityName batch of ${records.length} into ${firstHalf.length} + ${secondHalf.length}',
        name: 'SyncService',
      );

      // Process both halves
      await _isolateAndRetryWithBinarySearch(
        records: firstHalf,
        sendBatch: sendBatch,
        markFailed: markFailed,
        markSynced: markSynced,
        getId: getId,
        entityName: entityName,
      );

      await _isolateAndRetryWithBinarySearch(
        records: secondHalf,
        sendBatch: sendBatch,
        markFailed: markFailed,
        markSynced: markSynced,
        getId: getId,
        entityName: entityName,
      );
    }
  }
}
