import 'package:dio/dio.dart';

import '../../ports/activation_sync_port.dart';

class DioActivationSyncPort implements ActivationSyncPort {
  final Dio _dio;

  DioActivationSyncPort(this._dio);

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
      final response = await _dio.post<dynamic>(
        'onboarding/activation/attempts/${attemptId.trim()}/checks',
        data: <String, dynamic>{
          'checkCode': checkCode,
          'status': status,
          if (evidenceType?.trim().isNotEmpty ?? false) 'evidenceType': evidenceType,
          if (evidenceRef?.trim().isNotEmpty ?? false) 'evidenceRef': evidenceRef,
          if (occurredAt?.trim().isNotEmpty ?? false) 'occurredAt': occurredAt,
          if (details != null) 'detailsSanitizedJson': details,
          if (tenantId?.trim().isNotEmpty ?? false)
            'declarativeTenantId': tenantId,
          'declarativeTerminalId': resolvedTerminalId,
        },
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
    final terminalId = (claimPayload['declarativeTerminalId'] as String? ?? '').trim();
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
    final sourceDeviceId = (salePayload['sourceDeviceId'] as String? ?? '').trim();
    if (attemptId.trim().isEmpty || terminalId.isEmpty || terminalId != sourceDeviceId) {
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
        isSuccess: status == 'PASS' || status == 'PASS_WITH_WARNING' || status == 'FAIL',
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

  bool _isSuccess(int? statusCode) => statusCode != null && statusCode >= 200 && statusCode < 300;
}
