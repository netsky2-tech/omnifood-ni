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
    @JsonKey(name: 'sequence_no') required int sequenceNo,
    @JsonKey(name: 'prev_hash') required String prevHash,
    @JsonKey(name: 'entry_hash') required String entryHash,
    @JsonKey(name: 'metodo_autorizacion') String? metodoAutorizacion,
    @JsonKey(name: 'usuario_autorizador_id') String? usuarioAutorizadorId,
  }) = _AuditLog;

  factory AuditLog.fromJson(Map<String, dynamic> json) => _$AuditLogFromJson(json);
}
