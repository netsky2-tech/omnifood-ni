import '../database/app_database.dart';
import '../../domain/repositories/sales/sales_repository.dart';

class VoidVerificationSaleParams {
  final String tenantId;
  final String attemptId;
  final String reason;

  const VoidVerificationSaleParams({
    required this.tenantId,
    required this.attemptId,
    required this.reason,
  });
}

class VoidVerificationSaleResult {
  final bool isSuccess;
  final String? ticketId;
  final List<String> errors;

  const VoidVerificationSaleResult({
    required this.isSuccess,
    this.ticketId,
    this.errors = const [],
  });
}

class ActivationVerificationSaleCleanupRunner {
  final AppDatabase _database;
  final SalesRepository _salesRepository;

  ActivationVerificationSaleCleanupRunner({
    required AppDatabase database,
    required SalesRepository salesRepository,
  })  : _database = database,
        _salesRepository = salesRepository;

  Future<VoidVerificationSaleResult> voidVerificationSale(
    VoidVerificationSaleParams params,
  ) async {
    final trimmedTenantId = params.tenantId.trim();
    final trimmedAttemptId = params.attemptId.trim();

    final attempt = await _database.activationAttemptLocalDao.getAttemptById(trimmedAttemptId);
    if (attempt == null) {
      return const VoidVerificationSaleResult(
        isSuccess: false,
        errors: ['Attempt not found'],
      );
    }

    if (attempt.tenantId.trim() != trimmedTenantId) {
      return VoidVerificationSaleResult(
        isSuccess: false,
        errors: [
          "TENANT_MISMATCH: Attempt tenant '${attempt.tenantId}' does not match requested '$trimmedTenantId'",
        ],
      );
    }

    final ticketId = attempt.verificationTicketId;
    if (ticketId == null || ticketId.isEmpty) {
      return const VoidVerificationSaleResult(
        isSuccess: false,
        errors: ['Attempt does not have a verificationTicketId to void'],
      );
    }

    // Normal production Sales VOID path:
    // Performs legal DGI void: sets is_canceled = true with void_reason, NEVER deletes row
    await _salesRepository.voidInvoice(ticketId, params.reason);

    return VoidVerificationSaleResult(
      isSuccess: true,
      ticketId: ticketId,
    );
  }
}
