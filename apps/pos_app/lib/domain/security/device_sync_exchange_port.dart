import 'package:flutter/foundation.dart';

/// Response payload from the device sync renewal token exchange.
@immutable
class DeviceSyncTokenResponse {
  const DeviceSyncTokenResponse({
    required this.accessToken,
    required this.tokenType,
    required this.expiresIn,
    this.expiresAt,
  });

  final String accessToken;
  final String tokenType;
  final int expiresIn;
  final DateTime? expiresAt;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is DeviceSyncTokenResponse &&
          runtimeType == other.runtimeType &&
          accessToken == other.accessToken &&
          tokenType == other.tokenType &&
          expiresIn == other.expiresIn &&
          expiresAt == other.expiresAt;

  @override
  int get hashCode => Object.hash(accessToken, tokenType, expiresIn, expiresAt);
}

/// Injectable transport port for exchanging device renewal credentials for
/// a short-lived sync access JWT.
///
/// Implemented by DSI-5 via dedicated sync Dio / interceptor.
abstract class DeviceSyncExchangePort {
  Future<DeviceSyncTokenResponse> renewToken({
    required String credentialId,
    required String deviceId,
    required String renewalSecret,
    required String tenantId,
    required int expectedCredentialVersion,
  });
}
