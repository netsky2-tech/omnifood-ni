import 'package:freezed_annotation/freezed_annotation.dart';

part 'audit_log.freezed.dart';
part 'audit_log.g.dart';

@freezed
class AuditLog with _$AuditLog {
  const factory AuditLog({
    int? id,
    @JsonKey(name: 'user_id') required String userId,
    required String action,
    required DateTime timestamp,
    @JsonKey(name: 'device_id') required String deviceId,
    String? metadata, // JSON string
    @Default(false) bool isSynced,
  }) = _AuditLog;

  factory AuditLog.fromJson(Map<String, dynamic> json) => _$AuditLogFromJson(json);
}
