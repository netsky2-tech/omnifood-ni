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
  @ColumnInfo(name: 'sequence_no')
  final int sequenceNo;
  @ColumnInfo(name: 'prev_hash')
  final String prevHash;
  @ColumnInfo(name: 'entry_hash')
  final String entryHash;
  @ColumnInfo(name: 'metodo_autorizacion')
  final String? metodoAutorizacion;
  @ColumnInfo(name: 'usuario_autorizador_id')
  final String? usuarioAutorizadorId;
  @ColumnInfo(name: 'remote_ref_uuid')
  final String remoteRefUuid;
  @ColumnInfo(name: 'hash_version')
  final String? hashVersion;
  @ColumnInfo(name: 'has_metodo_autorizacion')
  final bool? hasMetodoAutorizacion;
  @ColumnInfo(name: 'has_usuario_autorizador_id')
  final bool? hasUsuarioAutorizadorId;

  AuditLogEntity({
    this.id,
    required this.userId,
    required this.action,
    required this.timestamp,
    required this.deviceId,
    this.metadata,
    this.isSynced = false,
    required this.sequenceNo,
    required this.prevHash,
    required this.entryHash,
    this.metodoAutorizacion,
    this.usuarioAutorizadorId,
    required this.remoteRefUuid,
    this.hashVersion,
    this.hasMetodoAutorizacion,
    this.hasUsuarioAutorizadorId,
  });
}
