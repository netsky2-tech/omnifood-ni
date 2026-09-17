/// Base exception for all device sync credential and transport errors.
abstract class DeviceSyncException implements Exception {
  const DeviceSyncException(this.message);
  final String message;

  @override
  String toString() => '$runtimeType: $message';
}

/// Thrown when device sync service or credential store is unavailable
/// (e.g. hung Keystore without fallback, or storage failure).
/// Explicitly does NOT affect local auth or operations.
class DeviceSyncUnavailableException extends DeviceSyncException {
  const DeviceSyncUnavailableException(super.message);
}

/// Thrown when a device sync credential has been revoked or blocked by the server
/// (e.g. DEVICE_REVOKED, AUTH_BLOCKED, status 401/403).
/// Does not delete local outbox or database data.
class DeviceSyncRevokedException extends DeviceSyncException {
  const DeviceSyncRevokedException({
    required this.reason,
    String? message,
  }) : super(message ?? 'Device sync credential revoked: $reason');

  final String reason;
}

/// Thrown when an incoming provisioning payload attempts to overwrite a higher or equal
/// credential version with an older/stale version.
class StaleCredentialVersionException extends DeviceSyncException {
  const StaleCredentialVersionException({
    required this.currentVersion,
    required this.proposedVersion,
  }) : super(
          'Cannot overwrite device credential version $currentVersion with stale version $proposedVersion',
        );

  final int currentVersion;
  final int proposedVersion;
}

/// Thrown when an illegal or prohibited field (such as user credentials, human tokens,
/// passwords, PINs, or TOTP seeds) is passed or detected in a device sync schema/store.
class DeviceSyncProhibitedFieldException extends DeviceSyncException {
  const DeviceSyncProhibitedFieldException(this.fieldName)
      : super('Prohibited field detected in device sync schema: $fieldName');

  final String fieldName;
}

/// Thrown when cross-store reconciliation encounters equal credential versions with
/// conflicting credentialId, secret, or device binding.
class DeviceSyncConflictException extends DeviceSyncException {
  const DeviceSyncConflictException(super.message);
}

/// Thrown when two-phase persistence verification fails (readback mismatch).
class DeviceSyncPersistenceVerificationException extends DeviceSyncException {
  const DeviceSyncPersistenceVerificationException(super.message);
}

/// Thrown when a device sync renewal token response is malformed, invalid, or
/// violates the expected token contract (blank token, non-Bearer, non-positive expiry).
class DeviceSyncMalformedResponseException extends DeviceSyncException {
  const DeviceSyncMalformedResponseException(super.message);
}

/// Thrown when a device sync credential is in a terminal state (REVOKED or RETIRED)
/// or server preconditions mandate manual recovery; auto-bootstrap is blocked.
class DeviceSyncRecoveryRequiredException extends DeviceSyncException {
  const DeviceSyncRecoveryRequiredException([
    String message = 'Device sync credential requires explicit recovery; auto-bootstrap is blocked',
  ]) : super(message);
}

