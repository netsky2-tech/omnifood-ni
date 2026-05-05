import '../../domain/models/audit_log.dart';
import '../models/audit_log_entity.dart';

class AuditMapper {
  static AuditLog toDomain(AuditLogEntity entity) {
    return AuditLog(
      id: entity.id,
      userId: entity.userId,
      action: entity.action,
      timestamp: DateTime.parse(entity.timestamp),
      deviceId: entity.deviceId,
      metadata: entity.metadata,
      isSynced: entity.isSynced,
    );
  }

  static AuditLogEntity toEntity(AuditLog domain) {
    return AuditLogEntity(
      id: domain.id,
      userId: domain.userId,
      action: domain.action,
      timestamp: domain.timestamp.toIso8601String(),
      deviceId: domain.deviceId,
      metadata: domain.metadata,
      isSynced: domain.isSynced,
    );
  }
}
