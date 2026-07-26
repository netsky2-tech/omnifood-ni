import 'package:floor/floor.dart';

import '../../models/inventory/forensic_alert_entity.dart';

@dao
abstract class ForensicAlertDao {
  @Query('SELECT * FROM forensic_alerts ORDER BY created_at DESC')
  Future<List<ForensicAlertEntity>> findAllAlerts();

  @Query(
    "SELECT * FROM forensic_alerts WHERE is_synced = 0 AND status != 'active' ORDER BY created_at ASC",
  )
  Future<List<ForensicAlertEntity>> findUnsyncedLifecycleAlerts();

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> upsertAlert(ForensicAlertEntity entity);

  @Query(
    'INSERT OR IGNORE INTO forensic_alerts (id, alert_type, severity, message, created_at, status, source_document_type, source_document_id, metadata_json, is_synced) VALUES (:id, :alertType, :severity, :message, :createdAt, :status, :sourceDocumentType, :sourceDocumentId, :metadataJson, :isSynced)',
  )
  Future<void> insertIfAbsentForensicAlert(
    String id,
    String alertType,
    String severity,
    String message,
    String createdAt,
    String status,
    String sourceDocumentType,
    String sourceDocumentId,
    String metadataJson,
    bool isSynced,
  );

  @Query(
    "SELECT COUNT(*) FROM forensic_alerts WHERE alert_type = 'AUDIT_BACKEND_TERMINAL_REJECTION' AND source_document_type = 'audit_log' AND source_document_id = :sourceDocumentId AND status = 'active'",
  )
  Future<int?> countActiveAuditTerminalAlerts(String sourceDocumentId);

  @Query('UPDATE forensic_alerts SET is_synced = 1 WHERE id = :id')
  Future<void> markAsSynced(String id);
}
