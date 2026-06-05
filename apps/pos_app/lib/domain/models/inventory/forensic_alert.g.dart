// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'forensic_alert.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$ForensicAlertImpl _$$ForensicAlertImplFromJson(Map<String, dynamic> json) =>
    _$ForensicAlertImpl(
      id: json['id'] as String,
      alertType: json['alertType'] as String,
      severity: json['severity'] as String,
      message: json['message'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      status: json['status'] as String? ?? 'active',
      note: json['note'] as String?,
      actorLabel: json['actorLabel'] as String?,
      actedAt: json['actedAt'] == null
          ? null
          : DateTime.parse(json['actedAt'] as String),
      sourceMovementId: json['sourceMovementId'] as String?,
      sourceDocumentId: json['sourceDocumentId'] as String?,
      sourceDocumentType: json['sourceDocumentType'] as String?,
      isSynced: json['isSynced'] as bool? ?? false,
      metadata: json['metadata'] as Map<String, dynamic>?,
    );

Map<String, dynamic> _$$ForensicAlertImplToJson(_$ForensicAlertImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'alertType': instance.alertType,
      'severity': instance.severity,
      'message': instance.message,
      'createdAt': instance.createdAt.toIso8601String(),
      'status': instance.status,
      'note': instance.note,
      'actorLabel': instance.actorLabel,
      'actedAt': instance.actedAt?.toIso8601String(),
      'sourceMovementId': instance.sourceMovementId,
      'sourceDocumentId': instance.sourceDocumentId,
      'sourceDocumentType': instance.sourceDocumentType,
      'isSynced': instance.isSynced,
      'metadata': instance.metadata,
    };
