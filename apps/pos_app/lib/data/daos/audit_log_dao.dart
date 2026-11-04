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

  @Query(
    'UPDATE audit_logs SET sequence_no = :sequenceNo, prev_hash = :prevHash, entry_hash = :entryHash WHERE id = :id',
  )
  Future<void> updateLogSequenceAndHashes(
    int id,
    int sequenceNo,
    String prevHash,
    String entryHash,
  );

  /// Re-anchors a forensic stream atomically (Issue #936):
  /// Inserts the re-anchoring audit event at the new anchor position and
  /// updates subsequent un-synced logs with recomputed sequence and hashes.
  @transaction
  Future<void> reanchorStreamLogs(
    AuditLogEntity reanchorEvent,
    List<AuditLogEntity> recomputedLogs,
  ) async {
    await insertLog(reanchorEvent);
    for (final log in recomputedLogs) {
      if (log.id != null) {
        await updateLogSequenceAndHashes(
          log.id!,
          log.sequenceNo,
          log.prevHash,
          log.entryHash,
        );
      }
    }
  }

  @Query('UPDATE audit_logs SET is_synced = 1 WHERE id IN (:ids)')
  Future<void> markAsSynced(List<int> ids);

  @Query('UPDATE audit_logs SET is_synced = 1 WHERE remote_ref_uuid IN (:uuids)')
  Future<void> markAsSyncedByRemoteRefs(List<String> uuids);
}
