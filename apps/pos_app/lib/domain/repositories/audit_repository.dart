import '../models/audit_log.dart';

abstract class AuditRepository {
  String get deviceId;
  Future<void> log(String action, {String? metadata});

  /// Builds a forensic, hash-chained audit log entry for [action] WITHOUT
  /// persisting it.
  ///
  /// The returned entry carries a fully computed chain (sequenceNo /
  /// prevHash / entryHash) and must be persisted by the caller inside the
  /// same atomic unit that triggered the audited action (e.g. a Floor
  /// `@transaction`), so the audit row commits or rolls back together
  /// with the audited business write.
  ///
  /// Returns `null` when there is no current user, mirroring [log].
  Future<AuditLog?> prepareLog(String action, {String? metadata});
  Future<void> logForensic(
    String action, {
    String? metadata,
    String? metodoAutorizacion,
    String? usuarioAutorizadorId,
  });
  Future<void> syncLogs();
  Future<List<AuditLog>> getLocalLogs({DateTime? start, DateTime? end, String? userId});
}
