import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart' as crypto;

import '../../domain/ports/company_logo_port.dart';
import '../../domain/services/config/printer_config_service.dart';
import '../../domain/services/printer/thermal_logo_processor.dart';
import '../daos/local_config_dao.dart';
import '../database/app_database.dart';
import '../services/fiscal_inbox_handler.dart';

/// The outcome of an explicit human adoption of the company logo.
///
/// `success == false` ALWAYS means the previous local raster is
/// byte-identical to what it was before the attempt: every failure path in
/// [CompanyLogoAdoptionService.adoptCompanyLogo] returns BEFORE any write to
/// `local_configs` (S7: "el raster local queda intacto").
class CompanyLogoAdoptionResult {
  final bool success;
  final String? errorMessage;

  const CompanyLogoAdoptionResult.success()
      : success = true,
        errorMessage = null;

  const CompanyLogoAdoptionResult.failure(this.errorMessage)
      : success = false;
}

/// Company identity parity P4 (odd/tasks/identidad-empresa-paridad.md, S5,
/// S7, L4): the terminal learns the company HAS a cloud logo from the sha256
/// REFERENCE the fiscal snapshot carries, and a HUMAN may adopt it from the
/// hardware screen.
///
/// Hard contracts, each pinned by test:
///
/// - INERT BY DEFAULT: reading the reference writes nothing; adoption is the
///   only writer of `printer_logo_*` in this feature, and it writes exactly
///   ONE key (`printer_logo_base64`) via
///   [PrinterConfigService.adoptCompanyLogoRaster].
/// - NEVER DEGRADE: fetch failure, corrupt/tampered bytes, derivation
///   failure, and persistence failure all return before any write, so the
///   previous local raster survives byte-identical.
/// - RESPECT LOCAL TUNING: adoption replaces the raster, never the
///   operator's `printer_logo_width`, `printer_logo_height` or
///   `printer_logo_enabled` settings.
/// - REUSE: derivation goes through the SAME
///   [ThermalLogoProcessor.processPngBytes] call the manual upload path
///   uses — never a second rasterizer.
class CompanyLogoAdoptionService {
  CompanyLogoAdoptionService({
    required AppDatabase database,
    required PrinterConfigService configService,
    required CompanyLogoPort logoPort,
    Future<LogoProcessingResult> Function(Uint8List pngBytes)? deriveRaster,
  })  : _database = database,
        _configService = configService,
        _logoPort = logoPort,
        // Default: the EXACT call the manual upload path makes
        // (hardware_settings_view_model.uploadAndProcessLogo) — same target
        // width, same dithering. One rasterizer, one behavior.
        _deriveRaster =
            deriveRaster ?? _defaultDeriveRaster;

  final AppDatabase _database;
  final PrinterConfigService _configService;
  final CompanyLogoPort _logoPort;
  final Future<LogoProcessingResult> Function(Uint8List pngBytes)
      _deriveRaster;

  static Future<LogoProcessingResult> _defaultDeriveRaster(
    Uint8List pngBytes,
  ) {
    return ThermalLogoProcessor.processPngBytes(
      pngBytes,
      maxWidth: ThermalLogoProcessor.maxThermalWidth58mm,
      applyDithering: true,
    );
  }

  /// The sha256 REFERENCE of the company logo as carried by the latest
  /// stored fiscal snapshot (`logoSha256`), or `null` when the company has
  /// no cloud logo (absent, null, or blank — declared absence, S3).
  ///
  /// READ-ONLY: this is how the terminal "learns the company has a logo"
  /// without the sync path writing anything. It reads the snapshot the
  /// [FiscalInboxHandler] already persisted whole per revision; no new sync
  /// mechanism (S2).
  Future<String?> readCloudLogoSha256() async {
    try {
      final tenantEntity = await _database.localConfigDao
          .getConfigByKey(FiscalProjectionKeys.tenantId);
      final tenantId = tenantEntity?.value.trim() ?? '';
      if (tenantId.isEmpty) return null;

      final snapshot =
          await _database.fiscalConfigLocalDao.getByTenantId(tenantId);
      if (snapshot == null) return null;

      final dynamic decoded;
      try {
        decoded = jsonDecode(snapshot.payload);
      } catch (_) {
        return null;
      }
      if (decoded is! Map<String, dynamic>) return null;

      final raw = decoded['logoSha256'];
      final value = raw?.toString().trim() ?? '';
      return value.isEmpty ? null : value;
    } catch (_) {
      // A failed READ must never touch anything and never block the screen.
      return null;
    }
  }

  /// Explicit human adoption: fetch the original, verify it against the
  /// snapshot reference, derive the thermal raster with the existing
  /// processor, and persist ONLY the raster — the operator's width/height/
  /// enabled tuning survives untouched.
  ///
  /// Every failure mode returns [CompanyLogoAdoptionResult.failure] (or
  /// throws nothing) with the previous local raster byte-identical.
  Future<CompanyLogoAdoptionResult> adoptCompanyLogo() async {
    // 1. The snapshot must DECLARE a cloud logo. Without a reference there
    //    is nothing to adopt — and nothing is written.
    final expectedSha256 = await readCloudLogoSha256();
    if (expectedSha256 == null) {
      return const CompanyLogoAdoptionResult.failure(
        'La empresa no tiene un logo en la nube. Nada fue modificado.',
      );
    }

    // 2. Fetch the original. A fetch failure must never be confused with
    //    "no cloud logo" and never persists anything.
    final CloudCompanyLogoOriginal original;
    try {
      original = await _logoPort.fetchOriginal()
          ?? (throw const CompanyLogoFetchException(
              'La nube no reporta un logo de empresa.'));
    } catch (e) {
      return CompanyLogoAdoptionResult.failure(
        'No se pudo descargar el logo de la empresa: $e. '
        'El logo local quedó intacto.',
      );
    }

    // 3. Integrity: the fetched bytes must hash to the sha256 the snapshot
    //    carries AND the transport must not have corrupted them in flight
    //    (both verified — a mismatch aborts before any derivation or write).
    final fetchedShaMatchesReference = original.sha256.trim() == expectedSha256;
    final Uint8List bytes = original.bytes;
    final String locallyComputedSha256;
    try {
      locallyComputedSha256 = crypto.sha256.convert(bytes).toString();
    } catch (e) {
      return CompanyLogoAdoptionResult.failure(
        'No se pudo verificar la integridad del logo descargado: $e. '
        'El logo local quedó intacto.',
      );
    }
    if (!fetchedShaMatchesReference ||
        locallyComputedSha256 != expectedSha256) {
      return const CompanyLogoAdoptionResult.failure(
        'El logo descargado no coincide con la referencia de la empresa '
        '(integridad). Nada fue modificado; reintenta la sincronización.',
      );
    }

    // 4. Derive the thermal raster with the EXISTING processor. Derivation
    //    happens fully in memory: any throw or invalid result returns here,
    //    before any write.
    final LogoProcessingResult derived;
    try {
      derived = await _deriveRaster(bytes);
    } catch (e) {
      return CompanyLogoAdoptionResult.failure(
        'No se pudo derivar el raster térmico del logo: $e. '
        'El logo local quedó intacto.',
      );
    }
    if (!derived.isValid) {
      return CompanyLogoAdoptionResult.failure(
        'El logo descargado no se pudo convertir para la impresora térmica'
        '${derived.errorMessage == null ? '.' : ': ${derived.errorMessage}'} '
        'El logo local quedó intacto.',
      );
    }
    final base64Raster =
        derived.base64Png ?? base64Encode(derived.raw1BitBitmap!);

    // 5. Persist exactly ONE key. If this write throws, the single-key
    //    SQLite replace is atomic — the previous raster survives untouched.
    try {
      await _configService.adoptCompanyLogoRaster(base64Raster);
    } catch (e) {
      return CompanyLogoAdoptionResult.failure(
        'No se pudo guardar el logo derivado: $e. '
        'El logo local quedó intacto.',
      );
    }

    return const CompanyLogoAdoptionResult.success();
  }
}
