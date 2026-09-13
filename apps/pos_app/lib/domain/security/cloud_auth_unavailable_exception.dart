/// Thrown when cloud credentials cannot be recovered for an authenticated request.
///
/// This is a TEMPORAL condition — the device may lack credentials because:
/// - Keystore is degraded (circuit breaker open) and no in-memory credential exists
/// - No prior login has occurred in this process
/// - All credential slots are empty or corrupt
///
/// Callers MUST treat this as a retryable state, NOT a permanent failure.
/// Outbox events MUST NOT be discarded.
class CloudAuthUnavailableException implements Exception {
  const CloudAuthUnavailableException({required this.reason});
  final String reason;

  @override
  String toString() => 'CloudAuthUnavailable: $reason';
}
