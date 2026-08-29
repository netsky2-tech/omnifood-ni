import 'package:floor/floor.dart';
import '../models/audit_log_entity.dart';

@dao
abstract class AuditDao {
  @Query('SELECT * FROM audit_logs ORDER BY timestamp DESC')
  Future<List<AuditLogEntity>> findAllLogs();

  @Query(
    "SELECT * FROM audit_logs WHERE timestamp >= :start AND timestamp <= :end AND (:userId = '' OR user_id = :userId) ORDER BY timestamp DESC",
  )
  Future<List<AuditLogEntity>> findLogsWithFilters(
    String start,
    String end,
    String userId,
  );

  @Query('SELECT * FROM audit_logs WHERE is_synced = 0')
  Future<List<AuditLogEntity>> findUnsyncedLogs();

  @Query(
    'SELECT sequence_no FROM audit_logs WHERE tenant_id = :tenantId AND device_id = :deviceId AND user_id = :userId ORDER BY sequence_no DESC LIMIT 1',
  )
  Future<int?> getLastSequenceNoByStream(
    String tenantId,
    String deviceId,
    String userId,
  );

  @Query(
    'SELECT entry_hash FROM audit_logs WHERE tenant_id = :tenantId AND device_id = :deviceId AND user_id = :userId ORDER BY sequence_no DESC LIMIT 1',
  )
  Future<String?> getLastEntryHashByStream(
    String tenantId,
    String deviceId,
    String userId,
  );

  @Query(
    'SELECT * FROM audit_logs WHERE tenant_id = :tenantId AND device_id = :deviceId AND user_id = :userId ORDER BY sequence_no DESC LIMIT 1',
  )
  Future<AuditLogEntity?> getLastAuditLogByStream(
    String tenantId,
    String deviceId,
    String userId,
  );

  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertLog(AuditLogEntity log);

  /// Appends a tenant-bound forensic log atomically with the stream head read.
  ///
  /// Positional arguments are mandatory for Floor `@transaction` methods in
  /// this project; named arguments break generated `.g.dart` code.
  @transaction
  Future<void> appendForensicLog(
    String tenantId,
    String deviceId,
    String userId,
    AuditLogEntity Function(int sequenceNo, String prevHash) createLog,
  ) async {
    final head = await getLastAuditLogByStream(tenantId, deviceId, userId);
    final log = createLog(
      (head?.sequenceNo ?? 0) + 1,
      head?.entryHash ?? 'GENESIS',
    );
    if (log.tenantId != tenantId ||
        log.deviceId != deviceId ||
        log.userId != userId) {
      throw StateError('Forensic log stream identity changed during append');
    }
    await insertLog(log);
  }

  @Query('UPDATE audit_logs SET metadata = :metadata WHERE id = :id')
  Future<void> updateMetadataById(int id, String metadata);

  @Query('UPDATE audit_logs SET is_synced = 1 WHERE id IN (:ids)')
  Future<void> markAsSynced(List<int> ids);
}
