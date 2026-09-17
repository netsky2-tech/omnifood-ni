import 'dart:io';
import 'package:dio/dio.dart';
import '../../domain/security/device_sync_exceptions.dart';
import '../../domain/security/device_sync_exchange_port.dart';

/// Implementation of [DeviceSyncExchangePort] using a dedicated bare/authless [Dio].
///
/// Under no circumstances does this class attach human credentials or call
/// human authentication / session refresh endpoints.
class DioDeviceSyncExchangePort implements DeviceSyncExchangePort {
  const DioDeviceSyncExchangePort(this._dio);

  final Dio _dio;

  static const String _tokenEndpoint = '/identity/device-sync/token';
  static const String _revokedCode = 'DEVICE_REVOKED';

  @override
  Future<DeviceSyncTokenResponse> renewToken({
    required String credentialId,
    required String deviceId,
    required String renewalSecret,
    required String tenantId,
    required int expectedCredentialVersion,
  }) async {
    try {
      final response = await _dio.post<dynamic>(
        _tokenEndpoint,
        data: {
          'credentialId': credentialId,
          'renewalSecret': renewalSecret,
          'declarativeTenantId': tenantId,
          'declarativeDeviceId': deviceId,
          'expectedCredentialVersion': expectedCredentialVersion,
        },
        options: Options(
          headers: {HttpHeaders.contentTypeHeader: 'application/json'},
        ),
      );

      final data = response.data;
      if (data is! Map<String, dynamic>) {
        throw const DeviceSyncMalformedResponseException(
          'Device sync token exchange returned non-object response payload',
        );
      }

      final accessToken = data['accessToken'] as String? ?? '';
      final tokenType = data['tokenType'] as String? ?? '';
      final expiresIn = (data['expiresIn'] as num?)?.toInt() ?? 0;
      final rawExpiresAt = data['expiresAt'] as String?;
      final expiresAt = rawExpiresAt != null
          ? DateTime.tryParse(rawExpiresAt)?.toUtc()
          : DateTime.now().toUtc().add(Duration(seconds: expiresIn));

      return DeviceSyncTokenResponse(
        accessToken: accessToken,
        tokenType: tokenType,
        expiresIn: expiresIn,
        expiresAt: expiresAt,
      );
    } on DioException catch (dioErr) {
      _mapDioException(dioErr);
    } catch (e) {
      if (e is DeviceSyncException) rethrow;
      throw DeviceSyncUnavailableException(
        'Device sync exchange port network error: $e',
      );
    }
  }

  Never _mapDioException(DioException dioErr) {
    final response = dioErr.response;
    final statusCode = response?.statusCode;
    final data = response?.data;

    if (data is Map<String, dynamic>) {
      final code = data['code'] as String?;
      final error = data['error'] as String?;
      final message = data['message'] as String? ?? '';

      if (code == _revokedCode || error == _revokedCode) {
        throw const DeviceSyncRevokedException(reason: _revokedCode);
      }

      throw DeviceSyncUnavailableException(
        'Device sync token exchange failed (HTTP $statusCode): $message',
      );
    }

    throw DeviceSyncUnavailableException(
      'Device sync token exchange unavailable (HTTP $statusCode): ${dioErr.message}',
    );
  }
}
