import '../../domain/repositories/audit_repository.dart';
import '../../domain/repositories/auth_repository.dart';
import '../daos/audit_log_dao.dart';
import '../models/audit_log_entity.dart';
import 'package:dio/dio.dart';

class AuditRepositoryImpl implements AuditRepository {
  final AuditDao _auditDao;
  final AuthRepository _authRepository;
  final Dio _dio;
  final String _deviceId;

  AuditRepositoryImpl(this._auditDao, this._authRepository, this._dio, this._deviceId);

  @override
  Future<void> log(String action, {String? metadata}) async {
    final user = await _authRepository.getCurrentUser();
    if (user == null) return;

    final entity = AuditLogEntity(
      userId: user.id,
      action: action,
      timestamp: DateTime.now().toIso8601String(),
      deviceId: _deviceId,
      metadata: metadata,
      isSynced: false,
    );

    await _auditDao.insertLog(entity);
  }

  @override
  Future<void> syncLogs() async {
    final unsynced = await _auditDao.findUnsyncedLogs();
    if (unsynced.isEmpty) return;

    try {
      final logsJson = unsynced.map((e) => {
        'user_id': e.userId,
        'action': e.action,
        'timestamp': e.timestamp,
        'device_id': e.deviceId,
        'metadata': e.metadata,
      }).toList();

      await _dio.post('/identity/audit', data: logsJson);
      
      final ids = unsynced.map((e) => e.id!).toList();
      await _auditDao.markAsSynced(ids);
    } catch (e) {
      // Offline or error
    }
  }
}
