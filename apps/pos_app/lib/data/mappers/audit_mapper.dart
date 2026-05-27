import '../../domain/models/audit_log.dart';
import '../models/audit_log_entity.dart';
import 'package:uuid/uuid.dart';

class AuditMapper {
  static const _uuid = Uuid();
  static AuditLog toDomain(AuditLogEntity entity) {
    return AuditLog(
      id: entity.id,
      userId: entity.userId,
      action: entity.action,
      timestamp: DateTime.parse(entity.timestamp),
      deviceId: entity.deviceId,
      metadata: entity.metadata,
      isSynced: entity.isSynced,
      sequenceNo: entity.sequenceNo,
      prevHash: entity.prevHash,
      entryHash: entity.entryHash,
      metodoAutorizacion: entity.metodoAutorizacion,
      usuarioAutorizadorId: entity.usuarioAutorizadorId,
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
      sequenceNo: domain.sequenceNo,
      prevHash: domain.prevHash,
      entryHash: domain.entryHash,
      metodoAutorizacion: domain.metodoAutorizacion,
      usuarioAutorizadorId: domain.usuarioAutorizadorId,
      remoteRefUuid: _uuid.v4(),
    );
  }
}
