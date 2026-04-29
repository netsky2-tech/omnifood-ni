import 'dart:async';
import 'dart:developer' as developer;
import '../../domain/repositories/audit_repository.dart';

class SyncService {
  final AuditRepository _auditRepository;
  Timer? _timer;
  bool _isSyncing = false;

  SyncService(this._auditRepository);

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
      await _auditRepository.syncLogs();
      developer.log('Sync completed successfully', name: 'SyncService');
    } catch (e, stackTrace) {
      developer.log(
        'Sync failed',
        name: 'SyncService',
        error: e,
        stackTrace: stackTrace,
      );
      // Here we could implement a retry strategy or notify the UI
    } finally {
      _isSyncing = false;
    }
  }
}
