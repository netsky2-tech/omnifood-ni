import '../../domain/models/activation/activation_attempt_snapshot.dart';
import '../../domain/security/device_sync_credential_record.dart';

/// Contract for cloud activation synchronization.
///
/// Production implements every method via `DioActivationSyncPort`.
/// Test doubles that intentionally do not exercise a subset of these methods
/// can mix in the shared test helper `UnimplementedActivationSyncDefaults`
/// (see `test/support/unimplemented_activation_sync_defaults.dart`).
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
  Future<ActivationAttemptSnapshot?> fetchActiveAttempt();

  /// Explicitly calls POST /onboarding/activation/attempts/:id/device-sync-credential
  /// while a human authorized cloud session exists, parses the one-time response
  /// into [DeviceSyncCredentialRecord], verifies that the returned deviceId equals
  /// [expectedDeviceId], and provisions it into the coordinator if present.
  Future<DeviceSyncCredentialRecord> provisionDeviceSyncCredential({
    required String attemptId,
    required String expectedDeviceId,
  });

  /// Calls POST /onboarding/activation/attempts/:id/device-sync-credential/confirm
  /// with exact credential ID, version, device, and renewal secret.
  Future<DeviceSyncCredentialRecord> confirmDeviceSyncCredential({
    required String attemptId,
    required String credentialId,
    required String deviceId,
    required int credentialVersion,
    required String renewalSecret,
  });

  /// Calls POST /onboarding/activation/device-sync-credential with { deviceId }
  /// while a human authorized cloud session exists, resolving latest PASS attempt.
  Future<DeviceSyncCredentialRecord> provisionBootstrapDeviceSyncCredential({
    required String deviceId,
  });

  /// Calls POST /onboarding/activation/device-sync-credential/confirm
  /// with exact credential ID, version, device, and renewal secret,
  /// without requiring client-held attemptId.
  Future<DeviceSyncCredentialRecord> confirmBootstrapDeviceSyncCredential({
    required String credentialId,
    required String deviceId,
    required int credentialVersion,
    required String renewalSecret,
  });
}

/// Thrown by [DioActivationSyncPort] when the SERVER answered with a
/// deterministic, non-retryable rejection of an activation delivery, as
/// opposed to a transport failure (which keeps reporting `false`).
///
/// This carries the backend's machine error code (e.g.
/// `CRITICAL_SEQUENCE_PAYLOAD_MISMATCH`) so callers can distinguish "the WAN
/// dropped, retry later" from "the server refused this delivery, retrying
/// cannot fix it" (F-10f).
class ActivationDeliveryRejection implements Exception {
  /// Stable machine-readable rejection code from the backend
  /// (e.g. `CRITICAL_SEQUENCE_PAYLOAD_MISMATCH`, fallback `RECORD_REJECTED`
  /// for a record-level rejection without a code, `SERVER_REJECTED` for a
  /// non-2xx response whose body carries no parsable code).
  final String code;

  /// Optional human/log detail (e.g. the record status or HTTP status line).
  final String? detail;

  const ActivationDeliveryRejection({required this.code, this.detail});

  @override
  String toString() => 'ActivationDeliveryRejection($code)';
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
