import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../../domain/ports/company_logo_port.dart';

/// Device-transport implementation of [CompanyLogoPort] against
/// GET /v1/sync/inbound/company-logo (backend CompanyLogoDeviceController,
/// SyncTransportGuard, `sync:pull` scope).
///
/// MUST be constructed on the DEDICATED device-sync Dio client (the one
/// carrying [DeviceSyncAuthInterceptor]): the interceptor attaches the
/// device credential only to canonical `v1/sync/*` routes, and this path is
/// one of them — no allowlist change was needed for that.
///
/// Inertness (S7): this class only performs a GET. It never writes local
/// state; persisting a derived raster happens only after a human explicitly
/// applies the logo, in CompanyLogoAdoptionService.
class DioCompanyLogoPort implements CompanyLogoPort {
  DioCompanyLogoPort(this._dio);

  final Dio _dio;

  /// Exact device-transported path (matching the baseUrl ending in /api).
  static const String deviceCompanyLogoPath =
      '/v1/sync/inbound/company-logo';

  @override
  Future<CloudCompanyLogoOriginal?> fetchOriginal() async {
    final Response<dynamic> response;
    try {
      response = await _dio.get<dynamic>(deviceCompanyLogoPath);
    } on DioException catch (e) {
      throw CompanyLogoFetchException(
        'falla de transporte (${e.type.name}${e.response?.statusCode == null ? '' : ', HTTP ${e.response?.statusCode}'})',
      );
    } catch (e) {
      throw CompanyLogoFetchException('falla inesperada: $e');
    }

    final data = response.data;
    if (data is! Map) {
      throw const CompanyLogoFetchException(
          'respuesta malformada: se esperaba un objeto JSON.');
    }

    // Declared absence (S3): the backend answers { present: false } when the
    // tenant has no cloud logo. That is a legitimate null, not a failure.
    if (data['present'] != true) {
      return null;
    }

    final sha256 = data['sha256']?.toString().trim() ?? '';
    final contentType = data['contentType']?.toString().trim() ?? '';
    final base64 = data['base64']?.toString().trim() ?? '';
    if (sha256.isEmpty || base64.isEmpty) {
      throw const CompanyLogoFetchException(
          'respuesta malformada: logo presente sin sha256 o sin bytes.');
    }

    final Uint8List bytes;
    try {
      final decoded = base64Decode(base64);
      bytes = Uint8List.fromList(decoded);
    } catch (e) {
      throw CompanyLogoFetchException('bytes base64 ilegibles: $e');
    }

    return CloudCompanyLogoOriginal(
      sha256: sha256,
      contentType: contentType,
      bytes: bytes,
    );
  }
}
