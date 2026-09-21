/// Read-only snapshot of the activation attempt the back office currently has
/// active for a tenant, as returned by GET /onboarding/activation/attempts/active.
///
/// Carries exactly the fields the local runners and the required-config adapter
/// read from the persisted `activation_attempts_local` row, plus the backend's
/// server time anchor. POS-local anchor bookkeeping (monotonic ticks, boot
/// session, verification ticket) is deliberately excluded: it is owned by the
/// device, never by the backend.
class ActivationAttemptSnapshot {
  final String attemptId;

  final String tenantId;

  /// Candidate terminal the back office registered for this attempt. The POS
  /// must compare it against this device's canonical identity before enrolling.
  final String candidateTerminalId;

  final int requiredFiscalRevision;

  final String requiredFiscalFingerprint;

  final String verificationProductId;

  /// Backend-assigned timestamp (serialized `startedAt`) of the attempt.
  final String assignedAt;

  /// The backend's `serverTimeAnchorAt` (column `server_time_anchor_at`),
  /// serialized as an ISO-8601 timestamp. This is the authoritative server
  /// clock anchor for TTFSS measurement; it is parsed and validated by the
  /// sync port before a snapshot is ever produced — a snapshot without a
  /// valid server anchor is never returned.
  final String serverTimeAnchorAt;

  const ActivationAttemptSnapshot({
    required this.attemptId,
    required this.tenantId,
    required this.candidateTerminalId,
    required this.requiredFiscalRevision,
    required this.requiredFiscalFingerprint,
    required this.verificationProductId,
    required this.assignedAt,
    required this.serverTimeAnchorAt,
  });
}
