abstract class AuditRepository {
  Future<void> log(String action, {String? metadata});
  Future<void> syncLogs();
}
