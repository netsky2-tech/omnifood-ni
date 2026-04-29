import 'package:floor/floor.dart';

@Entity(tableName: 'audit_logs')
class AuditLogEntity {
  @PrimaryKey(autoGenerate: true)
  final int? id;
  @ColumnInfo(name: 'user_id')
  final String userId;
  final String action;
  final String timestamp; // ISO8601
  @ColumnInfo(name: 'device_id')
  final String deviceId;
  final String? metadata;
  @ColumnInfo(name: 'is_synced')
  final bool isSynced;

  AuditLogEntity({
    this.id,
    required this.userId,
    required this.action,
    required this.timestamp,
    required this.deviceId,
    this.metadata,
    this.isSynced = false,
  });
}
