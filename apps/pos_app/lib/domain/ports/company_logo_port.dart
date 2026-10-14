import 'dart:typed_data';

/// The company logo ORIGINAL as stored in the cloud (`tenant_brand_assets`).
///
/// Company identity parity P4 (odd/tasks/identidad-empresa-paridad.md, S5):
/// the cloud holds ONE original; the terminal derives its own 1-bit thermal
/// raster from it with the rasterization code it already has. This is the
/// original artifact — never the terminal's derived raster, never the fiscal
/// snapshot (which carries only the sha256 REFERENCE, never bytes).
class CloudCompanyLogoOriginal {
  final String sha256;
  final String contentType;
  final Uint8List bytes;

  const CloudCompanyLogoOriginal({
    required this.sha256,
    required this.contentType,
    required this.bytes,
  });
}

/// Fetches the company logo ORIGINAL from the cloud over the DEVICE
/// transport (GET /v1/sync/inbound/company-logo, SyncTransportGuard).
///
/// S7/L4 adoption contract: this port is READ-ONLY. Nothing on the terminal
/// writes `printer_logo_*` unless a human explicitly applies the logo from
/// the hardware screen; a terminal that never calls this port keeps printing
/// exactly what it prints today.
abstract class CompanyLogoPort {
  /// Returns the stored original, or `null` when the company has NO cloud
  /// logo — a declared absence (S3), never an empty payload.
  ///
  /// Throws [CompanyLogoFetchException] when the fetch itself fails (network,
  /// transport, malformed response). A failed fetch must never be mistaken
  /// for "no cloud logo".
  Future<CloudCompanyLogoOriginal?> fetchOriginal();
}

/// The fetch of the original failed BEFORE any local state was touched.
class CompanyLogoFetchException implements Exception {
  final String message;
  const CompanyLogoFetchException(this.message);

  @override
  String toString() => 'CompanyLogoFetchException: $message';
}
