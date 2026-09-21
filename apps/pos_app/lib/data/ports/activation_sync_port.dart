import '../../domain/models/activation/activation_attempt_snapshot.dart';
import '../../domain/security/device_sync_credential_record.dart';

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

  /// Calls GET /onboarding/activation/attempts/active and parses the active
  /// attempt into an [ActivationAttemptSnapshot]. Returns null when the backend
  /// reports no active attempt for the authenticated tenant. Network failures
  /// are thrown (not swallowed) so callers can distinguish "no attempt" from
  /// "backend unreachable" and fail closed.
  Future<ActivationAttemptSnapshot?> fetchActiveAttempt() {
    throw UnimplementedError();
  }

  /// Explicitly calls POST /onboarding/activation/attempts/:id/device-sync-credential
  /// while a human authorized cloud session exists, parses the one-time response
  /// into [DeviceSyncCredentialRecord], verifies that the returned deviceId equals
  /// [expectedDeviceId], and provisions it into the coordinator if present.
  Future<DeviceSyncCredentialRecord> provisionDeviceSyncCredential({
    required String attemptId,
    required String expectedDeviceId,
  }) {
    throw UnimplementedError();
  }

  /// Calls POST /onboarding/activation/attempts/:id/device-sync-credential/confirm
  /// with exact credential ID, version, device, and renewal secret.
  Future<DeviceSyncCredentialRecord> confirmDeviceSyncCredential({
    required String attemptId,
    required String credentialId,
    required String deviceId,
    required int credentialVersion,
    required String renewalSecret,
  }) {
    throw UnimplementedError();
  }

  /// Calls POST /onboarding/activation/device-sync-credential with { deviceId }
  /// while a human authorized cloud session exists, resolving latest PASS attempt.
  Future<DeviceSyncCredentialRecord> provisionBootstrapDeviceSyncCredential({
    required String deviceId,
  }) {
    throw UnimplementedError();
  }

  /// Calls POST /onboarding/activation/device-sync-credential/confirm
  /// with exact credential ID, version, device, and renewal secret,
  /// without requiring client-held attemptId.
  Future<DeviceSyncCredentialRecord> confirmBootstrapDeviceSyncCredential({
    required String credentialId,
    required String deviceId,
    required int credentialVersion,
    required String renewalSecret,
  }) {
    throw UnimplementedError();
  }
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
