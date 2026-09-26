/// Result of a successful pre-auth linking code claim (issue #556).
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
  });

  final String tenantId;
  final String slug;
  final String deviceId;

  /// Server timestamp of the linking event, if provided.
  final String? linkedAt;
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
