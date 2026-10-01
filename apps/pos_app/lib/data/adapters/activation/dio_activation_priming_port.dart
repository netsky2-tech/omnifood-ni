import 'package:dio/dio.dart';

import '../../../domain/services/sales/dgi_numbering_service.dart';
import '../../ports/activation_priming_port.dart';

/// Dio adapter for the human-authenticated terminal priming fetch.
///
/// Follows the [DioActivationSyncPort] conventions: the relative path is
/// issued over the same human-authenticated Dio client the activation flow
/// uses, network failures propagate as [DioException] (the caller must block
/// activation when the backend is unreachable), and an unusable payload raises
/// the named [TerminalPrimingPayloadException] instead of being applied.
///
/// The optional `proposedSequence` query parameter offers this terminal's
/// local fiscal cursor to the backend replay tripwire (D-6 / #526 unit B5).
/// A refusal is a named, parseable outcome — never a silent clamp and never a
/// raw transport error — so the caller can surface it to the operator and
/// leave the cursor untouched.
class DioActivationPrimingPort implements ActivationPrimingPort {
  static const String _fiscalRefusalCode =
      'FISCAL_SEQUENCE_RECOVERY_REQUIRED';

  final Dio _dio;

  DioActivationPrimingPort(this._dio);

  @override
  Future<TerminalPrimingPayload> fetchPrimingPayload({
    int? proposedSequence,
  }) async {
    final Response<dynamic> response;
    try {
      response = await _dio.get<dynamic>(
        'onboarding/terminals/priming',
        // Always passed explicitly: null means "no proposal" (a fresh device),
        // which the backend treats as byte-identical to the legacy request.
        queryParameters: proposedSequence == null
            ? null
            : <String, dynamic>{'proposedSequence': proposedSequence},
      );
    } on DioException catch (error) {
      final refusal = _fiscalRefusalFrom(error);
      if (refusal != null) {
        throw refusal;
      }
      rethrow;
    }

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

  /// Maps a 409 carrying the named fiscal refusal onto the domain error.
  ///
  /// Mirrors the sibling transport convention (`errorData['code'] ??
  /// errorData['error']`) so the code is read from either field the backend
  /// populates. Both refusal variants are handled: the one that names the
  /// conflicting cloud sequence and the one where the backend could not read
  /// its MAX and reports `highestSequenceNumber: null`.
  FiscalSequenceRecoveryRequiredError? _fiscalRefusalFrom(DioException error) {
    final response = error.response;
    if (response == null || response.statusCode != 409) return null;

    final data = response.data;
    if (data is! Map) return null;

    final body = Map<String, dynamic>.from(data);
    final code = body['code'] ?? body['error'];
    if (code != _fiscalRefusalCode) return null;

    final message = body['message'];
    return FiscalSequenceRecoveryRequiredError(
      message is String && message.isNotEmpty
          ? message
          : 'Fiscal sequence recovery required: this terminal cannot sell '
              'until the fiscal sequence is reconciled.',
      highestSequenceNumber: _asInt(body['highestSequenceNumber']),
      proposedSequence: _asInt(body['proposedSequence']),
    );
  }

  int? _asInt(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    if (value is String) return int.tryParse(value);
    return null;
  }
}
