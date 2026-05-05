import '../models/audit_log.dart';

abstract class AuditRepository {
  Future<void> log(String action, {String? metadata});
  Future<void> syncLogs();
  Future<List<AuditLog>> getLocalLogs({DateTime? start, DateTime? end, String? userId});
}
