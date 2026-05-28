import '../models/audit_log.dart';

abstract class AuditRepository {
  String get deviceId;
  Future<void> log(String action, {String? metadata});
  Future<void> logForensic(
    String action, {
    String? metadata,
    String? metodoAutorizacion,
    String? usuarioAutorizadorId,
  });
  Future<void> syncLogs();
  Future<List<AuditLog>> getLocalLogs({DateTime? start, DateTime? end, String? userId});
}
