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

    try {
      final response = await _dio.post('/sales/sync', data: unsynced);
      if (response.statusCode == 200 || response.statusCode == 201) {
        developer.log('Synced ${unsynced.length} sales to cloud', name: 'SyncService');
        
        // Mark all as synced
        for (final item in unsynced) {
          await _salesRepository.markAsSynced(item['id']);
        }
      }
    } on DioException catch (e) {
      developer.log('Failed to sync sales: ${e.message}', name: 'SyncService');
      // We don't rethrow here to allow other sync operations to continue if added
    }
  }

  Future<void> _syncInventoryMovements() async {
    final unsynced = await _inventoryRepository.getUnsyncedMovements();
    if (unsynced.isEmpty) return;

    try {
      final response = await _dio.post(
        '/inventory/movements/sync',
        data: unsynced.map((m) => m.toJson()).toList(),
      );
      if (response.statusCode == 200 || response.statusCode == 201) {
        developer.log(
          'Synced ${unsynced.length} inventory movements to cloud',
          name: 'SyncService',
        );

        for (final movement in unsynced) {
          await _inventoryRepository.markMovementAsSynced(movement.id);
        }
      }
    } on DioException catch (e) {
      developer.log(
        'Failed to sync inventory movements: ${e.message}',
        name: 'SyncService',
      );
    }
  }
}
