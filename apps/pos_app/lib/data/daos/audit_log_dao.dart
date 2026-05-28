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

  @Query('SELECT sequence_no FROM audit_logs ORDER BY id DESC LIMIT 1')
  Future<int?> getLastSequenceNo();

  @Query('SELECT entry_hash FROM audit_logs ORDER BY id DESC LIMIT 1')
  Future<String?> getLastEntryHash();

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertLog(AuditLogEntity log);

  @Query('UPDATE audit_logs SET metadata = :metadata WHERE id = :id')
  Future<void> updateMetadataById(int id, String metadata);

  @Query('UPDATE audit_logs SET is_synced = 1 WHERE id IN (:ids)')
  Future<void> markAsSynced(List<int> ids);
}
