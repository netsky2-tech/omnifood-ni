import 'package:dio/dio.dart';

import '../../../domain/security/device_sync_credential_coordinator.dart';
import '../../../domain/security/device_sync_credential_record.dart';
import '../../../domain/security/device_sync_exceptions.dart';
import '../../ports/activation_sync_port.dart';

class DioActivationSyncPort implements ActivationSyncPort {
  final Dio _dio;
  final DeviceSyncCredentialCoordinator? _coordinator;

  DioActivationSyncPort(this._dio, [this._coordinator]);

  @override
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
  }) async {
    final resolvedTerminalId = terminalId?.trim() ?? '';
    if (attemptId.trim().isEmpty || resolvedTerminalId.isEmpty) return false;
    try {
      final data = <String, dynamic>{
        'checkCode': checkCode,
        'status': status,
        if (evidenceType?.trim().isNotEmpty ?? false)
          'evidenceType': evidenceType,
        if (evidenceRef?.trim().isNotEmpty ?? false) 'evidenceRef': evidenceRef,
        if (occurredAt?.trim().isNotEmpty ?? false) 'occurredAt': occurredAt,
        if (tenantId?.trim().isNotEmpty ?? false)
          'declarativeTenantId': tenantId,
        'declarativeTerminalId': resolvedTerminalId,
      };
      if (details != null) {
        data['detailsSanitizedJson'] = details;
      }
      final response = await _dio.post<dynamic>(
        'onboarding/activation/attempts/${attemptId.trim()}/checks',
        data: data,
        options: Options(headers: {'x-device-terminal-id': resolvedTerminalId}),
      );
      return _isSuccess(response.statusCode);
    } on DioException {
      return false;
    }
  }

  @override
  Future<bool> sendFirstSaleClaim({
    required String attemptId,
    required Map<String, dynamic> claimPayload,
  }) async {
    final terminalId = (claimPayload['declarativeTerminalId'] as String? ?? '')
        .trim();
    if (attemptId.trim().isEmpty || terminalId.isEmpty) return false;
    try {
      final response = await _dio.post<dynamic>(
        'onboarding/activation/attempts/${attemptId.trim()}/first-sale-claim',
        data: claimPayload,
        options: Options(headers: {'x-device-terminal-id': terminalId}),
      );
      return _isSuccess(response.statusCode);
    } on DioException {
      return false;
    }
  }

  @override
  Future<bool> sendVerificationSale({
    required String attemptId,
    required Map<String, dynamic> salePayload,
  }) async {
    final terminalId = (salePayload['terminalId'] as String? ?? '').trim();
    final sourceDeviceId = (salePayload['sourceDeviceId'] as String? ?? '')
        .trim();
    if (attemptId.trim().isEmpty ||
        terminalId.isEmpty ||
        terminalId != sourceDeviceId) {
      return false;
    }
    try {
      final response = await _dio.post<dynamic>(
        'onboarding/activation/attempts/${attemptId.trim()}/verification-sale',
        data: salePayload,
        options: Options(headers: {'x-device-terminal-id': terminalId}),
      );
      return _isSuccess(response.statusCode);
    } on DioException {
      return false;
    }
  }

  @override
  Future<FinalizeActivationResult> finalizeActivation({
    required String tenantId,
    required String attemptId,
  }) async {
    if (tenantId.trim().isEmpty || attemptId.trim().isEmpty) {
      return const FinalizeActivationResult(
        isSuccess: false,
        status: 'NETWORK_ERROR',
        failureCode: 'ACTIVATION_IDENTITY_MISSING',
      );
    }
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        'onboarding/activation/attempts/${attemptId.trim()}/finalize',
      );
      final data = response.data;
      if (!_isSuccess(response.statusCode) || data == null) {
        return const FinalizeActivationResult(
          isSuccess: false,
          status: 'NETWORK_ERROR',
          failureCode: 'FINALIZE_UNACKNOWLEDGED',
        );
      }
      final status = data['status'] as String? ?? 'FAIL';
      return FinalizeActivationResult(
        isSuccess:
            status == 'PASS' ||
            status == 'PASS_WITH_WARNING' ||
            status == 'FAIL',
        status: status,
        failureCode: data['failureCode'] as String?,
        warningsCount: data['warningsCount'] as int? ?? 0,
      );
    } on DioException {
      return const FinalizeActivationResult(
        isSuccess: false,
        status: 'NETWORK_ERROR',
        failureCode: 'FINALIZE_NETWORK_ERROR',
      );
    }
  }

  bool _isSuccess(int? statusCode) =>
      statusCode != null && statusCode >= 200 && statusCode < 300;

  @override
  Future<DeviceSyncCredentialRecord> provisionDeviceSyncCredential({
    required String attemptId,
    required String expectedDeviceId,
  }) async {
    final cleanAttemptId = attemptId.trim();
    final cleanExpectedDeviceId = expectedDeviceId.trim();
    if (cleanAttemptId.isEmpty || cleanExpectedDeviceId.isEmpty) {
      throw ArgumentError('attemptId and expectedDeviceId must not be blank');
    }

    Response<dynamic> response;
    try {
      response = await _dio.post<dynamic>(
        'onboarding/activation/attempts/$cleanAttemptId/device-sync-credential',
      );
    } on DioException catch (e) {
      final statusCode = e.response?.statusCode;
      final errorData = e.response?.data;
      final errorCode = errorData is Map
          ? errorData['code'] ?? errorData['error']
          : null;

      if (statusCode == 409 && errorCode == 'DEVICE_RECOVERY_REQUIRED') {
        throw DeviceSyncRecoveryRequiredException(
          errorData is Map && errorData['message'] != null
              ? errorData['message'].toString()
              : 'Device credential requires explicit recovery; auto-bootstrap is blocked',
        );
      }
      if (statusCode == 401 && errorCode == 'DEVICE_REVOKED') {
        throw DeviceSyncRevokedException(
          reason: errorData is Map && errorData['message'] != null
              ? errorData['message'].toString()
              : 'REVOKED',
        );
      }
      rethrow;
    }

    final raw = response.data;
    if (raw is! Map) {
      throw const DeviceSyncMalformedResponseException(
        'Server returned non-object credential provisioning payload',
      );
    }

    final data = Map<String, dynamic>.from(raw);
    if (data.containsKey('renewalCredentialExpiresAt') &&
        !data.containsKey('expiresAt')) {
      data['expiresAt'] = data['renewalCredentialExpiresAt'];
      data.remove('renewalCredentialExpiresAt');
    }
    data.remove('status');

    final record = DeviceSyncCredentialRecord.fromJson(data);

    if (record.deviceId.trim() != cleanExpectedDeviceId) {
      throw StateError(
        'Provisioned device ID (${record.deviceId}) does not match expected terminal identity ($cleanExpectedDeviceId)',
      );
    }

    return record;
  }

  @override
  Future<DeviceSyncCredentialRecord> provisionBootstrapDeviceSyncCredential({
    required String deviceId,
  }) async {
    final cleanDeviceId = deviceId.trim();
    if (cleanDeviceId.isEmpty) {
      throw ArgumentError('deviceId must not be blank');
    }

    Response<dynamic> response;
    try {
      response = await _dio.post<dynamic>(
        'onboarding/activation/device-sync-credential',
        data: {'deviceId': cleanDeviceId},
      );
    } on DioException catch (e) {
      final statusCode = e.response?.statusCode;
      final errorData = e.response?.data;
      final errorCode = errorData is Map
          ? errorData['code'] ?? errorData['error']
          : null;

      if (statusCode == 409 && errorCode == 'DEVICE_RECOVERY_REQUIRED') {
        throw DeviceSyncRecoveryRequiredException(
          errorData is Map && errorData['message'] != null
              ? errorData['message'].toString()
              : 'Device credential requires explicit recovery; auto-bootstrap is blocked',
        );
      }
      if (statusCode == 401 && errorCode == 'DEVICE_REVOKED') {
        throw DeviceSyncRevokedException(
          reason: errorData is Map && errorData['message'] != null
              ? errorData['message'].toString()
              : 'REVOKED',
        );
      }
      rethrow;
    }

    final raw = response.data;
    if (raw is! Map) {
      throw const DeviceSyncMalformedResponseException(
        'Server returned non-object credential provisioning payload',
      );
    }

    final data = Map<String, dynamic>.from(raw);
    if (data.containsKey('renewalCredentialExpiresAt') &&
        !data.containsKey('expiresAt')) {
      data['expiresAt'] = data['renewalCredentialExpiresAt'];
      data.remove('renewalCredentialExpiresAt');
    }
    data.remove('status');

    final record = DeviceSyncCredentialRecord.fromJson(data);

    if (record.deviceId.trim() != cleanDeviceId) {
      throw StateError(
        'Provisioned device ID (${record.deviceId}) does not match expected terminal identity ($cleanDeviceId)',
      );
    }

    return record;
  }

  @override
  Future<DeviceSyncCredentialRecord> confirmDeviceSyncCredential({
    required String attemptId,
    required String credentialId,
    required String deviceId,
    required int credentialVersion,
    required String renewalSecret,
  }) async {
    final cleanAttemptId = attemptId.trim();
    if (cleanAttemptId.isEmpty) {
      throw ArgumentError('attemptId must not be blank');
    }

    try {
      final response = await _dio.post<dynamic>(
        'onboarding/activation/attempts/$cleanAttemptId/device-sync-credential/confirm',
        data: {
          'credentialId': credentialId,
          'deviceId': deviceId,
          'credentialVersion': credentialVersion,
          'renewalSecret': renewalSecret,
        },
      );

      final raw = response.data;
      if (raw is! Map) {
        throw const DeviceSyncMalformedResponseException(
          'Server returned non-object credential confirm payload',
        );
      }

      final data = Map<String, dynamic>.from(raw);
      if (data.containsKey('renewalCredentialExpiresAt') &&
          !data.containsKey('expiresAt')) {
        data['expiresAt'] = data['renewalCredentialExpiresAt'];
        data.remove('renewalCredentialExpiresAt');
      }
      data.remove('status');

      if (!data.containsKey('renewalSecret') || data['renewalSecret'] == null) {
        data['renewalSecret'] = renewalSecret;
      }

      return DeviceSyncCredentialRecord.fromJson(data);
    } on DioException catch (e) {
      final statusCode = e.response?.statusCode;
      final errorData = e.response?.data;
      final errorCode = errorData is Map
          ? errorData['code'] ?? errorData['error']
          : null;

      if (statusCode == 409 && errorCode == 'DEVICE_RECOVERY_REQUIRED') {
        throw DeviceSyncRecoveryRequiredException(
          errorData is Map && errorData['message'] != null
              ? errorData['message'].toString()
              : 'Device credential requires explicit recovery; auto-bootstrap is blocked',
        );
      }
      if (statusCode == 401 && errorCode == 'DEVICE_REVOKED') {
        throw DeviceSyncRevokedException(
          reason: errorData is Map && errorData['message'] != null
              ? errorData['message'].toString()
              : 'REVOKED',
        );
      }
      rethrow;
    }
  }

  @override
  Future<DeviceSyncCredentialRecord> confirmBootstrapDeviceSyncCredential({
    required String credentialId,
    required String deviceId,
    required int credentialVersion,
    required String renewalSecret,
  }) async {
    final cleanDeviceId = deviceId.trim();
    if (cleanDeviceId.isEmpty) {
      throw ArgumentError('deviceId must not be blank');
    }

    try {
      final response = await _dio.post<dynamic>(
        'onboarding/activation/device-sync-credential/confirm',
        data: {
          'credentialId': credentialId,
          'deviceId': cleanDeviceId,
          'credentialVersion': credentialVersion,
          'renewalSecret': renewalSecret,
        },
      );

      final raw = response.data;
      if (raw is! Map) {
        throw const DeviceSyncMalformedResponseException(
          'Server returned non-object credential confirm payload',
        );
      }

      final data = Map<String, dynamic>.from(raw);
      if (data.containsKey('renewalCredentialExpiresAt') &&
          !data.containsKey('expiresAt')) {
        data['expiresAt'] = data['renewalCredentialExpiresAt'];
        data.remove('renewalCredentialExpiresAt');
      }
      data.remove('status');

      if (!data.containsKey('renewalSecret') || data['renewalSecret'] == null) {
        data['renewalSecret'] = renewalSecret;
      }

      return DeviceSyncCredentialRecord.fromJson(data);
    } on DioException catch (e) {
      final statusCode = e.response?.statusCode;
      final errorData = e.response?.data;
      final errorCode = errorData is Map
          ? errorData['code'] ?? errorData['error']
          : null;

      if (statusCode == 409 && errorCode == 'DEVICE_RECOVERY_REQUIRED') {
        throw DeviceSyncRecoveryRequiredException(
          errorData is Map && errorData['message'] != null
              ? errorData['message'].toString()
              : 'Device credential requires explicit recovery; auto-bootstrap is blocked',
        );
      }
      if (statusCode == 401 && errorCode == 'DEVICE_REVOKED') {
        throw DeviceSyncRevokedException(
          reason: errorData is Map && errorData['message'] != null
              ? errorData['message'].toString()
              : 'REVOKED',
        );
      }
      rethrow;
    }
  }
}
