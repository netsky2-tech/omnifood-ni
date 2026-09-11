class CloudCredentials {
  CloudCredentials({
    required this.accessToken,
    required this.refreshToken,
    required this.userId,
    required this.tenantId,
    required this.issuedAtUtc,
  }) {
    if ([accessToken, refreshToken, userId, tenantId].any((v) => v.isEmpty) ||
        !issuedAtUtc.isUtc) {
      throw ArgumentError(
        'Credentials require nonempty values and a UTC date.',
      );
    }
  }
  final String accessToken;
  final String refreshToken;
  final String userId;
  final String tenantId;
  final DateTime issuedAtUtc;
}
