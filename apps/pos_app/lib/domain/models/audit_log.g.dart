// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'audit_log.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$AuditLogImpl _$$AuditLogImplFromJson(Map<String, dynamic> json) =>
    _$AuditLogImpl(
      id: json['id'] as int?,
      userId: json['user_id'] as String,
      action: json['action'] as String,
      timestamp: DateTime.parse(json['timestamp'] as String),
      deviceId: json['device_id'] as String,
      metadata: json['metadata'] as String?,
      isSynced: json['isSynced'] as bool? ?? false,
      sequenceNo: json['sequence_no'] as int,
      prevHash: json['prev_hash'] as String,
      entryHash: json['entry_hash'] as String,
      metodoAutorizacion: json['metodo_autorizacion'] as String?,
      usuarioAutorizadorId: json['usuario_autorizador_id'] as String?,
    );

Map<String, dynamic> _$$AuditLogImplToJson(_$AuditLogImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'user_id': instance.userId,
      'action': instance.action,
      'timestamp': instance.timestamp.toIso8601String(),
      'device_id': instance.deviceId,
      'metadata': instance.metadata,
      'isSynced': instance.isSynced,
      'sequence_no': instance.sequenceNo,
      'prev_hash': instance.prevHash,
      'entry_hash': instance.entryHash,
      'metodo_autorizacion': instance.metodoAutorizacion,
      'usuario_autorizador_id': instance.usuarioAutorizadorId,
    };
