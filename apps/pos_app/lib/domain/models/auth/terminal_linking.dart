/// Result of a successful pre-auth linking code claim (issue #556, #566).
///
/// Plain immutable value object (no codegen): the terminal binding context
/// captured BEFORE any login attempt. The slug is pre-auth routing context,
/// never authority.
class TerminalLinking {
  const TerminalLinking({
    required this.tenantId,
    required this.slug,
    required this.deviceId,
    this.linkedAt,
    this.reactivationChallengeId,
  });

  final String tenantId;
  final String slug;
  final String deviceId;

  /// Server timestamp of the linking event, if provided.
  final String? linkedAt;

  /// Optional auto-approved reactivation challenge ID returned when claiming a
  /// factory-reset replacement linking code (issue #566).
  final String? reactivationChallengeId;
}

/// Result of pre-auth `POST /onboarding/activation/device-lookup` (issue #566).
class DeviceReactivationLookupResult {
  const DeviceReactivationLookupResult({
    required this.found,
    this.recoveryChallengeId,
    this.status,
    this.maskedHint,
    this.expiresAt,
  });

  const DeviceReactivationLookupResult.notFound()
      : found = false,
        recoveryChallengeId = null,
        status = null,
        maskedHint = null,
        expiresAt = null;

  final bool found;
  final String? recoveryChallengeId;
  final String? status;
  final String? maskedHint;
  final DateTime? expiresAt;
}

/// Result of pre-auth `POST /onboarding/activation/reactivation/:challengeId/complete`
/// (issue #566): carries the canonical terminal ID and rotated sync credential.
class CompletedReactivationResult {
  const CompletedReactivationResult({
    required this.tenantId,
    required this.slug,
    required this.terminalId,
    required this.activationAttemptId,
    required this.credentialId,
    required this.version,
    required this.renewalSecret,
    required this.expiresAt,
    required this.previousVersion,
  });

  final String tenantId;
  final String slug;
  final String terminalId;
  final String activationAttemptId;
  final String credentialId;
  final int version;
  final String renewalSecret;
  final DateTime expiresAt;
  final int previousVersion;
}

/// User-facing failure of a linking code claim. The message is already
/// localized and non-enumerating: the backend collapses unknown/expired/
/// claimed/revoked codes into a single 401, and the POS must not
/// distinguish them.
class LinkingClaimException implements Exception {
  const LinkingClaimException(this.userMessage, {this.statusCode});

  final String userMessage;
  final int? statusCode;

  @override
  String toString() => 'LinkingClaimException($statusCode): $userMessage';
}

/// User-facing failure of a terminal reactivation operation (issue #566).
class TerminalReactivationException implements Exception {
  const TerminalReactivationException(
    this.userMessage, {
    this.code,
    this.statusCode,
  });

  final String userMessage;
  final String? code;
  final int? statusCode;

  @override
  String toString() =>
      'TerminalReactivationException($statusCode, $code): $userMessage';
}
