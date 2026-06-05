import 'package:floor/floor.dart';

@Entity(tableName: 'forensic_alerts')
class ForensicAlertEntity {
  @primaryKey
  final String id;
  @ColumnInfo(name: 'alert_type')
  final String alertType;
  final String severity;
  final String message;
  @ColumnInfo(name: 'created_at')
  final String createdAt;
  final String status;
  final String? note;
  @ColumnInfo(name: 'actor_label')
  final String? actorLabel;
  @ColumnInfo(name: 'acted_at')
  final String? actedAt;
  @ColumnInfo(name: 'source_movement_id')
  final String? sourceMovementId;
  @ColumnInfo(name: 'source_document_id')
  final String? sourceDocumentId;
  @ColumnInfo(name: 'source_document_type')
  final String? sourceDocumentType;
  @ColumnInfo(name: 'metadata_json')
  final String? metadataJson;
  @ColumnInfo(name: 'is_synced')
  final bool isSynced;

  const ForensicAlertEntity({
    required this.id,
    required this.alertType,
    required this.severity,
    required this.message,
    required this.createdAt,
    required this.status,
    this.note,
    this.actorLabel,
    this.actedAt,
    this.sourceMovementId,
    this.sourceDocumentId,
    this.sourceDocumentType,
    this.metadataJson,
    this.isSynced = false,
  });
}
