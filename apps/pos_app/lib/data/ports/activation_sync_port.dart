abstract class ActivationSyncPort {
  Future<bool> sendCheck({
    required String attemptId,
    required String checkCode,
    required String status,
    String? evidenceType,
    String? evidenceRef,
    String? occurredAt,
    Map<String, dynamic>? details,
    String? tenantId,
    String? terminalId,
  });

  Future<bool> sendFirstSaleClaim({
    required String attemptId,
    required Map<String, dynamic> claimPayload,
  });

  Future<bool> sendVerificationSale({
    required String attemptId,
    required Map<String, dynamic> salePayload,
  });

  Future<FinalizeActivationResult> finalizeActivation({
    required String tenantId,
    required String attemptId,
  });
}

class FinalizeActivationResult {
  final bool isSuccess;
  final String status; // PASS, PASS_WITH_WARNING, FAIL, NETWORK_ERROR
  final String? failureCode;
  final int warningsCount;

  const FinalizeActivationResult({
    required this.isSuccess,
    required this.status,
    this.failureCode,
    this.warningsCount = 0,
  });
}
