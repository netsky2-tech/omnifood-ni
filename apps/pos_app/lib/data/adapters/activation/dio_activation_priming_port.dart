import 'package:dio/dio.dart';

import '../../ports/activation_priming_port.dart';

/// Dio adapter for the human-authenticated terminal priming fetch.
///
/// Follows the [DioActivationSyncPort] conventions: the relative path is
/// issued over the same human-authenticated Dio client the activation flow
/// uses, network failures propagate as [DioException] (the caller must block
/// activation when the backend is unreachable), and an unusable payload raises
/// the named [TerminalPrimingPayloadException] instead of being applied.
class DioActivationPrimingPort implements ActivationPrimingPort {
  final Dio _dio;

  DioActivationPrimingPort(this._dio);

  @override
  Future<TerminalPrimingPayload> fetchPrimingPayload() async {
    final response = await _dio.get<dynamic>(
      'onboarding/terminals/priming',
    );

    final raw = response.data;
    if (raw is! Map) {
      // Covers JSON string bodies, JSON null and any other non-object shape.
      throw const TerminalPrimingPayloadException(
        'TERMINAL_PRIMING_PAYLOAD_MALFORMED',
        'Server returned a non-object terminal priming payload',
      );
    }

    return TerminalPrimingPayload.fromJson(Map<String, dynamic>.from(raw));
  }
}
