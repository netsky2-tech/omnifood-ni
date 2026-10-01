import 'package:flutter/foundation.dart';

import '../../../../data/daos/local_config_dao.dart';
import '../../../../data/services/api_base_url_service.dart';
import '../../../../data/services/terminal_identity_service.dart';
import '../../../../domain/models/config/printer_config.dart';
import '../../../../domain/services/config/printer_config_service.dart';

/// View model for the terminal configuration surface: the canonical identity
/// (read-only) and the backend server URL configuration (the single write
/// surface, transport configuration only).
///
/// IDENTITY — HARD REQUIREMENT: this surface never mutates identity state. It
/// reads the persisted identity via [LocalConfigDao.getConfigByKey] using
/// [TerminalIdentityService.localDeviceIdKey] and deliberately does NOT call
/// `TerminalIdentityService.resolveDeviceId()`, which persists a newly
/// generated `pos-local-<uuid>` when no build-time id is present.
///
/// SERVER URL — the one exception: the operator may save or clear the backend
/// URL through [ApiBaseUrlService]. CONSTRAINT: transport configuration only —
/// it must never be reachable from the sale path, the DGI numbering path, or
/// any fiscal operation. The URL is resolved once at startup, so a change
/// applies on the NEXT app start; the UI must say so, never imply a live
/// change. Read or write failures surface an error message instead of
/// crashing the view, mirroring how [load] handles errors.
class TerminalIdentityViewModel extends ChangeNotifier {
  TerminalIdentityViewModel({
    required LocalConfigDao configDao,
    required PrinterConfigService printerConfigService,
    ApiBaseUrlService? apiBaseUrlService,
    String buildTimeDeviceId = const String.fromEnvironment('DEVICE_ID'),
    String buildTimeApiUrl = const String.fromEnvironment('API_URL'),
  })  : _configDao = configDao,
        _printerConfigService = printerConfigService,
        _apiBaseUrlService =
            apiBaseUrlService ?? ApiBaseUrlService(configDao),
        _buildTimeDeviceId = buildTimeDeviceId.trim(),
        _buildTimeApiUrl = buildTimeApiUrl {
    load();
  }

  final LocalConfigDao _configDao;
  final PrinterConfigService _printerConfigService;
  final ApiBaseUrlService _apiBaseUrlService;
  final String _buildTimeDeviceId;
  final String _buildTimeApiUrl;

  String? _terminalId;

  /// Factual comparison result; never a provenance claim. See
  /// [matchesBuildTimeId] for the exact contract.
  bool? _matchesBuildTimeId;
  String? _printerDriverLabel;
  int? _paperWidthMm;
  bool _isLoading = false;
  String? _errorMessage;
  ApiBaseUrlResolution? _serverResolution;
  String? _serverErrorMessage;

  /// Canonical terminal id persisted on this device, or `null` when the
  /// terminal has no identity yet.
  /// Canonical terminal id persisted on this device, or `null` when the
  /// terminal has no identity yet.
  String? get terminalId => _terminalId;

  /// Build-time device id compiled into this build. May be empty when the
  /// app was built without a `DEVICE_ID` dart-define.
  String get buildTimeId => _buildTimeDeviceId;

  /// Whether the persisted identity equals the compiled build-time id.
  ///
  /// IMPORTANT: this is a plain string comparison, NOT provenance. The origin
  /// of the persisted value is never stored, so it cannot be recovered here:
  /// this flag can only state that the two strings are equal. `null` means no
  /// identity is persisted yet; `false` covers both a differing value and a
  /// build without a compiled id.
  bool? get matchesBuildTimeId => _matchesBuildTimeId;

  /// Label of the active printer driver, matching the hardware screen.
  String? get printerDriverLabel => _printerDriverLabel;

  /// Configured thermal paper width in millimetres.
  int? get paperWidthMm => _paperWidthMm;

  bool get isLoading => _isLoading;

  String? get errorMessage => _errorMessage;

  /// Resolution of the effective backend URL, with the provenance the UI must
  /// report verbatim. `null` only before the first load completes.
  ApiBaseUrlResolution? get serverResolution => _serverResolution;

  /// Effective backend URL, or `null` when the transport is unconfigured.
  String? get effectiveServerUrl => _serverResolution?.url;

  /// Operator-facing failure of the last server-URL save or clear attempt,
  /// or of the server configuration read. Null when the last action succeeded.
  String? get serverErrorMessage => _serverErrorMessage;

  /// Loads the persisted identity, the printer profile, and the server URL
  /// resolution. Read failures surface an error message; they never crash.
  Future<void> load() async {
    _isLoading = true;
    notifyListeners();

    try {
      // Read-only: only getConfigByKey is ever called on the DAO here.
      final entity = await _configDao
          .getConfigByKey(TerminalIdentityService.localDeviceIdKey);
      final persistedValue = entity?.value.trim();

      if (persistedValue == null || persistedValue.isEmpty) {
        _terminalId = null;
        _matchesBuildTimeId = null;
      } else {
        _terminalId = persistedValue;
        // Factual comparison only: never claim when or where the identity
        // was generated.
        _matchesBuildTimeId = _buildTimeDeviceId == persistedValue;
      }

      final printerConfig = await _printerConfigService.getPrinterConfig();
      _printerDriverLabel = driverLabelFor(printerConfig.driverType);
      _paperWidthMm = printerConfig.paperWidthMm;

      _serverResolution = await _apiBaseUrlService
          .resolve(buildTimeApiUrl: _buildTimeApiUrl);
    } catch (e) {
      _errorMessage = 'Error al cargar la identidad de la terminal: $e';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Persists an operator-supplied backend URL through [ApiBaseUrlService],
  /// which validates it. An invalid URL persists nothing and the rejection
  /// message is surfaced to the operator. A failure never crashes the view.
  Future<void> saveServerUrl(String url) async {
    try {
      await _apiBaseUrlService.save(url);
      _serverErrorMessage = null;
      await load();
    } on ApiBaseUrlValidationException catch (e) {
      _serverErrorMessage = _serverUrlRejectionMessage(e.reason);
      notifyListeners();
    } catch (e) {
      _serverErrorMessage = 'Error al guardar la URL del servidor: $e';
      notifyListeners();
    }
  }

  /// Removes the persisted backend URL so resolution falls back to the build
  /// define or the documented defaults on the next app start. A failure
  /// never crashes the view.
  Future<void> clearServerUrl() async {
    try {
      await _apiBaseUrlService.clear();
      _serverErrorMessage = null;
      await load();
    } catch (e) {
      _serverErrorMessage = 'Error al borrar la URL del servidor: $e';
      notifyListeners();
    }
  }

  /// Maps a [PrinterDriverType] to the same label shown on the hardware
  /// settings screen. Read-only mapping; no hardware defaults are changed.
  static String driverLabelFor(PrinterDriverType driverType) {
    switch (driverType) {
      case PrinterDriverType.sunmiV2s:
        return 'Sunmi V2s';
      case PrinterDriverType.mock:
        return 'Simulador';
      case PrinterDriverType.escPosNetwork:
        return 'Red TCP/IP';
      case PrinterDriverType.iPosQ80:
        return 'Q80 / iPos';
    }
  }

  /// Operator-facing Spanish copy for a validation rejection, keyed on the
  /// structured reason from [ApiBaseUrlService]. The service message is the
  /// English text mirrored from `scripts/build_pos_apk.sh` and is never
  /// rendered here: this screen is Spanish-only.
  static String _serverUrlRejectionMessage(
    ApiBaseUrlValidationReason? reason,
  ) =>
        switch (reason) {
          ApiBaseUrlValidationReason.empty =>
            'No se pudo guardar la URL: escriba la dirección del servidor.',
          ApiBaseUrlValidationReason.whitespace =>
            'No se pudo guardar la URL: no debe contener espacios.',
          ApiBaseUrlValidationReason.notAbsolute =>
            'No es una URL válida. Use una dirección completa que empiece por '
            'http:// o https:// y tenga un servidor definido '
            '(por ejemplo: https://api-staging.example.com/api).',
          null => 'No se pudo guardar la URL: el servidor no es válido.',
        };
}
