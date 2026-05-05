import 'package:floor/floor.dart';
import '../models/audit_log_entity.dart';

@dao
abstract class AuditDao {
  @Query('SELECT * FROM audit_logs ORDER BY timestamp DESC')
  Future<List<AuditLogEntity>> findAllLogs();

  @Query('SELECT * FROM audit_logs WHERE timestamp >= :start AND timestamp <= :end AND (:userId = "" OR user_id = :userId) ORDER BY timestamp DESC')
  Future<List<AuditLogEntity>> findLogsWithFilters(String start, String end, String userId);

  @Query('SELECT * FROM audit_logs WHERE is_synced = 0')
  Future<List<AuditLogEntity>> findUnsyncedLogs();

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertLog(AuditLogEntity log);

  @Query('UPDATE audit_logs SET is_synced = 1 WHERE id IN (:ids)')
  Future<void> markAsSynced(List<int> ids);
}
