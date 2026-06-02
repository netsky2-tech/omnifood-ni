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
      metadata: json['metadata'] as Map<String, dynamic>?,
    );

Map<String, dynamic> _$$ForensicAlertImplToJson(_$ForensicAlertImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'alertType': instance.alertType,
      'severity': instance.severity,
      'message': instance.message,
      'createdAt': instance.createdAt.toIso8601String(),
      'metadata': instance.metadata,
    };
