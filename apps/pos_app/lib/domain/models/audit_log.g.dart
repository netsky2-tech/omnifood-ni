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
    };
